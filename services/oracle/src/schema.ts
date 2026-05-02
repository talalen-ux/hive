import { z } from "zod";

/**
 * The Zod schema is the source of truth for the structured output we expect
 * from Claude. The Anthropic SDK validates responses against this schema
 * automatically via `messages.parse()`. Constraints that aren't expressible in
 * JSON Schema (`min`/`max`/regex) are validated client-side by Zod after
 * parsing — see the claude-api skill notes on Structured Outputs.
 */

export const CATEGORIES = ["consumer", "defi", "infra", "social", "tooling"] as const;

export const IdeaSchema = z.object({
  title: z
    .string()
    .min(2)
    .max(40)
    .describe("Short, brandable name for the project. 1–3 words."),
  description: z
    .string()
    .min(40)
    .max(280)
    .describe(
      "One- or two-sentence pitch. Concrete, opinionated, mentions the wedge.",
    ),
  category: z
    .enum(CATEGORIES)
    .describe("Best-fit segment for the idea."),
  buildTime: z
    .string()
    .regex(/^\d+\s+(weeks|days|months)$/)
    .describe(
      "Engineer-time estimate to a usable v1 — e.g. '3 weeks', '5 weeks'.",
    ),
  complexity: z
    .number()
    .int()
    .min(1)
    .max(10)
    .describe(
      "1 = trivial CRUD, 10 = novel cryptography or distributed-systems risk.",
    ),
  marketPotential: z
    .number()
    .int()
    .min(1)
    .max(10)
    .describe(
      "1 = niche curiosity, 10 = could be a category-defining product.",
    ),
});

export const BatchSchema = z.object({
  ideas: z.array(IdeaSchema).min(1).max(8),
});

export type Idea = z.infer<typeof IdeaSchema>;
export type Batch = z.infer<typeof BatchSchema>;
