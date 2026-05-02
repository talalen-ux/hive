import {
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient,
  createPublicClient,
  createWalletClient,
  http,
  isAddress,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mainnet, sepolia } from "viem/chains";
import { GOVERNOR_ABI } from "./abi.js";
import type { Idea } from "./schema.js";

export type ChainContext = {
  publicClient: PublicClient;
  walletClient: WalletClient;
  governor: Address;
  oracleAddress: Address;
};

const CHAINS = { 1: mainnet, 11155111: sepolia } as const;
type SupportedChainId = keyof typeof CHAINS;

export function buildChainContext(env: {
  chainId: number;
  rpcUrl: string;
  governor: string;
  privateKey: string;
}): ChainContext {
  if (!isAddress(env.governor)) {
    throw new Error(`GOVERNOR_ADDRESS is not a valid address: ${env.governor}`);
  }
  if (!(env.chainId in CHAINS)) {
    throw new Error(`unsupported chainId: ${env.chainId}`);
  }
  const chain = CHAINS[env.chainId as SupportedChainId];
  const account = privateKeyToAccount(env.privateKey as Hex);
  const transport = http(env.rpcUrl);
  return {
    publicClient: createPublicClient({ chain, transport }),
    walletClient: createWalletClient({ account, chain, transport }),
    governor: env.governor as Address,
    oracleAddress: account.address,
  };
}

/**
 * Sanity-check the wired oracle account matches HiveGovernor.oracle() before
 * we waste a Claude call generating ideas we can't post.
 */
export async function assertOracleAuthorized(ctx: ChainContext): Promise<void> {
  const onchainOracle = await ctx.publicClient.readContract({
    address: ctx.governor,
    abi: GOVERNOR_ABI,
    functionName: "oracle",
  });
  if (onchainOracle.toLowerCase() !== ctx.oracleAddress.toLowerCase()) {
    throw new Error(
      `wired private key (${ctx.oracleAddress}) does not match ` +
        `governor.oracle() (${onchainOracle}). check ORACLE_PRIVATE_KEY.`,
    );
  }
}

/**
 * Pull the most recent N proposal titles for dedup. Skips reads that fail
 * (e.g. id 0 — proposals are 1-indexed).
 */
export async function getRecentTitles(
  ctx: ChainContext,
  limit: number,
): Promise<string[]> {
  const count = await ctx.publicClient.readContract({
    address: ctx.governor,
    abi: GOVERNOR_ABI,
    functionName: "proposalCount",
  });
  const total = Number(count);
  if (total === 0) return [];

  const ids: bigint[] = [];
  for (let i = 0; i < Math.min(limit, total); i++) {
    ids.push(BigInt(total - i));
  }

  const reads = await Promise.all(
    ids.map((id) =>
      ctx.publicClient
        .readContract({
          address: ctx.governor,
          abi: GOVERNOR_ABI,
          functionName: "proposals",
          args: [id],
        })
        .catch(() => undefined),
    ),
  );

  // proposals() returns a tuple in the order declared in the struct
  return reads
    .map((r) => (Array.isArray(r) ? (r[0] as string) : undefined))
    .filter((t): t is string => Boolean(t));
}

export async function postProposal(
  ctx: ChainContext,
  idea: Idea,
  votingEndUnixSec: bigint,
): Promise<{ hash: Hex; id?: bigint }> {
  const { request } = await ctx.publicClient.simulateContract({
    account: ctx.walletClient.account!,
    address: ctx.governor,
    abi: GOVERNOR_ABI,
    functionName: "createProposal",
    args: [
      idea.title,
      idea.description,
      idea.category,
      idea.buildTime,
      idea.complexity,
      idea.marketPotential,
      votingEndUnixSec,
      0n, // threshold = 0 → contract picks 1% of totalWeighted
    ],
  });

  const hash = await ctx.walletClient.writeContract(request);
  const receipt = await ctx.publicClient.waitForTransactionReceipt({ hash });
  return { hash, id: receipt.status === "success" ? undefined : undefined };
}
