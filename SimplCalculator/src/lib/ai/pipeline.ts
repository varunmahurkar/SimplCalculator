import { chat, extractJson } from "./client";
import {
  insightsSchema,
  assistantSchema,
  type InsightsResponse,
  type AssistantResponse,
  type AssistantResult,
} from "./schemas";
import { searchIndex } from "../calculators/registry";

// ── Calculator insights ───────────────────────────────────────────────────
export async function generateInsights(input: {
  title: string;
  summary: Record<string, number | string>;
}): Promise<InsightsResponse> {
  const system =
    "You are a precise financial/quantitative analyst for a calculator platform. " +
    "Given a calculator's inputs and computed results, return STRICT JSON matching this shape: " +
    '{"summary":string,"insights":[{"title","detail"}],"risks":[{"title","detail"}],' +
    '"opportunities":[{"title","detail"}],"recommendations":[string]}. ' +
    "Be concrete, reference the actual numbers, keep each detail under 240 characters. " +
    "No markdown, no commentary outside the JSON.";

  const user = `Calculator: ${input.title}\nResults: ${JSON.stringify(input.summary)}`;

  try {
    const { text, model } = await chat(
      [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      { json: true },
    );
    const data = insightsSchema.parse(extractJson(text));
    return { available: true, data, model };
  } catch (err) {
    return {
      available: false,
      reason: err instanceof Error ? err.message : "unknown",
    };
  }
}

// ── Global assistant (with local heuristic fallback) ─────────────────────────
export async function runAssistant(query: string): Promise<AssistantResponse> {
  const fallback = heuristicAssistant(query);

  const slugs = searchIndex.map((s) => s.slug).join(", ");
  const system =
    "You are the calculation navigator for Simpl Calculator. " +
    `Available calculator slugs: [${slugs}]. ` +
    "Given a user's situation, return STRICT JSON: " +
    '{"intent":string,"message":string,"calculators":[{"slug","reason"}],"workflow":[slug...]}. ' +
    "Only use slugs from the provided list. message is one friendly sentence. " +
    "workflow is an ordered list of slugs forming a sensible sequence. No markdown.";

  try {
    const { text, model } = await chat(
      [
        { role: "system", content: system },
        { role: "user", content: query },
      ],
      { json: true },
    );
    const parsed = assistantSchema.parse(extractJson(text));
    // Guard against hallucinated slugs.
    const valid = new Set(searchIndex.map((s) => s.slug));
    const data: AssistantResult = {
      ...parsed,
      calculators: parsed.calculators.filter((c) => valid.has(c.slug)),
      workflow: parsed.workflow.filter((s) => valid.has(s)),
    };
    if (!data.calculators.length) return { available: true, data: fallback, model };
    return { available: true, data, model };
  } catch (err) {
    return {
      available: false,
      data: fallback,
      reason: err instanceof Error ? err.message : "unknown",
    };
  }
}

/** Keyword-based mapping so the assistant works even without an API key. */
export function heuristicAssistant(query: string): AssistantResult {
  const q = query.toLowerCase();
  const hits = searchIndex
    .map((s) => {
      let score = 0;
      for (const term of q.split(/\s+/).filter((t) => t.length > 2)) {
        if (s.keywords.includes(term)) score += 1;
      }
      // domain hints
      if (/(loan|house|home|emi|mortgage|buy)/.test(q) && s.slug === "emi") score += 3;
      if (/(invest|sip|mutual|wealth|save)/.test(q) && s.slug === "sip") score += 3;
      if (/(interest|grow|compound|deposit|fd)/.test(q) && s.slug === "compound-interest") score += 3;
      if (/(weight|bmi|health|fit|body)/.test(q) && s.slug === "bmi") score += 3;
      if (/(percent|%|discount|tax|gst|tip)/.test(q) && s.slug === "percentage") score += 3;
      if (/(age|birthday|born|old)/.test(q) && s.slug === "age") score += 3;
      return { s, score };
    })
    .filter((h) => h.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);

  const picks = hits.length ? hits.map((h) => h.s) : searchIndex.slice(0, 3);

  return {
    intent: hits.length ? "matched" : "browse",
    message: hits.length
      ? "Here are the calculators that fit what you described."
      : "Here are some popular calculators to get you started.",
    calculators: picks.map((s) => ({
      slug: s.slug,
      reason: s.blurb,
    })),
    workflow: picks.map((s) => s.slug),
  };
}
