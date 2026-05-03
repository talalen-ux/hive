import { type Address, isAddress } from "viem";

/**
 * Per-chain deployment addresses sourced from public env vars at build time.
 *
 * Until the four core contracts (token/staking/rewards/vault) are set, the
 * dapp runs in "preview" mode — read calls are skipped, write actions are
 * disabled, and a banner explains the contracts have not been deployed on
 * this chain yet.
 *
 * The governor is optional: when its address is set, the incubator pages
 * fetch proposals + tasks on-chain instead of using mock seed data.
 */
export type HiveAddresses = {
  hive: Address;
  staking: Address;
  rewards: Address;
  vault: Address;
  governor: Address;
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
    governor: readAddress("NEXT_PUBLIC_GOVERNOR_MAINNET"),
  },
  // sepolia testnet
  11155111: {
    hive: readAddress("NEXT_PUBLIC_HIVE_SEPOLIA"),
    staking: readAddress("NEXT_PUBLIC_STAKING_SEPOLIA"),
    rewards: readAddress("NEXT_PUBLIC_REWARDS_SEPOLIA"),
    vault: readAddress("NEXT_PUBLIC_VAULT_SEPOLIA"),
    governor: readAddress("NEXT_PUBLIC_GOVERNOR_SEPOLIA"),
  },
};

export function getAddresses(chainId: number | undefined): HiveAddresses {
  return (chainId !== undefined && ADDRESSES[chainId]) || ADDRESSES[1];
}

/** True iff the four core contracts have non-zero addresses on this chain. */
export function isLiveOn(chainId: number | undefined): boolean {
  const a = getAddresses(chainId);
  return (
    a.hive !== ZERO &&
    a.staking !== ZERO &&
    a.rewards !== ZERO &&
    a.vault !== ZERO
  );
}

/** True iff the governor is wired on this chain. */
export function hasGovernor(chainId: number | undefined): boolean {
  return getAddresses(chainId).governor !== ZERO;
}

export const SUPPORTED_CHAIN_IDS = Object.keys(ADDRESSES).map((s) => Number(s));
