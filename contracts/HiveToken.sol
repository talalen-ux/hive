// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";

/// @title HiveToken
/// @notice $HIVE — a clean ERC20 with an optional 4% transfer tax that routes to
///         the staking rewards pool, treasury, and a burn sink.
///
/// Tax split (when enabled):
///   2% → rewards pool
///   1% → treasury
///   1% → burn (transfer to address(0))
///
/// Tax can be disabled entirely for "purist mode" where revenue comes only from
/// LP fees. The 4% ceiling is hard-coded — there is no setter to raise it.
///
/// Critical addresses (rewardsPool, staking, vault, treasury) are auto-exempted
/// when wired in, and the owner cannot revoke their exemption. This prevents
/// fee-on-transfer self-cannibalisation and tax-on-claim accounting drift.
contract HiveToken is ERC20, ERC20Permit, Ownable2Step {
    uint16 public constant BPS = 10_000;
    uint16 public constant REWARDS_BPS = 200; // 2%
    uint16 public constant TREASURY_BPS = 100; // 1%
    uint16 public constant BURN_BPS = 100; // 1%
    uint16 public constant TOTAL_TAX_BPS = REWARDS_BPS + TREASURY_BPS + BURN_BPS; // 4%

    address public rewardsPool;
    address public staking;
    address public vault;
    address public treasury;

    bool public taxEnabled;
    mapping(address => bool) public taxExempt;
    mapping(address => bool) public taxedPair;

    event TaxEnabledSet(bool enabled);
    event TaxExemptSet(address indexed account, bool exempt);
    event TaxedPairSet(address indexed pair, bool taxed);
    event RewardsPoolSet(address indexed pool);
    event StakingSet(address indexed staking);
    event VaultSet(address indexed vault);
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
        taxExempt[_treasury] = true;
        taxExempt[address(this)] = true;
        _mint(initialOwner, initialSupply);
    }

    /// @notice One-shot wire-up of the rewards pool. Auto-exempts the pool from
    ///         tax. Reverts if already set.
    function setRewardsPool(address pool) external onlyOwner {
        require(rewardsPool == address(0), "rewards already set");
        require(pool != address(0), "pool=0");
        rewardsPool = pool;
        taxExempt[pool] = true;
        emit RewardsPoolSet(pool);
    }

    /// @notice One-shot wire-up of the staking contract. Auto-exempts it.
    function setStaking(address _staking) external onlyOwner {
        require(staking == address(0), "staking already set");
        require(_staking != address(0), "staking=0");
        staking = _staking;
        taxExempt[_staking] = true;
        emit StakingSet(_staking);
    }

    /// @notice One-shot wire-up of the nectar vault. Auto-exempts it.
    function setVault(address _vault) external onlyOwner {
        require(vault == address(0), "vault already set");
        require(_vault != address(0), "vault=0");
        vault = _vault;
        taxExempt[_vault] = true;
        emit VaultSet(_vault);
    }

    function setTreasury(address _treasury) external onlyOwner {
        require(_treasury != address(0), "treasury=0");
        treasury = _treasury;
        taxExempt[_treasury] = true;
        emit TreasurySet(_treasury);
    }

    function setTaxEnabled(bool enabled) external onlyOwner {
        if (enabled) {
            // Defence in depth: cannot enable tax until the protocol contracts
            // are wired and exempt. This blocks an accidental flip that would
            // tax stakes/claims/harvests.
            require(rewardsPool != address(0), "rewards unset");
            require(staking != address(0) && taxExempt[staking], "staking not exempt");
            require(vault != address(0) && taxExempt[vault], "vault not exempt");
            require(taxExempt[treasury] && taxExempt[rewardsPool], "treasury/pool not exempt");
        }
        taxEnabled = enabled;
        emit TaxEnabledSet(enabled);
    }

    /// @notice Exempt or un-exempt an address from tax. Cannot un-exempt any of
    ///         the protocol-critical addresses (would break reward accounting).
    function setTaxExempt(address account, bool exempt) external onlyOwner {
        if (!exempt) {
            require(
                account != rewardsPool &&
                account != staking &&
                account != vault &&
                account != treasury,
                "cannot revoke critical"
            );
        }
        taxExempt[account] = exempt;
        emit TaxExemptSet(account, exempt);
    }

    /// @notice Tax only applies to swaps with registered Uniswap-like pairs.
    function setTaxedPair(address pair, bool taxed) external onlyOwner {
        // Protocol-critical addresses are NEVER taxed pairs — defence in depth.
        if (taxed) {
            require(
                pair != rewardsPool &&
                pair != staking &&
                pair != vault &&
                pair != treasury,
                "critical addr"
            );
        }
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

        // rewardsPool is required to be set before tax can be enabled (see
        // setTaxEnabled), so this is always non-zero on the tax path.
        if (rewardsCut > 0) super._update(from, rewardsPool, rewardsCut);
        if (treasuryCut > 0) super._update(from, treasury, treasuryCut);
        if (burnCut > 0) super._update(from, address(0), burnCut);
        super._update(from, to, net);

        emit TaxCollected(from, to, rewardsCut, treasuryCut, burnCut);
    }
}
