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
    function firstStakeAt(address user) external view returns (uint64);
}

/// @title HiveRewards (launch-only distribution model)
/// @notice MasterChef-style accumulator, but distribution is **explicit and
///         discrete**: the multisig calls `distributeLaunchPool(...)` to
///         move a chunk of pending balances into the per-staker accumulator.
///         There is no continuous `sync()` — funds can flow in (tax,
///         NectarVault.harvest) and accumulate as an undistributed pool
///         until the multisig releases them, typically when a project
///         reaches LAUNCH stage.
///
/// Staking integration is unchanged in shape: `settle` / `commitWeight` /
/// `notifyStakeChange` / `claim` are called by HiveStaking around
/// stake/unstake/claim transitions. No `forfeit` (no early-exit penalty
/// in the no-lock model). Residual sandwich exposure on launch payouts is
/// documented in docs/SECURITY.md and mitigated operationally by
/// announcing distributions in advance.
contract HiveRewards is Ownable2Step, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    uint256 internal constant ACC_PRECISION = 1e18;

    IERC20 public immutable hive;
    address public staking;
    address public vault;

    uint256 public accHivePerWeight;
    uint256 public accEthPerWeight;

    /// @dev integer-division residuals carried into the next distribution.
    uint256 internal _hiveResidual;
    uint256 internal _ethResidual;

    struct UserInfo {
        uint256 hiveDebt;
        uint256 ethDebt;
        uint256 pendingHive;
        uint256 pendingEth;
    }
    mapping(address => UserInfo) public users;

    /// @notice Lifetime distributed totals — useful for analytics.
    uint256 public totalHiveDistributed;
    uint256 public totalEthDistributed;

    /// @notice Internal accounting: amount of HIVE / ETH that has been
    ///         booked into accPerWeight already. The pending pool is
    ///         `balance - accounted`. Multisig sees this via the views.
    uint256 internal _accountedHive;
    uint256 internal _accountedEth;

    /// @notice Last time a launch payout was executed. Used by the
    ///         maturity check on claim — stakers must have been continuously
    ///         staked since before the most recent payout to claim.
    uint64 public lastPayoutAt;

    event StakingSet(address indexed staking);
    event VaultSet(address indexed vault);
    event LaunchPoolDistributed(uint256 hiveAmount, uint256 ethAmount);
    event Claimed(address indexed user, address indexed to, uint256 hiveAmount, uint256 ethAmount);
    event EthClaimDeferred(address indexed user, address indexed intendedTo, uint256 ethAmount);

    error AddressZero();
    error AlreadySet();
    error NotStaking();
    error ToZero();
    error AmountZero();
    error InsufficientPending();

    modifier onlyStaking() {
        if (msg.sender != staking) revert NotStaking();
        _;
    }

    constructor(address initialOwner, address _hive) Ownable(initialOwner) {
        if (_hive == address(0)) revert AddressZero();
        hive = IERC20(_hive);
    }

    receive() external payable {}

    // ─────────────────────────── Admin ───────────────────────────

    function setStaking(address _staking) external onlyOwner {
        if (staking != address(0)) revert AlreadySet();
        if (_staking == address(0)) revert AddressZero();
        staking = _staking;
        emit StakingSet(_staking);
    }

    function setVault(address _vault) external onlyOwner {
        if (vault != address(0)) revert AlreadySet();
        if (_vault == address(0)) revert AddressZero();
        vault = _vault;
        emit VaultSet(_vault);
    }

    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    // ─────────────────────── Distribution (launch) ───────────────────────

    /// @notice Pending pool — funds in the contract that haven't been
    ///         booked into the accumulator yet. The multisig consults this
    ///         to size a `distributeLaunchPool` call.
    function pendingPoolHive() external view returns (uint256) {
        uint256 bal = hive.balanceOf(address(this));
        return bal > _accountedHive ? bal - _accountedHive : 0;
    }

    function pendingPoolEth() external view returns (uint256) {
        uint256 bal = address(this).balance;
        return bal > _accountedEth ? bal - _accountedEth : 0;
    }

    /// @notice Release a chunk of the pending pool to current stakers via
    ///         the accumulator. Anyone staked at the time this is called
    ///         (and still staked at claim time) is eligible. Multisig
    ///         responsibility: announce distributions in advance and pick
    ///         amounts that fit the project-launch schedule. See
    ///         SECURITY.md → launch-payout sandwich risk.
    function distributeLaunchPool(uint256 hiveAmt, uint256 ethAmt) external onlyOwner nonReentrant {
        if (hiveAmt == 0 && ethAmt == 0) revert AmountZero();

        uint256 totalW = IStakingView(staking).totalWeighted();
        // No stakers => owner cannot release. Funds wait for the next
        // attempt when at least one staker has joined.
        if (totalW == 0) revert AmountZero();

        if (hiveAmt > 0) {
            uint256 bal = hive.balanceOf(address(this));
            if (bal < _accountedHive + hiveAmt) revert InsufficientPending();
            uint256 num = hiveAmt * ACC_PRECISION + _hiveResidual;
            uint256 add = num / totalW;
            _hiveResidual = num - add * totalW;
            if (add > 0) accHivePerWeight += add;
            _accountedHive += hiveAmt;
            totalHiveDistributed += hiveAmt;
        }
        if (ethAmt > 0) {
            uint256 bal = address(this).balance;
            if (bal < _accountedEth + ethAmt) revert InsufficientPending();
            uint256 num = ethAmt * ACC_PRECISION + _ethResidual;
            uint256 add = num / totalW;
            _ethResidual = num - add * totalW;
            if (add > 0) accEthPerWeight += add;
            _accountedEth += ethAmt;
            totalEthDistributed += ethAmt;
        }

        lastPayoutAt = uint64(block.timestamp);
        emit LaunchPoolDistributed(hiveAmt, ethAmt);
    }

    // ─────────────────────── Staking integration ───────────────────────

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

    /// @notice Settle pending using the user's CURRENT (pre-mutation) weight.
    function settle(address user) external onlyStaking {
        _settle(user);
    }

    /// @notice Snap reward debt to the user's current weight × acc.
    function commitWeight(address user) external onlyStaking {
        _resetDebt(user);
    }

    /// @notice settle + resetDebt with no weight change. Used by claim.
    function notifyStakeChange(address user) external onlyStaking {
        _settle(user);
        _resetDebt(user);
    }

    /// @notice Pay out pending rewards to `to`. Only HiveStaking may call.
    ///         ETH transfer failure is non-fatal — the amount is parked back
    ///         in pending and an `EthClaimDeferred` event lets the user
    ///         retry to a different address.
    function claim(address user, address to)
        external
        onlyStaking
        nonReentrant
        whenNotPaused
        returns (uint256 hiveAmt, uint256 ethAmt)
    {
        if (to == address(0)) revert ToZero();
        UserInfo storage u = users[user];
        hiveAmt = u.pendingHive;
        ethAmt = u.pendingEth;
        u.pendingHive = 0;
        u.pendingEth = 0;

        if (hiveAmt > 0) {
            unchecked { _accountedHive -= hiveAmt; }
            hive.safeTransfer(to, hiveAmt);
        }
        if (ethAmt > 0) {
            unchecked { _accountedEth -= ethAmt; }
            (bool ok, ) = to.call{value: ethAmt, gas: 100_000}("");
            if (!ok) {
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
        uint256 owed = (w * accHivePerWeight) / ACC_PRECISION;
        uint256 fresh = owed > u.hiveDebt ? owed - u.hiveDebt : 0;
        return u.pendingHive + fresh;
    }

    function pendingEth(address user) external view returns (uint256) {
        UserInfo memory u = users[user];
        uint256 w = IStakingView(staking).weightOf(user);
        uint256 owed = (w * accEthPerWeight) / ACC_PRECISION;
        uint256 fresh = owed > u.ethDebt ? owed - u.ethDebt : 0;
        return u.pendingEth + fresh;
    }
}
