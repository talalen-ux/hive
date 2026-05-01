// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20, SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

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
/// @notice Stake $HIVE with a short lockup (24h min, up to 7d) for a reward multiplier.
///         Unstaking before the minimum lock forfeits any accrued rewards for that stake.
///
/// Each user can hold a single active stake. Stacking on top of an existing stake is allowed
/// and pulls forward the lock end (extends, never shortens). Tier downgrades require the
/// existing lock to elapse first; upgrades to a longer tier are always allowed.
contract HiveStaking is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant MIN_LOCK = 24 hours;
    uint256 public constant MAX_LOCK = 7 days;
    uint256 public constant MID_LOCK = 3 days;

    /// @notice Multipliers in basis points (1.0x = 10_000)
    uint256 public constant MULT_24H = 10_000;
    uint256 public constant MULT_3D = 12_000;
    uint256 public constant MULT_7D = 15_000;

    IERC20 public immutable hive;
    IHiveRewards public rewards;

    struct Stake {
        uint128 amount;       // raw HIVE staked
        uint64 lockEnd;       // unix timestamp when lock expires
        uint64 lockDuration;  // seconds; defines tier
    }

    mapping(address => Stake) public stakes;

    uint256 public totalStaked;       // raw sum of stake.amount
    uint256 public totalWeighted;     // sum of amount * multiplier / BPS

    event Staked(address indexed user, uint256 amount, uint256 lockDuration, uint256 lockEnd);
    event Unstaked(address indexed user, uint256 amount, bool earnedRewards);
    event RewardsContractSet(address indexed rewards);

    constructor(address initialOwner, address _hive) Ownable(initialOwner) {
        require(_hive != address(0), "hive=0");
        hive = IERC20(_hive);
    }

    function setRewards(address _rewards) external onlyOwner {
        require(_rewards != address(0), "rewards=0");
        rewards = IHiveRewards(_rewards);
        emit RewardsContractSet(_rewards);
    }

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

    /// @notice Stake `amount` HIVE for `lockDuration` seconds.
    function stake(uint256 amount, uint256 lockDuration) external nonReentrant {
        require(amount > 0, "amount=0");
        require(address(rewards) != address(0), "rewards unset");
        uint256 mult = multiplierFor(lockDuration);

        Stake storage s = stakes[msg.sender];

        // Settle pending rewards under the OLD weight before mutating.
        rewards.settle(msg.sender);

        uint256 oldWeight = s.amount == 0
            ? 0
            : (uint256(s.amount) * multiplierFor(s.lockDuration)) / 10_000;

        if (s.amount > 0) {
            // Disallow shortening tier while still locked.
            require(lockDuration >= s.lockDuration || block.timestamp >= s.lockEnd, "cannot shorten lock");
        }

        hive.safeTransferFrom(msg.sender, address(this), amount);

        uint128 newAmount = s.amount + uint128(amount);
        uint64 newEnd = uint64(block.timestamp + lockDuration);
        // Lock end always extends, never retreats.
        if (newEnd < s.lockEnd) newEnd = s.lockEnd;

        s.amount = newAmount;
        s.lockEnd = newEnd;
        s.lockDuration = uint64(lockDuration);

        uint256 newWeight = (uint256(newAmount) * mult) / 10_000;

        totalStaked += amount;
        totalWeighted = totalWeighted + newWeight - oldWeight;

        // Snap debt to the new weight so future fees credit correctly.
        rewards.commitWeight(msg.sender);

        emit Staked(msg.sender, amount, lockDuration, newEnd);
    }

    /// @notice Unstake all. Before MIN_LOCK elapses on this stake, rewards are forfeited.
    function unstake() external nonReentrant {
        Stake memory s = stakes[msg.sender];
        require(s.amount > 0, "no stake");

        bool earned = block.timestamp >= s.lockEnd;
        uint256 weight = (uint256(s.amount) * multiplierFor(s.lockDuration)) / 10_000;

        // Always settle pending using the OLD weight first.
        rewards.settle(msg.sender);

        if (earned) {
            rewards.claim(msg.sender, msg.sender);
        } else {
            // Recycle pending back into the accumulator for remaining stakers.
            rewards.forfeit(msg.sender);
        }

        delete stakes[msg.sender];
        totalStaked -= s.amount;
        totalWeighted -= weight;

        // Snap debt to the new (zero) weight.
        rewards.commitWeight(msg.sender);

        hive.safeTransfer(msg.sender, s.amount);
        emit Unstaked(msg.sender, s.amount, earned);
    }

    /// @notice Claim accrued rewards without unstaking. Only callable after MIN_LOCK.
    function claim(address to) external nonReentrant returns (uint256 hiveAmt, uint256 ethAmt) {
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
}
