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
/// Each user holds a single active stake. Top-ups are allowed and the lock
/// end always extends, never retreats. Tier downgrades require the existing
/// lock to elapse first.
///
/// Defences in this contract:
///  * `Pausable` halts new stakes / claims; `unstake` is intentionally always
///    available so users are never trapped (forfeit rule still applies).
///  * `Ownable2Step` for owner transfer; `setRewards` is one-shot.
///  * Fee-on-transfer-safe deposit: the contract credits the *received* delta,
///    not the requested amount, so a future tax flip cannot break accounting.
///  * MINIMUM_LIQUIDITY-style dead weight (seeded once at launch) defeats the
///    first-staker donation sandwich on the rewards accumulator.
///  * Lock cap: `lockDuration > MAX_LOCK` reverts; users staking 5y by mistake
///    cannot create a low-multiplier-long-lock foot-gun.
contract HiveStaking is Ownable2Step, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    uint256 public constant MIN_LOCK = 24 hours;
    uint256 public constant MID_LOCK = 3 days;
    uint256 public constant MAX_LOCK = 7 days;

    /// @notice Multipliers in basis points (1.0x = 10_000)
    uint256 public constant MULT_24H = 10_000;
    uint256 public constant MULT_3D = 12_000;
    uint256 public constant MULT_7D = 15_000;

    /// @notice Sentinel address holding the seed dead-weight position.
    address public constant DEAD = 0x000000000000000000000000000000000000dEaD;

    IERC20 public immutable hive;
    IHiveRewards public rewards;

    struct Stake {
        uint128 amount;       // raw HIVE staked
        uint64 lockEnd;       // unix timestamp when lock expires
        uint64 lockDuration;  // effective remaining-lock at last mutation; defines tier
    }

    mapping(address => Stake) public stakes;

    uint256 public totalStaked;       // raw sum of stake.amount (incl. dead seed)
    uint256 public totalWeighted;     // sum of amount * multiplier / BPS
    bool public deadSeeded;           // one-shot guard for seedDeadWeight

    event Staked(address indexed user, uint256 amount, uint256 lockDuration, uint256 lockEnd);
    event Unstaked(address indexed user, uint256 amount, bool earnedRewards);
    event RewardsContractSet(address indexed rewards);
    event DeadWeightSeeded(uint256 amount, uint256 weight);

    constructor(address initialOwner, address _hive) Ownable(initialOwner) {
        require(_hive != address(0), "hive=0");
        hive = IERC20(_hive);
    }

    /// @notice One-shot wire-up of the rewards contract.
    function setRewards(address _rewards) external onlyOwner {
        require(address(rewards) == address(0), "rewards already set");
        require(_rewards != address(0), "rewards=0");
        rewards = IHiveRewards(_rewards);
        emit RewardsContractSet(_rewards);
    }

    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    /// @notice Multiplier (in BPS) for a given lock duration.
    function multiplierFor(uint256 lockDuration) public pure returns (uint256) {
        if (lockDuration >= MAX_LOCK) return MULT_7D;
        if (lockDuration >= MID_LOCK) return MULT_3D;
        if (lockDuration >= MIN_LOCK) return MULT_24H;
        revert("lock too short");
    }

    function weightOf(address user) public view returns (uint256) {
        Stake memory s = stakes[user];
        if (s.amount == 0) return 0;
        return (uint256(s.amount) * multiplierFor(s.lockDuration)) / 10_000;
    }

    /// @notice Owner-only, one-shot. Pulls `amount` HIVE from the caller and
    ///         registers a permanent stake to `DEAD` at the maximum multiplier.
    ///         The position cannot be unstaked. This dilutes any pre-stake
    ///         donation to the rewards contract over a non-trivial weight,
    ///         defeating the first-staker sandwich attack.
    function seedDeadWeight(uint256 amount) external onlyOwner {
        require(!deadSeeded, "already seeded");
        require(amount > 0, "amount=0");
        require(address(rewards) != address(0), "rewards unset");
        deadSeeded = true;

        uint256 received = _pullHive(msg.sender, amount);
        require(received <= type(uint128).max, "amount too large");

        Stake storage s = stakes[DEAD];
        s.amount = uint128(received);
        s.lockEnd = type(uint64).max;       // effectively forever
        s.lockDuration = uint64(MAX_LOCK);  // top tier
        uint256 weight = (received * MULT_7D) / 10_000;

        totalStaked += received;
        totalWeighted += weight;

        // Snap dead's debt so the seed never accrues claimable rewards.
        rewards.commitWeight(DEAD);

        emit DeadWeightSeeded(received, weight);
    }

    /// @notice Stake `amount` HIVE for `lockDuration` seconds.
    function stake(uint256 amount, uint256 lockDuration) external nonReentrant whenNotPaused {
        _stake(msg.sender, amount, lockDuration);
    }

    /// @notice Stake using an EIP-2612 permit signature in the same tx.
    function stakeWithPermit(
        uint256 amount,
        uint256 lockDuration,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s_
    ) external nonReentrant whenNotPaused {
        IERC20Permit(address(hive)).permit(msg.sender, address(this), amount, deadline, v, r, s_);
        _stake(msg.sender, amount, lockDuration);
    }

    function _stake(address user, uint256 amount, uint256 lockDuration) internal {
        require(amount > 0, "amount=0");
        require(amount <= type(uint128).max, "amount too large");
        require(lockDuration <= MAX_LOCK, "lock too long");
        require(address(rewards) != address(0), "rewards unset");
        require(user != DEAD, "dead reserved");

        // multiplierFor reverts if lock < MIN_LOCK
        multiplierFor(lockDuration);

        Stake storage s = stakes[user];
        uint256 oldWeight = s.amount == 0
            ? 0
            : (uint256(s.amount) * multiplierFor(s.lockDuration)) / 10_000;

        if (s.amount > 0) {
            // Disallow shortening tier while still locked.
            require(lockDuration >= s.lockDuration || block.timestamp >= s.lockEnd, "cannot shorten lock");
        }

        // Settle pending under the OLD weight before mutating.
        rewards.settle(user);

        // Pull tokens with FoT-safe accounting: credit only what we received.
        uint256 received = _pullHive(user, amount);
        require(received <= type(uint128).max, "received too large");

        uint128 newAmount = s.amount + uint128(received);
        uint64 newEnd = uint64(block.timestamp + lockDuration);
        if (newEnd < s.lockEnd) newEnd = s.lockEnd;

        // Effective remaining lock = newEnd - now. The multiplier tracks the
        // *real* remaining lock so a top-up at a lower nominal tier does not
        // silently downgrade a still-locked higher tier.
        uint256 effective = newEnd - block.timestamp;
        if (effective > MAX_LOCK) effective = MAX_LOCK;
        uint256 mult = multiplierFor(effective);

        s.amount = newAmount;
        s.lockEnd = newEnd;
        s.lockDuration = uint64(effective);

        uint256 newWeight = (uint256(newAmount) * mult) / 10_000;

        totalStaked += received;
        totalWeighted = totalWeighted + newWeight - oldWeight;

        rewards.commitWeight(user);

        emit Staked(user, received, effective, newEnd);
    }

    /// @notice Unstake all. Before lock matures, rewards are forfeited.
    /// @param ethRecipient  Where matured-claim ETH should be sent. Pass
    ///                      address(0) to default to msg.sender. Use this to
    ///                      route ETH to an EOA when staking from a smart
    ///                      wallet that rejects raw ETH.
    function unstake(address ethRecipient) external nonReentrant {
        require(msg.sender != DEAD, "dead reserved");
        Stake memory s = stakes[msg.sender];
        require(s.amount > 0, "no stake");

        bool earned = block.timestamp >= s.lockEnd;
        uint256 weight = (uint256(s.amount) * multiplierFor(s.lockDuration)) / 10_000;

        // Always settle pending using the OLD weight first so the user's
        // share of unsynced fees is recognised before we forfeit / claim.
        rewards.settle(msg.sender);

        // Remove weight FIRST — this way `forfeit` redistributes only to the
        // remaining stakers, with no dilution wasted on the leaver's slot.
        delete stakes[msg.sender];
        totalStaked -= s.amount;
        totalWeighted -= weight;

        if (earned) {
            address to = ethRecipient == address(0) ? msg.sender : ethRecipient;
            rewards.claim(msg.sender, to);
        } else {
            rewards.forfeit(msg.sender);
        }

        // Snap debt to the new (zero) weight.
        rewards.commitWeight(msg.sender);

        hive.safeTransfer(msg.sender, s.amount);
        emit Unstaked(msg.sender, s.amount, earned);
    }

    /// @notice Backwards-compatible default: ETH goes to msg.sender.
    function unstake() external nonReentrant {
        // Inline rather than re-enter — keeps a single nonReentrant frame.
        require(msg.sender != DEAD, "dead reserved");
        Stake memory s = stakes[msg.sender];
        require(s.amount > 0, "no stake");

        bool earned = block.timestamp >= s.lockEnd;
        uint256 weight = (uint256(s.amount) * multiplierFor(s.lockDuration)) / 10_000;

        rewards.settle(msg.sender);
        delete stakes[msg.sender];
        totalStaked -= s.amount;
        totalWeighted -= weight;

        if (earned) {
            rewards.claim(msg.sender, msg.sender);
        } else {
            rewards.forfeit(msg.sender);
        }

        rewards.commitWeight(msg.sender);
        hive.safeTransfer(msg.sender, s.amount);
        emit Unstaked(msg.sender, s.amount, earned);
    }

    /// @notice Claim accrued rewards without unstaking. Only callable after the
    ///         lock matures.
    function claim(address to) external nonReentrant whenNotPaused returns (uint256 hiveAmt, uint256 ethAmt) {
        require(msg.sender != DEAD, "dead reserved");
        Stake memory s = stakes[msg.sender];
        require(s.amount > 0, "no stake");
        require(block.timestamp >= s.lockEnd, "still locked");
        rewards.notifyStakeChange(msg.sender);
        return rewards.claim(msg.sender, to == address(0) ? msg.sender : to);
    }

    function pendingHive(address user) external view returns (uint256) {
        if (stakes[user].lockEnd > block.timestamp) return 0;
        return rewards.pendingHive(user);
    }

    function pendingEth(address user) external view returns (uint256) {
        if (stakes[user].lockEnd > block.timestamp) return 0;
        return rewards.pendingEth(user);
    }

    /// @dev Pulls HIVE from `from` and returns the actual received amount,
    ///      which differs from `amount` only if a transfer-tax is ever applied
    ///      to this contract. Today the token tax-exempts staking by default,
    ///      so received == amount.
    function _pullHive(address from, uint256 amount) internal returns (uint256) {
        uint256 before = hive.balanceOf(address(this));
        hive.safeTransferFrom(from, address(this), amount);
        return hive.balanceOf(address(this)) - before;
    }
}
