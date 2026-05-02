// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20, SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

interface IHiveRewards {
    function settle(address user) external;
    function commitWeight(address user) external;
    function notifyStakeChange(address user) external;
    function forfeit(address user) external returns (uint256 hiveAmt, uint256 ethAmt);
    function claim(address user, address to) external returns (uint256 hiveAmt, uint256 ethAmt);
    function pendingHive(address user) external view returns (uint256);
    function pendingEth(address user) external view returns (uint256);
}

/// @title HiveStaking
/// @notice Stake $HIVE with a short lockup (24h–7d) for a reward multiplier.
///         Unstaking before the lock matures forfeits accrued rewards back to
///         remaining stakers.
///
/// New in this revision (audit fixes — see docs/SECURITY.md):
///  * Vote integrity: HiveGovernor can extend a per-user `voteFreezeUntil`
///    that blocks `unstake` while at least one open vote exists. Stops the
///    "vote-then-walk" attack where a user voted then unstaked principal
///    (forfeiting only rewards) while their vote weight remained tallied.
///  * Single `_unstake(address)` body shared by both overloads (collapsed
///    duplicate logic — H-G3).
///  * Custom errors throughout for gas + bytecode reduction.
///  * `stakeWithPermit` swallows a benign permit revert and falls through to
///    `_stake` if allowance is already sufficient.
contract HiveStaking is Ownable2Step, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    uint256 public constant MIN_LOCK = 24 hours;
    uint256 public constant MID_LOCK = 3 days;
    uint256 public constant MAX_LOCK = 7 days;

    uint256 public constant MULT_24H = 10_000;
    uint256 public constant MULT_3D = 12_000;
    uint256 public constant MULT_7D = 15_000;

    address public constant DEAD = 0x000000000000000000000000000000000000dEaD;

    IERC20 public immutable hive;
    IHiveRewards public rewards;
    /// @notice The HiveGovernor — set once, the only address allowed to extend
    ///         per-user vote freezes. Can stay zero in tests / deployments
    ///         that don't use the governor; vote freezes simply never fire.
    address public governor;

    struct Stake {
        uint128 amount;
        uint64 lockEnd;
        uint64 lockDuration;
    }

    mapping(address => Stake) public stakes;

    /// @notice Earliest unix timestamp at which `user` may unstake. Extended
    ///         (never shortened) by HiveGovernor when the user casts a vote
    ///         to ensure their voting weight remains fully collateralised
    ///         until every open vote they cast has closed.
    mapping(address => uint64) public voteFreezeUntil;

    uint256 public totalStaked;
    uint256 public totalWeighted;
    bool public deadSeeded;

    error AmountZero();
    error AmountTooLarge();
    error LockTooShort();
    error LockTooLong();
    error CannotShortenLock();
    error RewardsUnset();
    error RewardsAlreadySet();
    error GovernorAlreadySet();
    error AddressZero();
    error DeadReserved();
    error NoStake();
    error AlreadySeeded();
    error NotGovernor();
    error VoteFreezeActive(uint64 until);

    event Staked(address indexed user, uint256 amount, uint256 lockDuration, uint256 lockEnd);
    event Unstaked(address indexed user, uint256 amount, bool earnedRewards);
    event RewardsContractSet(address indexed rewards);
    event GovernorSet(address indexed governor);
    event DeadWeightSeeded(uint256 amount, uint256 weight);
    event VoteFreezeExtended(address indexed user, uint64 until);

    constructor(address initialOwner, address _hive) Ownable(initialOwner) {
        if (_hive == address(0)) revert AddressZero();
        hive = IERC20(_hive);
    }

    // ─────────────────────────── Admin ───────────────────────────

    /// @notice One-shot wire-up of the rewards contract.
    function setRewards(address _rewards) external onlyOwner {
        if (address(rewards) != address(0)) revert RewardsAlreadySet();
        if (_rewards == address(0)) revert AddressZero();
        rewards = IHiveRewards(_rewards);
        emit RewardsContractSet(_rewards);
    }

    /// @notice One-shot wire-up of the governor. Only the governor may extend
    ///         `voteFreezeUntil`. Optional — if never set, freezes don't fire
    ///         and the staking contract is functionally unchanged.
    function setGovernor(address _governor) external onlyOwner {
        if (governor != address(0)) revert GovernorAlreadySet();
        if (_governor == address(0)) revert AddressZero();
        governor = _governor;
        emit GovernorSet(_governor);
    }

    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    // ─────────────────────── Vote-integrity hook ───────────────────────

    /// @notice Called by HiveGovernor on every vote to extend the user's
    ///         unstake-freeze window. Only ever moves forward — earlier
    ///         freezes are no-ops.
    function freezeUntil(address user, uint64 until) external {
        if (msg.sender != governor) revert NotGovernor();
        if (until > voteFreezeUntil[user]) {
            voteFreezeUntil[user] = until;
            emit VoteFreezeExtended(user, until);
        }
    }

    // ─────────────────────────── Math ───────────────────────────

    function multiplierFor(uint256 lockDuration) public pure returns (uint256) {
        if (lockDuration >= MAX_LOCK) return MULT_7D;
        if (lockDuration >= MID_LOCK) return MULT_3D;
        if (lockDuration >= MIN_LOCK) return MULT_24H;
        revert LockTooShort();
    }

    function weightOf(address user) public view returns (uint256) {
        return _weightOf(stakes[user]);
    }

    function _weightOf(Stake memory s) internal pure returns (uint256) {
        if (s.amount == 0) return 0;
        return (uint256(s.amount) * multiplierFor(s.lockDuration)) / 10_000;
    }

    // ─────────────────────────── Seed ───────────────────────────

    /// @notice MINIMUM_LIQUIDITY-style seed. Pulls `amount` HIVE from the
    ///         caller and registers a permanent stake to `DEAD`. Defeats the
    ///         first-staker donation sandwich on the rewards accumulator.
    function seedDeadWeight(uint256 amount) external onlyOwner {
        if (deadSeeded) revert AlreadySeeded();
        if (amount == 0) revert AmountZero();
        if (address(rewards) == address(0)) revert RewardsUnset();
        deadSeeded = true;

        uint256 received = _pullHive(msg.sender, amount);
        if (received > type(uint128).max) revert AmountTooLarge();

        Stake storage s = stakes[DEAD];
        s.amount = uint128(received);
        s.lockEnd = type(uint64).max;
        s.lockDuration = uint64(MAX_LOCK);
        uint256 weight = (received * MULT_7D) / 10_000;

        totalStaked += received;
        totalWeighted += weight;

        rewards.commitWeight(DEAD);
        emit DeadWeightSeeded(received, weight);
    }

    // ─────────────────────────── Stake ───────────────────────────

    function stake(uint256 amount, uint256 lockDuration) external nonReentrant whenNotPaused {
        _stake(msg.sender, amount, lockDuration);
    }

    /// @notice Stake using an EIP-2612 permit signature in the same tx.
    ///         If `permit` reverts but `allowance >= amount` already, the
    ///         stake still proceeds (saves a tx when the user is already
    ///         approved or someone front-runs the permit).
    function stakeWithPermit(
        uint256 amount,
        uint256 lockDuration,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s_
    ) external nonReentrant whenNotPaused {
        try IERC20Permit(address(hive)).permit(msg.sender, address(this), amount, deadline, v, r, s_) {
            // ok
        } catch {
            // permit failed (already approved / front-run / replay) — fall
            // through if existing allowance can cover the stake.
            if (hive.allowance(msg.sender, address(this)) < amount) {
                revert(); // re-raise; safeTransferFrom would fail anyway
            }
        }
        _stake(msg.sender, amount, lockDuration);
    }

    function _stake(address user, uint256 amount, uint256 lockDuration) internal {
        if (amount == 0) revert AmountZero();
        if (amount > type(uint128).max) revert AmountTooLarge();
        if (lockDuration > MAX_LOCK) revert LockTooLong();
        if (address(rewards) == address(0)) revert RewardsUnset();
        if (user == DEAD) revert DeadReserved();

        // multiplierFor reverts with LockTooShort if < MIN_LOCK
        multiplierFor(lockDuration);

        Stake memory sMem = stakes[user];
        uint256 oldWeight = _weightOf(sMem);

        if (sMem.amount > 0) {
            if (lockDuration < sMem.lockDuration && block.timestamp < sMem.lockEnd) {
                revert CannotShortenLock();
            }
        }

        rewards.settle(user);

        uint256 received = _pullHive(user, amount);
        if (received > type(uint128).max) revert AmountTooLarge();

        uint128 newAmount = sMem.amount + uint128(received);
        uint64 newEnd = uint64(block.timestamp + lockDuration);
        if (newEnd < sMem.lockEnd) newEnd = sMem.lockEnd;

        uint256 effective = newEnd - block.timestamp;
        if (effective > MAX_LOCK) effective = MAX_LOCK;
        uint256 mult = multiplierFor(effective);

        Stake storage s = stakes[user];
        s.amount = newAmount;
        s.lockEnd = newEnd;
        s.lockDuration = uint64(effective);

        uint256 newWeight = (uint256(newAmount) * mult) / 10_000;

        totalStaked += received;
        // newWeight - oldWeight could underflow only if oldWeight > newWeight.
        // newAmount > sMem.amount and effective tier >= old tier (we just
        // checked CannotShortenLock), so newWeight >= oldWeight. Safe.
        unchecked {
            totalWeighted = totalWeighted + newWeight - oldWeight;
        }

        rewards.commitWeight(user);
        emit Staked(user, received, effective, newEnd);
    }

    // ─────────────────────────── Unstake ───────────────────────────

    /// @notice Unstake all. Before lock matures, rewards are forfeited.
    ///         If `voteFreezeUntil[msg.sender] > now`, the call reverts —
    ///         the user has open votes whose weight must remain committed.
    /// @param  ethRecipient  Where matured-claim ETH should be sent. Pass
    ///                       address(0) to default to msg.sender.
    function unstake(address ethRecipient) external nonReentrant {
        _unstake(ethRecipient);
    }

    /// @notice ETH defaults to msg.sender.
    function unstake() external nonReentrant {
        _unstake(address(0));
    }

    function _unstake(address ethRecipient) internal {
        address user = msg.sender;
        if (user == DEAD) revert DeadReserved();

        uint64 freezeUntilTs = voteFreezeUntil[user];
        if (freezeUntilTs > block.timestamp) revert VoteFreezeActive(freezeUntilTs);

        Stake memory s = stakes[user];
        if (s.amount == 0) revert NoStake();

        bool earned = block.timestamp >= s.lockEnd;
        uint256 weight = _weightOf(s);

        // Settle pending under the OLD weight first.
        rewards.settle(user);

        // Remove weight FIRST so forfeit redistributes only across remaining
        // stakers with no dilution wasted on the leaver.
        delete stakes[user];
        // Both subs are safe by invariant: this user's amount/weight were
        // previously added to these totals.
        unchecked {
            totalStaked -= s.amount;
            totalWeighted -= weight;
        }

        if (earned) {
            address to = ethRecipient == address(0) ? user : ethRecipient;
            rewards.claim(user, to);
        } else {
            rewards.forfeit(user);
        }

        rewards.commitWeight(user);
        hive.safeTransfer(user, s.amount);
        emit Unstaked(user, s.amount, earned);
    }

    /// @notice Claim accrued rewards without unstaking. Only callable after
    ///         the lock matures.
    function claim(address to) external nonReentrant whenNotPaused returns (uint256 hiveAmt, uint256 ethAmt) {
        if (msg.sender == DEAD) revert DeadReserved();
        Stake memory s = stakes[msg.sender];
        if (s.amount == 0) revert NoStake();
        if (block.timestamp < s.lockEnd) revert LockTooShort();
        rewards.notifyStakeChange(msg.sender);
        return rewards.claim(msg.sender, to == address(0) ? msg.sender : to);
    }

    // ─────────────────────────── Views ───────────────────────────

    function pendingHive(address user) external view returns (uint256) {
        if (stakes[user].lockEnd > block.timestamp) return 0;
        return rewards.pendingHive(user);
    }

    function pendingEth(address user) external view returns (uint256) {
        if (stakes[user].lockEnd > block.timestamp) return 0;
        return rewards.pendingEth(user);
    }

    /// @notice Effective weighted stake — `totalWeighted` minus the dead-seed
    ///         floor. This is what the UI should show for "weighted stake"
    ///         metrics so the burn floor doesn't pollute live numbers.
    function effectiveWeighted() external view returns (uint256) {
        uint256 deadW = _weightOf(stakes[DEAD]);
        return totalWeighted > deadW ? totalWeighted - deadW : 0;
    }

    // ─────────────────────────── Internal ───────────────────────────

    /// @dev Pulls HIVE from `from` and returns the actual received delta.
    function _pullHive(address from, uint256 amount) internal returns (uint256) {
        uint256 before = hive.balanceOf(address(this));
        hive.safeTransferFrom(from, address(this), amount);
        return hive.balanceOf(address(this)) - before;
    }
}
