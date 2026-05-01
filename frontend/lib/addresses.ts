import { type Address } from "viem";

/// Deployment addresses, sourced from env so the same build can target multiple chains.
/// Fill these in after running `scripts/deploy.ts` against the target network.
export const ADDRESSES: Record<number, {
  hive: Address;
  staking: Address;
  rewards: Address;
  vault: Address;
}> = {
  1: {
    hive: (process.env.NEXT_PUBLIC_HIVE_MAINNET ?? "0x0000000000000000000000000000000000000000") as Address,
    staking: (process.env.NEXT_PUBLIC_STAKING_MAINNET ?? "0x0000000000000000000000000000000000000000") as Address,
    rewards: (process.env.NEXT_PUBLIC_REWARDS_MAINNET ?? "0x0000000000000000000000000000000000000000") as Address,
    vault: (process.env.NEXT_PUBLIC_VAULT_MAINNET ?? "0x0000000000000000000000000000000000000000") as Address,
  },
  11155111: {
    hive: (process.env.NEXT_PUBLIC_HIVE_SEPOLIA ?? "0x0000000000000000000000000000000000000000") as Address,
    staking: (process.env.NEXT_PUBLIC_STAKING_SEPOLIA ?? "0x0000000000000000000000000000000000000000") as Address,
    rewards: (process.env.NEXT_PUBLIC_REWARDS_SEPOLIA ?? "0x0000000000000000000000000000000000000000") as Address,
    vault: (process.env.NEXT_PUBLIC_VAULT_SEPOLIA ?? "0x0000000000000000000000000000000000000000") as Address,
  },
};

export const LOCK_TIERS = [
  { label: "24 hours", seconds: 24 * 60 * 60, multiplier: 1.0 },
  { label: "3 days", seconds: 3 * 24 * 60 * 60, multiplier: 1.2 },
  { label: "7 days", seconds: 7 * 24 * 60 * 60, multiplier: 1.5 },
] as const;
