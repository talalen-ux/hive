import Anthropic from "@anthropic-ai/sdk";
import { env } from "./env.js";
import { generateIdeas } from "./ai.js";
import {
  assertOracleAuthorized,
  buildChainContext,
  getRecentTitles,
  postProposal,
} from "./chain.js";

const HOUR = 60 * 60;

async function main() {
  console.log(`[oracle] starting — chain ${env.chainId}, governor ${env.governor}`);

  const ctx = buildChainContext({
    chainId: env.chainId,
    rpcUrl: env.rpcUrl,
    governor: env.governor,
    privateKey: env.privateKey,
  });

  if (!env.dryRun) {
    await assertOracleAuthorized(ctx);
    console.log(`[oracle] authorized as ${ctx.oracleAddress}`);
  } else {
    console.log("[oracle] DRY_RUN=true — skipping on-chain writes");
  }

  const recentTitles = await getRecentTitles(ctx, 20);
  console.log(`[oracle] ${recentTitles.length} recent titles loaded for dedup`);

  const anthropic = new Anthropic({ apiKey: env.anthropicApiKey });
  const batch = await generateIdeas(anthropic, recentTitles, env.ideasPerRun);

  console.log(`[oracle] Claude returned ${batch.ideas.length} ideas`);
  for (const idea of batch.ideas) {
    console.log(
      `  · ${idea.title} (${idea.category}, complexity ${idea.complexity}, market ${idea.marketPotential}) — ${idea.buildTime}`,
    );
  }

  // Post-generation dedup: case-insensitive title match against recent titles.
  // Claude is asked to avoid these but we belt-and-suspenders here.
  const recentLower = new Set(recentTitles.map((t) => t.toLowerCase().trim()));
  const fresh = batch.ideas.filter(
    (i) => !recentLower.has(i.title.toLowerCase().trim()),
  );
  if (fresh.length < batch.ideas.length) {
    console.log(
      `[oracle] dropped ${batch.ideas.length - fresh.length} idea(s) that duplicated recent titles`,
    );
  }
  if (fresh.length === 0) {
    console.log("[oracle] nothing new to post; exiting cleanly");
    return;
  }

  if (env.dryRun) {
    console.log("[oracle] dry-run done; not posting on-chain");
    return;
  }

  const votingEnd = BigInt(
    Math.floor(Date.now() / 1000) + env.votingWindowHours * HOUR,
  );

  let posted = 0;
  for (const idea of fresh) {
    try {
      const { hash } = await postProposal(ctx, idea, votingEnd);
      console.log(`[oracle] posted "${idea.title}" — ${hash}`);
      posted += 1;
    } catch (err) {
      console.error(
        `[oracle] failed to post "${idea.title}":`,
        err instanceof Error ? err.message : err,
      );
      // Continue with the rest — one bad idea shouldn't sink the batch.
    }
  }
  console.log(`[oracle] done — ${posted}/${fresh.length} proposals posted`);
}

main().catch((err) => {
  console.error("[oracle] fatal:", err);
  process.exit(1);
});
