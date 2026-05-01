// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title HiveToken
/// @notice $HIVE — a clean ERC20 with an optional 4% transfer tax that routes to
///         the staking rewards pool, treasury, and a burn sink.
///
/// Tax split (when enabled):
///   2% → rewards pool
///   1% → treasury
///   1% → burn (transfer to address(0))
///
/// Tax can be disabled entirely for "purist mode" where revenue comes only from LP fees.
contract HiveToken is ERC20, ERC20Permit, Ownable {
    uint16 public constant BPS = 10_000;
    uint16 public constant REWARDS_BPS = 200; // 2%
    uint16 public constant TREASURY_BPS = 100; // 1%
    uint16 public constant BURN_BPS = 100; // 1%
    uint16 public constant TOTAL_TAX_BPS = REWARDS_BPS + TREASURY_BPS + BURN_BPS; // 4%

    address public rewardsPool;
    address public treasury;

    bool public taxEnabled;
    mapping(address => bool) public taxExempt;
    mapping(address => bool) public taxedPair;

    event TaxEnabledSet(bool enabled);
    event TaxExemptSet(address indexed account, bool exempt);
    event TaxedPairSet(address indexed pair, bool taxed);
    event RewardsPoolSet(address indexed pool);
    event TreasurySet(address indexed treasury);
    event TaxCollected(address indexed from, address indexed to, uint256 rewards, uint256 treasury, uint256 burn);

    constructor(
        address initialOwner,
        address _treasury,
        uint256 initialSupply
    ) ERC20("Hive", "HIVE") ERC20Permit("Hive") Ownable(initialOwner) {
        require(_treasury != address(0), "treasury=0");
        treasury = _treasury;
        taxExempt[initialOwner] = true;
        taxExempt[address(this)] = true;
        _mint(initialOwner, initialSupply);
    }

    function setRewardsPool(address pool) external onlyOwner {
        rewardsPool = pool;
        if (pool != address(0)) taxExempt[pool] = true;
        emit RewardsPoolSet(pool);
    }

    function setTreasury(address _treasury) external onlyOwner {
        require(_treasury != address(0), "treasury=0");
        treasury = _treasury;
        taxExempt[_treasury] = true;
        emit TreasurySet(_treasury);
    }

    function setTaxEnabled(bool enabled) external onlyOwner {
        taxEnabled = enabled;
        emit TaxEnabledSet(enabled);
    }

    function setTaxExempt(address account, bool exempt) external onlyOwner {
        taxExempt[account] = exempt;
        emit TaxExemptSet(account, exempt);
    }

    /// @notice Tax only applies to swaps with registered Uniswap-like pairs.
    function setTaxedPair(address pair, bool taxed) external onlyOwner {
        taxedPair[pair] = taxed;
        emit TaxedPairSet(pair, taxed);
    }

    function _update(address from, address to, uint256 value) internal override {
        if (
            !taxEnabled ||
            from == address(0) ||
            to == address(0) ||
            taxExempt[from] ||
            taxExempt[to] ||
            (!taxedPair[from] && !taxedPair[to])
        ) {
            super._update(from, to, value);
            return;
        }

        uint256 rewardsCut = (value * REWARDS_BPS) / BPS;
        uint256 treasuryCut = (value * TREASURY_BPS) / BPS;
        uint256 burnCut = (value * BURN_BPS) / BPS;
        uint256 net = value - rewardsCut - treasuryCut - burnCut;

        if (rewardsCut > 0 && rewardsPool != address(0)) {
            super._update(from, rewardsPool, rewardsCut);
        } else if (rewardsCut > 0) {
            // fallback: send rewards portion to treasury until pool is set
            super._update(from, treasury, rewardsCut);
        }
        if (treasuryCut > 0) super._update(from, treasury, treasuryCut);
        if (burnCut > 0) super._update(from, address(0), burnCut);
        super._update(from, to, net);

        emit TaxCollected(from, to, rewardsCut, treasuryCut, burnCut);
    }
}
