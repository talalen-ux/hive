// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20, SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";

/// @title NectarVault
/// @notice The fee/revenue receiver for the Hive system. ETH (from LP swaps
///         unwrapped or protocol fees) and HIVE (from the transfer tax)
///         accumulate here, then get forwarded to the HiveRewards distributor
///         when `harvest()` is called.
///
/// `harvest()` is permissionless by design — reward streams must not depend on
/// a privileged keeper. The vault simply forwards balances; accounting lives
/// in HiveRewards.
///
/// `setRewards` is one-shot. Combined with `Ownable2Step`, this prevents a
/// compromised owner key from redirecting the harvest stream after launch.
contract NectarVault is Ownable2Step {
    using SafeERC20 for IERC20;

    address public rewards;
    IERC20 public immutable hive;

    event RewardsSet(address indexed rewards);
    event Harvested(uint256 hiveAmount, uint256 ethAmount);
    event TokenRescued(address indexed token, uint256 amount);

    constructor(address initialOwner, address _hive) Ownable(initialOwner) {
        require(_hive != address(0), "hive=0");
        hive = IERC20(_hive);
    }

    receive() external payable {}

    /// @notice One-shot wire-up. Reverts if `rewards` is already non-zero.
    function setRewards(address _rewards) external onlyOwner {
        require(rewards == address(0), "rewards already set");
        require(_rewards != address(0), "rewards=0");
        rewards = _rewards;
        emit RewardsSet(_rewards);
    }

    /// @notice Push pending HIVE + ETH balances to the rewards distributor.
    function harvest() external {
        require(rewards != address(0), "rewards unset");
        uint256 hiveBal = hive.balanceOf(address(this));
        uint256 ethBal = address(this).balance;

        if (hiveBal > 0) {
            hive.safeTransfer(rewards, hiveBal);
        }
        if (ethBal > 0) {
            (bool ok, ) = rewards.call{value: ethBal}("");
            require(ok, "eth fwd failed");
        }
        emit Harvested(hiveBal, ethBal);
    }

    /// @notice Owner can rescue any unrelated ERC20 accidentally sent here.
    ///         HIVE is excluded — use `harvest()` for that.
    function rescue(address token, uint256 amount, address to) external onlyOwner {
        require(token != address(hive), "use harvest");
        require(to != address(0), "to=0");
        IERC20(token).safeTransfer(to, amount);
        emit TokenRescued(token, amount);
    }
}
