// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20, SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

interface IStakingView {
    function weightOf(address user) external view returns (uint256);
    function totalWeighted() external view returns (uint256);
}

/// @title HiveRewards
/// @notice Pull-based reward distributor. Tracks two reward streams: HIVE
///         (from token transfer tax) and ETH (from LP/protocol fees).
///
/// Math: classic MasterChef accumulator with a residual dust ledger so
/// integer-division leftovers are carried forward instead of stranded.
///
///   accPerWeight += (incoming * 1e18 + residual) / totalWeighted
///   residual      = (incoming * 1e18 + residual) % totalWeighted
///
/// Forfeits: when staking calls `forfeit` on an early unstake, the
/// user's pending balances are zeroed and pushed back into
/// `accPerWeight` for the *remaining* stakers — the staking contract
/// removes the leaver's weight from `totalWeighted` BEFORE invoking
/// forfeit so dilution math is exact.
///
/// All wire-up setters (`setStaking`, `setVault`) are one-shot — once
/// non-zero, they cannot be moved. This neutralises a compromised owner
/// key. Combined with `Ownable2Step`, even an emergency takeover cannot
/// redirect the reward streams.
contract HiveRewards is Ownable2Step, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    uint256 internal constant ACC_PRECISION = 1e18;

    IERC20 public immutable hive;
    address public staking;
    address public vault;

    uint256 public accHivePerWeight;
    uint256 public accEthPerWeight;

    /// @dev integer-division residuals carried into the next sync
    uint256 internal _hiveResidual;
    uint256 internal _ethResidual;

    struct UserInfo {
        uint256 hiveDebt;
        uint256 ethDebt;
        uint256 pendingHive;
        uint256 pendingEth;
    }
    mapping(address => UserInfo) public users;

    /// @notice Total HIVE/ETH the contract has distributed over its lifetime.
    uint256 public totalHiveDistributed;
    uint256 public totalEthDistributed;

    // Internal accounting: amount of token/ETH that has already been booked
    // into accPerWeight. `balance - accounted` is the new delta to distribute.
    uint256 internal _accountedHive;
    uint256 internal _accountedEth;

    event StakingSet(address indexed staking);
    event VaultSet(address indexed vault);
    event RewardAdded(uint256 hiveAmount, uint256 ethAmount);
    event Claimed(address indexed user, address indexed to, uint256 hiveAmount, uint256 ethAmount);
    event EthClaimDeferred(address indexed user, address indexed intendedTo, uint256 ethAmount);
    event Forfeited(address indexed user, uint256 hiveAmount, uint256 ethAmount);

    modifier onlyStaking() {
        require(msg.sender == staking, "not staking");
        _;
    }

    constructor(address initialOwner, address _hive) Ownable(initialOwner) {
        require(_hive != address(0), "hive=0");
        hive = IERC20(_hive);
    }

    receive() external payable {}

    /// @notice One-shot wire-up. Reverts if `staking` is already non-zero.
    function setStaking(address _staking) external onlyOwner {
        require(staking == address(0), "staking already set");
        require(_staking != address(0), "staking=0");
        staking = _staking;
        emit StakingSet(_staking);
    }

    /// @notice One-shot wire-up. Reverts if `vault` is already non-zero.
    function setVault(address _vault) external onlyOwner {
        require(vault == address(0), "vault already set");
        require(_vault != address(0), "vault=0");
        vault = _vault;
        emit VaultSet(_vault);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    /// @notice Account any newly-arrived HIVE / ETH balances into the
    ///         per-weight accumulator. Anyone may call. Cheap when nothing has
    ///         arrived. Guarded against re-entry from token / ETH callbacks.
    function sync() public nonReentrant {
        _sync();
    }

    function _sync() internal {
        uint256 totalW = IStakingView(staking).totalWeighted();
        uint256 hiveBal = hive.balanceOf(address(this));
        uint256 ethBal = address(this).balance;

        // Recover from accidental drift: if a future rescue/selfdestruct moves
        // tokens out from under us, snap accounted down to balance so the
        // contract continues to function rather than DoS-ing on every call.
        if (_accountedHive > hiveBal) _accountedHive = hiveBal;
        if (_accountedEth > ethBal) _accountedEth = ethBal;

        uint256 newHive = hiveBal - _accountedHive;
        uint256 newEth = ethBal - _accountedEth;

        if (totalW == 0 || (newHive == 0 && newEth == 0)) return;

        if (newHive > 0) {
            uint256 num = newHive * ACC_PRECISION + _hiveResidual;
            uint256 add = num / totalW;
            _hiveResidual = num - add * totalW;
            if (add > 0) accHivePerWeight += add;
            _accountedHive += newHive;
            totalHiveDistributed += newHive;
        }
        if (newEth > 0) {
            uint256 num = newEth * ACC_PRECISION + _ethResidual;
            uint256 add = num / totalW;
            _ethResidual = num - add * totalW;
            if (add > 0) accEthPerWeight += add;
            _accountedEth += newEth;
            totalEthDistributed += newEth;
        }
        emit RewardAdded(newHive, newEth);
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

    /// @notice Settle pending rewards using the user's CURRENT (pre-mutation)
    ///         weight. Staking calls this first, then mutates the stake, then
    ///         calls `commitWeight`.
    function settle(address user) external onlyStaking {
        _sync();
        _settle(user);
    }

    /// @notice Snap the user's reward debt to their CURRENT (post-mutation)
    ///         weight × acc.
    function commitWeight(address user) external onlyStaking {
        _resetDebt(user);
    }

    /// @notice settle + resetDebt in one call when no weight change has happened.
    function notifyStakeChange(address user) external onlyStaking {
        _sync();
        _settle(user);
        _resetDebt(user);
    }

    /// @notice Forfeit a user's pending rewards back to the pool. Called by
    ///         staking on early unstake. Staking MUST have already removed the
    ///         user's weight from `totalWeighted` before calling this so
    ///         redistribution math is exact.
    function forfeit(address user) external onlyStaking returns (uint256 hiveAmt, uint256 ethAmt) {
        _sync();
        UserInfo storage u = users[user];
        hiveAmt = u.pendingHive;
        ethAmt = u.pendingEth;
        if (hiveAmt > 0 || ethAmt > 0) {
            u.pendingHive = 0;
            u.pendingEth = 0;
            uint256 totalW = IStakingView(staking).totalWeighted();
            if (totalW > 0) {
                if (hiveAmt > 0) {
                    uint256 num = hiveAmt * ACC_PRECISION + _hiveResidual;
                    uint256 add = num / totalW;
                    _hiveResidual = num - add * totalW;
                    if (add > 0) accHivePerWeight += add;
                }
                if (ethAmt > 0) {
                    uint256 num = ethAmt * ACC_PRECISION + _ethResidual;
                    uint256 add = num / totalW;
                    _ethResidual = num - add * totalW;
                    if (add > 0) accEthPerWeight += add;
                }
            }
            // If totalW is now 0 (e.g. the leaver was the only staker), the
            // forfeited tokens stay in the contract balance; on the next sync
            // with weight present they will be picked up via the
            // `balance - accounted` delta. To enable that we decrement
            // _accountedHive/_accountedEth here so the residue is re-detected.
            else {
                if (hiveAmt > 0) _accountedHive -= hiveAmt;
                if (ethAmt > 0) _accountedEth -= ethAmt;
            }
            emit Forfeited(user, hiveAmt, ethAmt);
        }
    }

    /// @notice Pay out pending rewards to `to`. Only the staking contract may
    ///         call. ETH transfer failure is non-fatal: the amount is parked in
    ///         `pendingEth` and an `EthClaimDeferred` event lets the staker
    ///         retry from a different address via the staking contract.
    function claim(address user, address to)
        external
        onlyStaking
        nonReentrant
        whenNotPaused
        returns (uint256 hiveAmt, uint256 ethAmt)
    {
        require(to != address(0), "to=0");
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
            (bool ok, ) = to.call{value: ethAmt, gas: 50_000}("");
            if (!ok) {
                // Roll back ETH bookkeeping: park the amount as pending and
                // emit so the caller can retry to a different recipient.
                _accountedEth += ethAmt;
                u.pendingEth += ethAmt;
                emit EthClaimDeferred(user, to, ethAmt);
                ethAmt = 0;
            }
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
            uint256 num = newHive * ACC_PRECISION + _hiveResidual;
            acc += num / totalW;
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
            uint256 num = newEth * ACC_PRECISION + _ethResidual;
            acc += num / totalW;
        }
        uint256 owed = (w * acc) / ACC_PRECISION;
        uint256 fresh = owed > u.ethDebt ? owed - u.ethDebt : 0;
        return u.pendingEth + fresh;
    }
}
