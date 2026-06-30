import { z } from "zod";

// ── Calculator insights ───────────────────────────────────────────────────
export const insightItemSchema = z.object({
  title: z.string(),
  detail: z.string(),
});

export const insightsSchema = z.object({
  summary: z.string().default(""),
  insights: z.array(insightItemSchema).max(5).default([]),
  risks: z.array(insightItemSchema).max(4).default([]),
  opportunities: z.array(insightItemSchema).max(4).default([]),
  recommendations: z.array(z.string()).max(5).default([]),
});
export type Insights = z.infer<typeof insightsSchema>;

// ── Global assistant ───────────────────────────────────────────────────────
export const assistantSchema = z.object({
  intent: z.string().default("matched"),
  message: z.string().default("Here are the calculators that fit what you described."),
  calculators: z
    .array(
      z.object({
        slug: z.string(),
        reason: z.string().default(""),
      }),
    )
    .max(6)
    .default([]),
  workflow: z.array(z.string()).max(6).default([]),
});
export type AssistantResult = z.infer<typeof assistantSchema>;

// ── API envelopes (discriminated on `available`) ─────────────────────────────
export type InsightsResponse =
  | { available: true; data: Insights; model: string }
  | { available: false; reason: string };

export type AssistantResponse =
  | { available: true; data: AssistantResult; model: string }
  | { available: false; data: AssistantResult; reason: string };
