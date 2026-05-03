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
    function claim(address user, address to) external returns (uint256 hiveAmt, uint256 ethAmt);
    function pendingHive(address user) external view returns (uint256);
    function pendingEth(address user) external view returns (uint256);
}

/// @title HiveStaking (no-lock model)
/// @notice Stake any amount of $HIVE, unstake any amount, any time. Stake is
///         the entry ticket to participate in governance — votes and
///         community proposals are gated on a positive stake at action time.
///         There are no lock tiers, no early-exit forfeits, and no time-based
///         multipliers. Voting power is `amount` 1:1.
///
/// Rewards are not distributed continuously. The rewards contract advances
/// its accumulator only when the multisig calls `distributeLaunchPool` —
/// typically once a project hits its LAUNCH stage. See HiveRewards.sol.
///
/// Vote integrity: when HiveGovernor records a vote it extends the voter's
/// `voteFreezeUntil`; `unstake` reverts while the freeze is active so the
/// voter cannot cast a vote then exit principal in the same window. This
/// closes the "vote and walk" attack without imposing a default lock.
contract HiveStaking is Ownable2Step, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    address public constant DEAD = 0x000000000000000000000000000000000000dEaD;

    IERC20 public immutable hive;
    IHiveRewards public rewards;
    /// @notice The HiveGovernor — set once. Only it may extend per-user vote
    ///         freezes. May stay zero in tests / deployments without governor.
    address public governor;

    struct Stake {
        uint128 amount;
        uint64 firstStakeAt; // earliest unbroken stake — sandwich defense
    }

    mapping(address => Stake) public stakes;

    /// @notice Earliest unix timestamp at which `user` may unstake. Extended
    ///         (never shortened) by HiveGovernor on every vote so the
    ///         voter's stake remains committed until each open vote closes.
    mapping(address => uint64) public voteFreezeUntil;

    uint256 public totalStaked;
    bool public deadSeeded;

    error AmountZero();
    error AmountTooLarge();
    error InsufficientStake();
    error RewardsUnset();
    error RewardsAlreadySet();
    error GovernorAlreadySet();
    error AddressZero();
    error DeadReserved();
    error NoStake();
    error AlreadySeeded();
    error NotGovernor();
    error VoteFreezeActive(uint64 until);

    event Staked(address indexed user, uint256 amount, uint256 newAmount);
    event Unstaked(address indexed user, uint256 amount, uint256 newAmount);
    event RewardsContractSet(address indexed rewards);
    event GovernorSet(address indexed governor);
    event DeadWeightSeeded(uint256 amount);
    event VoteFreezeExtended(address indexed user, uint64 until);

    constructor(address initialOwner, address _hive) Ownable(initialOwner) {
        if (_hive == address(0)) revert AddressZero();
        hive = IERC20(_hive);
    }

    // ─────────────────────────── Admin ───────────────────────────

    function setRewards(address _rewards) external onlyOwner {
        if (address(rewards) != address(0)) revert RewardsAlreadySet();
        if (_rewards == address(0)) revert AddressZero();
        rewards = IHiveRewards(_rewards);
        emit RewardsContractSet(_rewards);
    }

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
    ///         unstake-freeze window. Only ever moves forward.
    function freezeUntil(address user, uint64 until) external {
        if (msg.sender != governor) revert NotGovernor();
        if (until > voteFreezeUntil[user]) {
            voteFreezeUntil[user] = until;
            emit VoteFreezeExtended(user, until);
        }
    }

    // ─────────────────────────── Views ───────────────────────────

    /// @notice Voting weight = staked amount (1:1, no multipliers).
    function weightOf(address user) public view returns (uint256) {
        return stakes[user].amount;
    }

    function totalWeighted() external view returns (uint256) {
        return totalStaked;
    }

    /// @notice Effective weighted stake — total minus the dead-seed floor.
    ///         Use this for any user-facing TVL / weighted metric.
    function effectiveWeighted() external view returns (uint256) {
        uint256 deadAmount = stakes[DEAD].amount;
        return totalStaked > deadAmount ? totalStaked - deadAmount : 0;
    }

    function firstStakeAt(address user) external view returns (uint64) {
        return stakes[user].firstStakeAt;
    }

    // ─────────────────────────── Seed ───────────────────────────

    /// @notice MINIMUM_LIQUIDITY-style seed. Pulls `amount` HIVE and
    ///         registers a permanent stake to `DEAD`. Defeats the
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
        s.firstStakeAt = uint64(block.timestamp);

        totalStaked += received;
        rewards.commitWeight(DEAD);
        emit DeadWeightSeeded(received);
    }

    // ─────────────────────────── Stake ───────────────────────────

    function stake(uint256 amount) external nonReentrant whenNotPaused {
        _stake(msg.sender, amount);
    }

    /// @notice Stake using an EIP-2612 permit signature in the same tx. If
    ///         the permit reverts but allowance is already sufficient, falls
    ///         through to the deposit (front-run / replay tolerant).
    function stakeWithPermit(
        uint256 amount,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s_
    ) external nonReentrant whenNotPaused {
        try IERC20Permit(address(hive)).permit(msg.sender, address(this), amount, deadline, v, r, s_) {
            // ok
        } catch {
            if (hive.allowance(msg.sender, address(this)) < amount) revert();
        }
        _stake(msg.sender, amount);
    }

    function _stake(address user, uint256 amount) internal {
        if (amount == 0) revert AmountZero();
        if (amount > type(uint128).max) revert AmountTooLarge();
        if (address(rewards) == address(0)) revert RewardsUnset();
        if (user == DEAD) revert DeadReserved();

        Stake storage s = stakes[user];

        // Settle pending under the OLD weight before mutating.
        rewards.settle(user);

        uint256 received = _pullHive(user, amount);
        if (received > type(uint128).max) revert AmountTooLarge();
        if (uint256(s.amount) + received > type(uint128).max) revert AmountTooLarge();

        // Track the earliest *continuous* stake time. Topping up an
        // existing position keeps the original stamp; a fresh stake after
        // a full exit resets the clock.
        if (s.amount == 0) {
            s.firstStakeAt = uint64(block.timestamp);
        }
        s.amount = uint128(uint256(s.amount) + received);
        totalStaked += received;

        rewards.commitWeight(user);
        emit Staked(user, received, s.amount);
    }

    // ─────────────────────────── Unstake ───────────────────────────

    /// @notice Unstake any amount up to the staker's balance. Blocked while
    ///         the user has open votes (vote-freeze active).
    /// @param  amount  amount of HIVE to withdraw. Must be > 0 and ≤ stake.
    function unstake(uint256 amount) external nonReentrant {
        _unstake(msg.sender, amount);
    }

    /// @notice Convenience: unstake the entire balance.
    function unstakeAll() external nonReentrant {
        Stake memory s = stakes[msg.sender];
        if (s.amount == 0) revert NoStake();
        _unstake(msg.sender, s.amount);
    }

    function _unstake(address user, uint256 amount) internal {
        if (user == DEAD) revert DeadReserved();
        if (amount == 0) revert AmountZero();

        uint64 freezeUntilTs = voteFreezeUntil[user];
        if (freezeUntilTs > block.timestamp) revert VoteFreezeActive(freezeUntilTs);

        Stake storage s = stakes[user];
        if (s.amount == 0) revert NoStake();
        if (amount > s.amount) revert InsufficientStake();

        // Settle pending under the OLD weight first.
        rewards.settle(user);

        // Decrease balance in storage. Both subs are safe by invariant.
        unchecked {
            s.amount = uint128(uint256(s.amount) - amount);
            totalStaked -= amount;
        }
        if (s.amount == 0) {
            s.firstStakeAt = 0; // reset clock — next stake starts fresh
        }

        rewards.commitWeight(user);
        hive.safeTransfer(user, amount);
        emit Unstaked(user, amount, s.amount);
    }

    /// @notice Claim accrued rewards without unstaking. Always callable for
    ///         a positive stake — rewards only ever accrue when the
    ///         multisig calls HiveRewards.distributeLaunchPool, so there's
    ///         no continuous yield to time.
    function claim(address to) external nonReentrant whenNotPaused returns (uint256 hiveAmt, uint256 ethAmt) {
        if (msg.sender == DEAD) revert DeadReserved();
        if (stakes[msg.sender].amount == 0) revert NoStake();
        rewards.notifyStakeChange(msg.sender);
        return rewards.claim(msg.sender, to == address(0) ? msg.sender : to);
    }

    function pendingHive(address user) external view returns (uint256) {
        return rewards.pendingHive(user);
    }

    function pendingEth(address user) external view returns (uint256) {
        return rewards.pendingEth(user);
    }

    // ─────────────────────────── Internal ───────────────────────────

    function _pullHive(address from, uint256 amount) internal returns (uint256) {
        uint256 before = hive.balanceOf(address(this));
        hive.safeTransferFrom(from, address(this), amount);
        return hive.balanceOf(address(this)) - before;
    }
}
