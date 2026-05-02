import { useAccount, useChainId, useReadContracts, useWriteContract } from "wagmi";
import { parseUnits, type Address } from "viem";
import { getAddresses, isLiveOn } from "@/lib/addresses";
import { HIVE_TOKEN_ABI, STAKING_ABI, REWARDS_ABI } from "@/lib/abis";

export function useHiveContext() {
  const chainId = useChainId();
  return { chainId, addresses: getAddresses(chainId), live: isLiveOn(chainId) };
}

export function useStakerData() {
  const { address } = useAccount();
  const { addresses, live } = useHiveContext();

  const { data, isLoading, refetch } = useReadContracts({
    allowFailure: true,
    query: { enabled: Boolean(address) && live, refetchInterval: 12_000 },
    contracts: address
      ? [
          { address: addresses.hive, abi: HIVE_TOKEN_ABI, functionName: "balanceOf", args: [address] },
          { address: addresses.hive, abi: HIVE_TOKEN_ABI, functionName: "allowance", args: [address, addresses.staking] },
          { address: addresses.staking, abi: STAKING_ABI, functionName: "stakes", args: [address] },
          { address: addresses.staking, abi: STAKING_ABI, functionName: "totalStaked" },
          { address: addresses.staking, abi: STAKING_ABI, functionName: "totalWeighted" },
          { address: addresses.staking, abi: STAKING_ABI, functionName: "effectiveWeighted" },
          { address: addresses.rewards, abi: REWARDS_ABI, functionName: "pendingHive", args: [address] },
          { address: addresses.rewards, abi: REWARDS_ABI, functionName: "pendingEth", args: [address] },
        ]
      : [],
  });

  // viem returns multi-output getters as a struct: { amount, lockEnd, lockDuration }.
  // Solidity public mappings of structs flatten the struct into named outputs in the ABI,
  // and viem decodes named outputs as objects. We accept either shape defensively.
  const rawStake = data?.[2]?.result as
    | { amount: bigint; lockEnd: bigint; lockDuration: bigint }
    | readonly [bigint, bigint, bigint]
    | undefined;
  const stake = rawStake
    ? Array.isArray(rawStake)
      ? { amount: rawStake[0], lockEnd: rawStake[1], lockDuration: rawStake[2] }
      : (rawStake as { amount: bigint; lockEnd: bigint; lockDuration: bigint })
    : undefined;

  return {
    isLoading,
    refetch,
    balance: (data?.[0]?.result as bigint | undefined) ?? 0n,
    allowance: (data?.[1]?.result as bigint | undefined) ?? 0n,
    staked: stake?.amount ?? 0n,
    lockEnd: Number(stake?.lockEnd ?? 0n),
    lockDuration: Number(stake?.lockDuration ?? 0n),
    totalStaked: (data?.[3]?.result as bigint | undefined) ?? 0n,
    totalWeighted: (data?.[4]?.result as bigint | undefined) ?? 0n,
    /** Same as `totalWeighted` minus the burn-floor (DEAD-seed) weight.
     *  Use this for any user-facing "weighted stake" / TVL metric so the
     *  MINIMUM_LIQUIDITY-style floor doesn't inflate the displayed number. */
    effectiveWeighted: (data?.[5]?.result as bigint | undefined) ?? 0n,
    pendingHive: (data?.[6]?.result as bigint | undefined) ?? 0n,
    pendingEth: (data?.[7]?.result as bigint | undefined) ?? 0n,
  };
}

export function useHiveActions() {
  const { addresses } = useHiveContext();
  const { writeContractAsync, isPending } = useWriteContract();

  return {
    isPending,
    approve: (amount: string) =>
      writeContractAsync({
        address: addresses.hive,
        abi: HIVE_TOKEN_ABI,
        functionName: "approve",
        args: [addresses.staking, parseUnits(amount, 18)],
      }),
    stake: (amount: string, lockSeconds: number) =>
      writeContractAsync({
        address: addresses.staking,
        abi: STAKING_ABI,
        functionName: "stake",
        args: [parseUnits(amount, 18), BigInt(lockSeconds)],
      }),
    unstake: () =>
      writeContractAsync({
        address: addresses.staking,
        abi: STAKING_ABI,
        functionName: "unstake",
      }),
    claim: (to: Address) =>
      writeContractAsync({
        address: addresses.staking,
        abi: STAKING_ABI,
        functionName: "claim",
        args: [to],
      }),
  };
}
