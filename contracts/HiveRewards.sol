// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20, SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IStakingView {
    function weightOf(address user) external view returns (uint256);
    function totalWeighted() external view returns (uint256);
}

/// @title HiveRewards
/// @notice Pull-based reward distributor for stakers. Tracks two reward streams:
///         HIVE (from token transfer tax) and ETH (from LP/protocol fees).
///
/// Uses the classic MasterChef-style accumulator: `accPerWeight` advances by
/// `incoming * 1e18 / totalWeighted`, and each user's pending balance is
/// `weight * (accPerWeight - userDebt) / 1e18`.
///
/// Forfeits: when `notifyStakeChange` is called by the staking contract before the
/// user's lock has matured, accrued rewards are zeroed (handed back to the pool by
/// simply not crediting the user). This implements the "no rewards if unstaked early"
/// rule from the Hive spec.
contract HiveRewards is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 internal constant ACC_PRECISION = 1e18;

    IERC20 public immutable hive;
    address public staking;
    address public vault; // NectarVault — allowed to push deposits

    uint256 public accHivePerWeight;
    uint256 public accEthPerWeight;

    struct UserInfo {
        uint256 hiveDebt;
        uint256 ethDebt;
        uint256 pendingHive;
        uint256 pendingEth;
    }
    mapping(address => UserInfo) public users;

    /// @notice Total HIVE/ETH the contract has received over its lifetime — useful for analytics.
    uint256 public totalHiveDistributed;
    uint256 public totalEthDistributed;

    event StakingSet(address indexed staking);
    event VaultSet(address indexed vault);
    event RewardAdded(uint256 hiveAmount, uint256 ethAmount);
    event Claimed(address indexed user, address indexed to, uint256 hiveAmount, uint256 ethAmount);
    event Forfeited(address indexed user, uint256 hiveAmount, uint256 ethAmount);

    modifier onlyStaking() {
        require(msg.sender == staking, "not staking");
        _;
    }

    constructor(address initialOwner, address _hive) Ownable(initialOwner) {
        require(_hive != address(0), "hive=0");
        hive = IERC20(_hive);
    }

    receive() external payable {
        // Accept ETH directly (e.g. from NectarVault.harvest()) and account it on next sync.
        // We sync lazily in `sync()` — receive() is intentionally minimal so transfers from
        // EOAs and contracts both succeed even at low gas budgets.
    }

    function setStaking(address _staking) external onlyOwner {
        require(_staking != address(0), "staking=0");
        staking = _staking;
        emit StakingSet(_staking);
    }

    function setVault(address _vault) external onlyOwner {
        require(_vault != address(0), "vault=0");
        vault = _vault;
        emit VaultSet(_vault);
    }

    /// @notice Account any newly-arrived HIVE / ETH balances into the per-weight accumulator.
    ///         Anyone can call. Cheap when nothing has arrived.
    function sync() public {
        uint256 totalW = IStakingView(staking).totalWeighted();
        uint256 hiveBal = hive.balanceOf(address(this));
        uint256 ethBal = address(this).balance;

        // unaccounted = balance - already-pending-for-users. We track distributed-to-acc
        // separately so we know exactly what's "new".
        uint256 newHive = hiveBal - _reservedHive();
        uint256 newEth = ethBal - _reservedEth();

        if (totalW > 0) {
            if (newHive > 0) {
                accHivePerWeight += (newHive * ACC_PRECISION) / totalW;
                totalHiveDistributed += newHive;
                _accountedHive += newHive;
            }
            if (newEth > 0) {
                accEthPerWeight += (newEth * ACC_PRECISION) / totalW;
                totalEthDistributed += newEth;
                _accountedEth += newEth;
            }
            if (newHive > 0 || newEth > 0) emit RewardAdded(newHive, newEth);
        }
        // If totalW == 0, the funds wait in the contract until weight exists.
    }

    // --- internal accounting ---
    uint256 internal _accountedHive;
    uint256 internal _accountedEth;

    function _reservedHive() internal view returns (uint256) {
        // Anything we've already accounted, minus what's been claimed out, sits in balance.
        // Simplest invariant: balance == _accountedHive - claimedOut. We track only
        // _accountedHive and let `balance - _accountedHive` be the "new" delta. Claims
        // decrement _accountedHive accordingly.
        return _accountedHive;
    }

    function _reservedEth() internal view returns (uint256) {
        return _accountedEth;
    }

    function _settle(address user) internal {
        uint256 w = IStakingView(staking).weightOf(user);
        UserInfo storage u = users[user];
        if (w > 0) {
            uint256 owedHive = (w * accHivePerWeight) / ACC_PRECISION;
            uint256 owedEth = (w * accEthPerWeight) / ACC_PRECISION;
            if (owedHive > u.hiveDebt) u.pendingHive += owedHive - u.hiveDebt;
            if (owedEth > u.ethDebt) u.pendingEth += owedEth - u.ethDebt;
        }
    }

    function _resetDebt(address user) internal {
        uint256 w = IStakingView(staking).weightOf(user);
        UserInfo storage u = users[user];
        u.hiveDebt = (w * accHivePerWeight) / ACC_PRECISION;
        u.ethDebt = (w * accEthPerWeight) / ACC_PRECISION;
    }

    /// @notice Settle pending rewards using the user's CURRENT (pre-mutation) weight.
    ///         Staking calls this first, then mutates the stake, then calls `commitWeight`.
    function settle(address user) external onlyStaking {
        sync();
        _settle(user);
    }

    /// @notice Snap the user's reward debt to their CURRENT (post-mutation) weight × acc.
    ///         Must be called after staking mutates the user's weight.
    function commitWeight(address user) external onlyStaking {
        _resetDebt(user);
    }

    /// @notice Convenience: equivalent to `settle` + `commitWeight` with no weight change.
    function notifyStakeChange(address user) external onlyStaking {
        sync();
        _settle(user);
        _resetDebt(user);
    }

    /// @notice Forfeit a user's pending rewards back to the pool. Called by staking on
    ///         early unstake. Currently invoked implicitly: HiveStaking calls
    ///         notifyStakeChange + immediately wipes pending here.
    function forfeit(address user) external onlyStaking returns (uint256 hiveAmt, uint256 ethAmt) {
        UserInfo storage u = users[user];
        hiveAmt = u.pendingHive;
        ethAmt = u.pendingEth;
        if (hiveAmt > 0 || ethAmt > 0) {
            u.pendingHive = 0;
            u.pendingEth = 0;
            // Push forfeited amounts back into the accumulator.
            uint256 totalW = IStakingView(staking).totalWeighted();
            if (totalW > 0) {
                if (hiveAmt > 0) accHivePerWeight += (hiveAmt * ACC_PRECISION) / totalW;
                if (ethAmt > 0) accEthPerWeight += (ethAmt * ACC_PRECISION) / totalW;
            }
            emit Forfeited(user, hiveAmt, ethAmt);
        }
    }

    /// @notice Pay out pending rewards to `to`. Only the staking contract may call.
    function claim(address user, address to) external onlyStaking nonReentrant returns (uint256 hiveAmt, uint256 ethAmt) {
        UserInfo storage u = users[user];
        hiveAmt = u.pendingHive;
        ethAmt = u.pendingEth;
        u.pendingHive = 0;
        u.pendingEth = 0;

        if (hiveAmt > 0) {
            _accountedHive -= hiveAmt;
            hive.safeTransfer(to, hiveAmt);
        }
        if (ethAmt > 0) {
            _accountedEth -= ethAmt;
            (bool ok, ) = to.call{value: ethAmt}("");
            require(ok, "eth pay failed");
        }
        emit Claimed(user, to, hiveAmt, ethAmt);
    }

    function pendingHive(address user) external view returns (uint256) {
        UserInfo memory u = users[user];
        uint256 w = IStakingView(staking).weightOf(user);
        uint256 acc = accHivePerWeight;
        uint256 totalW = IStakingView(staking).totalWeighted();
        uint256 hiveBal = hive.balanceOf(address(this));
        uint256 newHive = hiveBal > _accountedHive ? hiveBal - _accountedHive : 0;
        if (totalW > 0 && newHive > 0) {
            acc += (newHive * ACC_PRECISION) / totalW;
        }
        uint256 owed = (w * acc) / ACC_PRECISION;
        uint256 fresh = owed > u.hiveDebt ? owed - u.hiveDebt : 0;
        return u.pendingHive + fresh;
    }

    function pendingEth(address user) external view returns (uint256) {
        UserInfo memory u = users[user];
        uint256 w = IStakingView(staking).weightOf(user);
        uint256 acc = accEthPerWeight;
        uint256 totalW = IStakingView(staking).totalWeighted();
        uint256 ethBal = address(this).balance;
        uint256 newEth = ethBal > _accountedEth ? ethBal - _accountedEth : 0;
        if (totalW > 0 && newEth > 0) {
            acc += (newEth * ACC_PRECISION) / totalW;
        }
        uint256 owed = (w * acc) / ACC_PRECISION;
        uint256 fresh = owed > u.ethDebt ? owed - u.ethDebt : 0;
        return u.pendingEth + fresh;
    }
}
