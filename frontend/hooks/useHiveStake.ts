import { useAccount, useChainId, useReadContracts, useWriteContract } from "wagmi";
import { parseUnits, type Address } from "viem";
import { ADDRESSES } from "@/lib/addresses";
import { HIVE_TOKEN_ABI, STAKING_ABI, REWARDS_ABI } from "@/lib/abis";

export function useHiveContext() {
  const chainId = useChainId();
  const a = ADDRESSES[chainId] ?? ADDRESSES[1];
  return { chainId, addresses: a };
}

export function useStakerData() {
  const { address } = useAccount();
  const { addresses } = useHiveContext();

  const { data, isLoading, refetch } = useReadContracts({
    allowFailure: true,
    query: { enabled: Boolean(address), refetchInterval: 12_000 },
    contracts: address
      ? [
          { address: addresses.hive, abi: HIVE_TOKEN_ABI, functionName: "balanceOf", args: [address] },
          { address: addresses.hive, abi: HIVE_TOKEN_ABI, functionName: "allowance", args: [address, addresses.staking] },
          { address: addresses.staking, abi: STAKING_ABI, functionName: "stakes", args: [address] },
          { address: addresses.staking, abi: STAKING_ABI, functionName: "totalStaked" },
          { address: addresses.staking, abi: STAKING_ABI, functionName: "totalWeighted" },
          { address: addresses.rewards, abi: REWARDS_ABI, functionName: "pendingHive", args: [address] },
          { address: addresses.rewards, abi: REWARDS_ABI, functionName: "pendingEth", args: [address] },
        ]
      : [],
  });

  const stakeTuple = data?.[2]?.result as readonly [bigint, bigint, bigint] | undefined;

  return {
    isLoading,
    refetch,
    balance: (data?.[0]?.result as bigint | undefined) ?? 0n,
    allowance: (data?.[1]?.result as bigint | undefined) ?? 0n,
    staked: stakeTuple?.[0] ?? 0n,
    lockEnd: Number(stakeTuple?.[1] ?? 0n),
    lockDuration: Number(stakeTuple?.[2] ?? 0n),
    totalStaked: (data?.[3]?.result as bigint | undefined) ?? 0n,
    totalWeighted: (data?.[4]?.result as bigint | undefined) ?? 0n,
    pendingHive: (data?.[5]?.result as bigint | undefined) ?? 0n,
    pendingEth: (data?.[6]?.result as bigint | undefined) ?? 0n,
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
