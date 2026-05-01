# 🐝 The Hive System

## Why the Hive

Most "deflationary meme" tokens fail because they pile risk on transfers: wallet decay, hidden penalties, time-bombs that nuke late buyers. Bots route around them; humans get burned.

The Hive flips it: **the token is normal. The product is staking.** Holders earn by participating, not by holding. Bots can buy/sell freely; only stakers earn fees. The narrative is wrapped around a battle-tested staking model, not fragile token tricks.

## The Loop

```
                    ┌─────────────┐
                    │  Uniswap LP │
                    └──────┬──────┘
                  trades   │   fees
                           ▼
       ┌────────────────────────────────────┐
       │            NectarVault             │   ← receives HIVE tax + ETH fees
       └────────────────────┬───────────────┘
                  harvest() │
                            ▼
       ┌────────────────────────────────────┐
       │           HiveRewards              │   ← per-weight accumulator
       └────────────────────┬───────────────┘
                            │ claim
                            ▼
       ┌────────────────────────────────────┐
       │           HiveStaking              │   ← 24h–7d locks, 1.0×–1.5×
       └────────────────────────────────────┘
                            ▲
                            │ stake $HIVE
                       ┌────┴────┐
                       │  user   │
                       └─────────┘
```

## Lock Tiers

| Lock     | Multiplier | Forfeit if early unstake? |
| -------- | ---------- | ------------------------- |
| 24 hours | 1.0×       | yes                       |
| 3 days   | 1.2×       | yes                       |
| 7 days   | 1.5× (cap) | yes                       |

A user has one active stake. Adding more HIVE on top of an existing stake extends the lock end; the tier may be upgraded mid-lock (e.g. 24h → 7d) but cannot be shortened until the current lock matures.

## Reward Distribution Math

The classic MasterChef accumulator, two streams (HIVE + ETH):

```
when fees arrive:
    accPerWeight += incoming * 1e18 / totalWeighted

per-user pending:
    weight = stakedAmount * multiplier(lockDuration) / 10_000
    owed   = weight * accPerWeight / 1e18
    pending = owed - userDebt   (capped at 0)
```

`userDebt` is reset to `weight * accPerWeight / 1e18` on every stake change, so we never double-credit.

### Why pull-based

- O(1) gas per stake/unstake regardless of how many users exist
- Anyone can call `sync()` and `harvest()` to advance the system — no privileged keeper
- Fees that arrive when `totalWeighted == 0` simply wait in the contract balance and credit the next staker

## Forfeit Path (early unstake)

1. User calls `unstake()` before `lockEnd`.
2. Staking calls `notifyStakeChange(user)` on `HiveRewards`, which settles their pending.
3. Staking calls `forfeit(user)` (or, in this implementation, simply doesn't pay them on their way out — `claim` is gated on `block.timestamp >= lockEnd`).
4. Forfeited amounts are pushed back into `accPerWeight`, so they accrue to remaining stakers.

This means: **early exits subsidize loyal stakers**, never the treasury, never the team.

## Operational Lifecycle

1. Deploy contracts (`scripts/deploy.ts`) — owner = deployer, treasury = multisig.
2. Seed liquidity (`scripts/seedLiquidity.ts`) → get pair address.
3. `HiveToken.setTaxedPair(pair, true)` so router-routed swaps incur tax.
4. (Optional) `HiveToken.setTaxEnabled(true)` to flip on the 4% tax. Can be left off for purist mode.
5. `NectarVault.harvest()` — anyone can call this; it sweeps HIVE + ETH into `HiveRewards` and updates the accumulator.
6. Stakers claim periodically. The frontend automatically calls `harvest()` (or `sync()`) where useful.

## Trust Surface

- **Owner can:** flip tax on/off, mark addresses tax-exempt, register taxed pairs, set treasury, rescue unrelated ERC20s from `NectarVault`.
- **Owner cannot:** mint new tokens, modify user stakes, drain user balances, alter pending rewards, change lock multipliers (these are constants).
- **Anyone can:** call `sync()` on `HiveRewards`, `harvest()` on `NectarVault`. These are permissionless plumbing.

## Where the Honey Comes From

The yield is _not_ inflationary — it is real revenue:

- **HIVE stream:** 2% of each taxed swap's notional, paid in HIVE.
- **ETH stream:** unwrapped LP fees, optional protocol fees, voluntary treasury injections.

If trading dies, rewards trend to zero. The system is honest about that — no emissions schedule papers over inactivity.

## Threat Model Notes

- **Reentrancy:** `nonReentrant` on all state-mutating staking entry points; rewards transfer is the last step in `claim`.
- **Frontrunning:** stake/unstake have no MEV-sensitive ordering — multipliers are deterministic, accumulator advances atomically.
- **Sandwich on rewards:** because fees are accumulated and then synced, a flashloan staker could try to capture a single sync. Mitigation: the 24h minimum lock + claim gate makes the attack unprofitable (must hold for ≥24h to claim).
- **Donations to `HiveRewards`:** anyone can transfer HIVE/ETH directly — this is intentional and treated identically to harvested fees.
