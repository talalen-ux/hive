import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { BatchSchema, type Batch } from "./schema.js";
import { SYSTEM_PROMPT } from "./prompt.js";

/**
 * Generate `count` ideas via Claude with structured-output validation.
 *
 * Caching strategy:
 *   - The system prompt is stable across runs → marked with cache_control so
 *     the prefix (system + tools + zodOutputFormat schema) is reused.
 *   - The dedup list and idea count are volatile → live in the user message
 *     after the cache breakpoint, so changes to them don't invalidate the
 *     cached prefix.
 *
 * Verify cache hits by inspecting `response.usage.cache_read_input_tokens`
 * across consecutive runs; if it's zero something silently invalidated.
 */
export async function generateIdeas(
  client: Anthropic,
  recentTitles: string[],
  count: number,
): Promise<Batch> {
  const dedupBlock =
    recentTitles.length === 0
      ? "(no prior proposals — this is the first batch)"
      : recentTitles.map((t) => `  - ${t}`).join("\n");

  const userMessage = [
    `Generate ${count} fresh startup ideas for the Hive incubator.`,
    "",
    "Recent on-chain proposals to AVOID duplicating (in name or theme):",
    dedupBlock,
    "",
    "Vary categories and wedge types across the batch. Do not return more than",
    `${count} ideas.`,
  ].join("\n");

  const response = await client.messages.parse({
    model: "claude-opus-4-7",
    max_tokens: 8000,
    system: [
      {
        type: "text",
        text: SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: userMessage }],
    output_config: {
      format: zodOutputFormat(BatchSchema),
      effort: "medium",
    },
  });

  if (response.usage) {
    const u = response.usage;
    console.log(
      `[ai] tokens — in:${u.input_tokens} out:${u.output_tokens} ` +
        `cache_read:${u.cache_read_input_tokens ?? 0} ` +
        `cache_write:${u.cache_creation_input_tokens ?? 0}`,
    );
  }

  if (!response.parsed_output) {
    throw new Error(
      `claude returned unparseable output (stop_reason=${response.stop_reason})`,
    );
  }
  return response.parsed_output;
}
