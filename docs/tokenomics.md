# 🍯 Hive Tokenomics

## Supply

- **Symbol:** `$HIVE`
- **Decimals:** 18
- **Initial supply:** 100,000,000 HIVE (configurable via `INITIAL_SUPPLY` env at deploy time)
- **Inflation:** none. The token does not mint after deployment.

## Allocation (suggested)

| Bucket               | %   | Notes                                              |
| -------------------- | --- | -------------------------------------------------- |
| Liquidity            | 60% | Seeded into HIVE/ETH Uniswap V2 pool at launch     |
| Treasury             | 20% | Multisig — funds development, audits, partnerships |
| Team / contributors  | 10% | Vested over 12–24 months (off-chain)               |
| Community / airdrops | 10% | Stakers, early supporters, ecosystem grants        |

## Trading Tax (optional, off by default)

When `taxEnabled` is true on `HiveToken`, transfers _to or from a registered taxed pair_ pay 4% total:

| Cut             | %   | Destination                                |
| --------------- | --- | ------------------------------------------ |
| Rewards pool    | 2%  | `HiveRewards` — distributed to stakers     |
| Treasury        | 1%  | Treasury multisig                          |
| Burn            | 1%  | Sent to `address(0)` — permanent supply ↓  |

**Tax is symmetric** — applies on both buys and sells routed through the registered pair. Wallet-to-wallet transfers, internal contract moves, and exempted addresses never pay tax.

### Purist mode

If the team prefers a "purist" tokenomics layer, leave `taxEnabled = false` and rely only on:

- Uniswap V2 LP fees (0.3% per swap, accruing inside the pool)
- Optional protocol-level fees added later (e.g. fee-on-LP-add)

In that mode, `NectarVault` still works — fees just arrive via different paths (manual treasury injections, LP-fee skims, etc.).

## Reward Streams

`HiveRewards` distributes two assets to weighted stakers:

1. **HIVE** — from the 2% rewards-pool tax cut
2. **ETH** — from LP fee unwraps and optional protocol fees

Both streams use the same per-weight accumulator. A user's weight is:

```
weight = staked_amount × multiplier(lockDuration) / 10_000
```

Multipliers (BPS): 24h → 10000, 3d → 12000, 7d → 15000.

## Forfeit Mechanics

Unstaking before `lockEnd` forfeits all accrued rewards. The forfeited balance is recycled into the per-weight accumulator, so it accrues to the remaining stakers proportionally — no value leaks to the treasury or burns.

## Burn dynamics

Each taxed swap permanently destroys 1% of the swap notional. Over time, this is a slow, transparent deflationary pressure tied directly to organic trading volume (not artificial token sinks).
