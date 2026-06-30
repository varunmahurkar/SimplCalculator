import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

/**
 * Editorial/SEO content for calculators. Prose only — NEVER calculation logic.
 * Keyed by filename to match the registry slug. The MDX body is the long-form
 * guide; structured fields (formula, examples, faq) drive sections + JSON-LD.
 */
const calculators = defineCollection({
  loader: glob({ base: "./src/content/calculators", pattern: "**/*.mdx" }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    intro: z.string(),
    formula: z.object({
      expression: z.string(),
      explanation: z.string(),
      terms: z.array(z.object({ symbol: z.string(), meaning: z.string() })).default([]),
    }),
    examples: z
      .array(
        z.object({
          scenario: z.string(),
          detail: z.string(),
        }),
      )
      .default([]),
    faq: z
      .array(z.object({ q: z.string(), a: z.string() }))
      .default([]),
    keywords: z.array(z.string()).default([]),
  }),
});

export const collections = { calculators };
