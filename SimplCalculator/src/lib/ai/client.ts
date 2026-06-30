import { getAiConfig } from "./config";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatResult {
  text: string;
  model: string;
  /** Total tokens reported by the provider, when available. */
  totalTokens?: number;
}

/**
 * Call OpenRouter with DeepSeek primary and Gemini fallback.
 * Throws only if BOTH models fail (or no key). Callers handle that as
 * graceful degradation.
 */
export async function chat(
  messages: ChatMessage[],
  opts: { json?: boolean; timeoutMs?: number } = {},
): Promise<ChatResult> {
  const cfg = getAiConfig();
  if (!cfg.apiKey) throw new Error("no-api-key");

  const models = [cfg.primaryModel, cfg.fallbackModel];
  let lastErr: unknown;

  for (const model of models) {
    try {
      return await callOnce(model, messages, cfg, opts);
    } catch (err) {
      lastErr = err;
      // try the next model
    }
  }
  throw lastErr ?? new Error("ai-failed");
}

async function callOnce(
  model: string,
  messages: ChatMessage[],
  cfg: ReturnType<typeof getAiConfig>,
  opts: { json?: boolean; timeoutMs?: number },
): Promise<ChatResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 20_000);

  try {
    const res = await fetch(cfg.baseUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": cfg.referer,
        "X-Title": cfg.title,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.4,
        max_tokens: 1200,
        ...(opts.json ? { response_format: { type: "json_object" } } : {}),
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`openrouter ${res.status}: ${body.slice(0, 200)}`);
    }

    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
      usage?: { total_tokens?: number };
    };
    const text = json.choices?.[0]?.message?.content ?? "";
    if (!text) throw new Error("empty-completion");
    return { text, model, totalTokens: json.usage?.total_tokens };
  } finally {
    clearTimeout(timer);
  }
}

/** Extract a JSON object from a model response that may wrap it in prose/fences. */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("no-json");
  return JSON.parse(candidate.slice(start, end + 1));
}
