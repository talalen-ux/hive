import { type Address, isAddress } from "viem";

/**
 * Per-chain deployment addresses sourced from public env vars at build time.
 *
 * Until each address is set the dapp runs in "preview" mode: read calls are
 * skipped, write actions are disabled, and a banner explains the contracts
 * have not been deployed on this chain yet.
 *
 * To go live on a chain, set the four NEXT_PUBLIC_*_<NETWORK> env vars in
 * the Vercel project (or .env.local for local dev) and redeploy.
 */
export type HiveAddresses = {
  hive: Address;
  staking: Address;
  rewards: Address;
  vault: Address;
};

const ZERO = "0x0000000000000000000000000000000000000000" as Address;

function readAddress(key: string): Address {
  const v = process.env[key];
  if (v && isAddress(v)) return v as Address;
  return ZERO;
}

export const ADDRESSES: Record<number, HiveAddresses> = {
  // mainnet
  1: {
    hive: readAddress("NEXT_PUBLIC_HIVE_MAINNET"),
    staking: readAddress("NEXT_PUBLIC_STAKING_MAINNET"),
    rewards: readAddress("NEXT_PUBLIC_REWARDS_MAINNET"),
    vault: readAddress("NEXT_PUBLIC_VAULT_MAINNET"),
  },
  // sepolia testnet
  11155111: {
    hive: readAddress("NEXT_PUBLIC_HIVE_SEPOLIA"),
    staking: readAddress("NEXT_PUBLIC_STAKING_SEPOLIA"),
    rewards: readAddress("NEXT_PUBLIC_REWARDS_SEPOLIA"),
    vault: readAddress("NEXT_PUBLIC_VAULT_SEPOLIA"),
  },
};

export function getAddresses(chainId: number | undefined): HiveAddresses {
  return (chainId !== undefined && ADDRESSES[chainId]) || ADDRESSES[1];
}

/** True iff every contract has a non-zero address on this chain. */
export function isLiveOn(chainId: number | undefined): boolean {
  const a = getAddresses(chainId);
  return (
    a.hive !== ZERO &&
    a.staking !== ZERO &&
    a.rewards !== ZERO &&
    a.vault !== ZERO
  );
}

export const SUPPORTED_CHAIN_IDS = Object.keys(ADDRESSES).map((s) => Number(s));

export const LOCK_TIERS = [
  { label: "24 hours", seconds: 24 * 60 * 60, multiplier: 1.0 },
  { label: "3 days", seconds: 3 * 24 * 60 * 60, multiplier: 1.2 },
  { label: "7 days", seconds: 7 * 24 * 60 * 60, multiplier: 1.5 },
] as const;
