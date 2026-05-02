import Anthropic from "@anthropic-ai/sdk";
import { env } from "./env.js";
import { generateIdeas } from "./ai.js";
import {
  assertOracleAuthorized,
  buildChainContext,
  describeChainError,
  getRecentTitles,
  normalizeTitle,
  postProposal,
  sanitizeUserString,
  type ChainContext,
} from "./chain.js";
import { GOVERNOR_ABI, STAKING_VIEW_ABI } from "./abi.js";
import type { Idea } from "./schema.js";

const HOUR = 60 * 60;

// Floor for the per-proposal quorum threshold. Must be > 0 (the contract
// rejects threshold == 0 — audit H-G2). 1 weight unit is enough to be
// non-zero; the oracle should pass a meaningful value once `totalWeighted`
// is established. Today we use 1% of effectiveWeighted, computed below.
const ABSOLUTE_MIN_THRESHOLD = 1n;

// Safety margin above the contract's 24h voting-window floor: a few minutes
// of clock drift / RPC delay between simulate and write must not push the
// final block.timestamp outside the [24h, 7d] window.
const VOTING_END_SAFETY_PAD_SEC = 5 * 60;

async function main() {
  console.log(`[oracle] starting — chain ${env.chainId}, governor ${env.governor}`);

  const ctx = buildChainContext({
    chainId: env.chainId,
    rpcUrl: env.rpcUrl,
    governor: env.governor,
    privateKey: env.privateKey,
  });

  // Always run the auth check, including in dry-run, so smoke tests catch
  // misconfigured keys before paying for a Claude call.
  await assertOracleAuthorized(ctx);
  console.log(`[oracle] authorized as ${ctx.oracleAddress}`);
  if (env.dryRun) {
    console.log("[oracle] DRY_RUN=true — skipping on-chain writes");
  }

  // Pull a wide history (200) for dedup. Multicall keeps the cost flat.
  const recentTitles = await getRecentTitles(ctx, 200);
  console.log(`[oracle] ${recentTitles.length} recent titles loaded for dedup`);

  const anthropic = new Anthropic({ apiKey: env.anthropicApiKey });
  const batch = await generateIdeas(anthropic, recentTitles, env.ideasPerRun);

  console.log(`[oracle] Claude returned ${batch.ideas.length} ideas`);
  for (const idea of batch.ideas) {
    console.log(
      `  · ${idea.title} (${idea.category}, complexity ${idea.complexity}, market ${idea.marketPotential}) — ${idea.buildTime}`,
    );
  }

  // Sanitize content + dedup against normalized history.
  const normalizedRecent = new Set(recentTitles.map(normalizeTitle));
  const sanitized: Idea[] = [];
  for (const raw of batch.ideas) {
    const idea: Idea = {
      title: sanitizeUserString(raw.title, 80),
      description: sanitizeUserString(raw.description, 1024),
      // Category passed through Zod is already enum-typed; sanitize is
      // for control-char hygiene only and doesn't change the value.
      category: raw.category,
      buildTime: sanitizeUserString(raw.buildTime, 32),
      complexity: raw.complexity,
      marketPotential: raw.marketPotential,
    };
    if (!idea.title || !idea.description) continue;
    const norm = normalizeTitle(idea.title);
    if (norm.length === 0) continue;
    if (normalizedRecent.has(norm)) {
      console.log(`[oracle] dropped "${idea.title}" — duplicates a recent title`);
      continue;
    }
    // Also dedup within this same batch.
    if (sanitized.some((i) => normalizeTitle(i.title) === norm)) {
      console.log(`[oracle] dropped "${idea.title}" — duplicates an earlier idea in this batch`);
      continue;
    }
    sanitized.push(idea);
  }
  if (sanitized.length === 0) {
    console.log("[oracle] nothing new to post; exiting cleanly");
    return;
  }

  if (env.dryRun) {
    console.log("[oracle] dry-run done; not posting on-chain");
    return;
  }

  // Compute a single threshold for this batch from current totalWeighted.
  // The contract rejects threshold == 0, and computing per-idea would let a
  // sandwich actor manipulate weight between txs (audit H-G2). One snapshot
  // for the whole batch keeps the surface tight.
  const threshold = await snapshotThreshold(ctx);

  let posted = 0;
  for (const idea of sanitized) {
    // Recompute votingEnd per-idea so a slow batch doesn't drift any
    // single proposal outside the contract's [24h, 7d] window.
    const nowSec = Math.floor(Date.now() / 1000);
    const votingEnd = BigInt(
      nowSec + env.votingWindowHours * HOUR + VOTING_END_SAFETY_PAD_SEC,
    );

    try {
      const { hash, id } = await postProposal(ctx, idea, votingEnd, threshold);
      console.log(
        `[oracle] posted "${idea.title}" — id=${id ?? "?"} tx=${hash}`,
      );
      posted += 1;
    } catch (err) {
      console.error(
        `[oracle] failed to post "${idea.title}": ${describeChainError(err)}`,
      );
      // Continue with the rest — one bad idea shouldn't sink the batch.
    }
  }
  console.log(`[oracle] done — ${posted}/${sanitized.length} proposals posted`);
}

async function snapshotThreshold(ctx: ChainContext): Promise<bigint> {
  // Read the staking address from the governor and snapshot totalWeighted
  // once for this batch. Threshold = 1% of weighted, floored at 1 (the
  // contract requires non-zero).
  const stakingAddr = await ctx.publicClient.readContract({
    address: ctx.governor,
    abi: GOVERNOR_ABI,
    functionName: "staking",
  });
  const totalWeighted = await ctx.publicClient.readContract({
    address: stakingAddr,
    abi: STAKING_VIEW_ABI,
    functionName: "totalWeighted",
  });
  const onePct = totalWeighted / 100n;
  return onePct > ABSOLUTE_MIN_THRESHOLD ? onePct : ABSOLUTE_MIN_THRESHOLD;
}

main().catch((err) => {
  console.error("[oracle] fatal:", err);
  process.exit(1);
});
