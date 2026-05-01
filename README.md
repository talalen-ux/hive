# 🐝 Hive Staking Vault

A staking-first DeFi product where users stake `$HIVE` to enter the Hive and earn real fees from trading volume + LP rewards.

## Core Idea

Instead of risky token mechanics (wallet decay, hidden penalties, bot time-bombs), Hive wraps a **normal staking product** in a strong narrative layer:

- **Stake $HIVE → Enter Hive → Earn Fees**
- 24h minimum lock, up to 7 days for higher multipliers
- Rewards paid in real revenue: ETH + HIVE from trading fees, LP, and optional treasury injections

## Lock Tiers

| Lock Duration | Reward Multiplier |
| ------------- | ----------------- |
| 24h           | 1.0x              |
| 3 days        | 1.2x              |
| 7 days        | 1.5x (cap)        |

Unstaking before 24h forfeits rewards; full eligibility begins after the minimum lock.

## Repo Layout

```
hive-dapp/
├── contracts/        Solidity contracts (HiveToken, HiveStaking, NectarVault, HiveRewards)
├── subgraph/         The Graph schema + mappings
├── frontend/         Next.js dApp
├── scripts/          Hardhat deploy + liquidity seed scripts
├── docs/             Tokenomics + system design
```

## Quick Start

```bash
npm install
npx hardhat compile
npx hardhat test
npx hardhat run scripts/deploy.ts --network <network>
```

See `docs/hive-system.md` and `docs/tokenomics.md` for deeper details.
