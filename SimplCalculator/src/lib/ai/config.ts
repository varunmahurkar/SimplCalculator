// OpenRouter configuration. The key is read at runtime (Node adapter) from the
// environment; missing key → AI features degrade gracefully (never crash).

export interface AiConfig {
  apiKey: string | undefined;
  primaryModel: string;
  fallbackModel: string;
  baseUrl: string;
  referer: string;
  title: string;
}

export function getAiConfig(): AiConfig {
  const apiKey =
    (typeof process !== "undefined" && process.env?.OPENROUTER_API_KEY) ||
    // @ts-ignore - import.meta.env available in Astro/Vite
    (import.meta.env?.OPENROUTER_API_KEY as string | undefined) ||
    undefined;

  return {
    apiKey,
    // DeepSeek primary, Gemini fallback (per spec).
    primaryModel:
      (typeof process !== "undefined" && process.env?.OPENROUTER_PRIMARY_MODEL) ||
      "deepseek/deepseek-chat",
    fallbackModel:
      (typeof process !== "undefined" && process.env?.OPENROUTER_FALLBACK_MODEL) ||
      "google/gemini-2.0-flash-001",
    baseUrl: "https://openrouter.ai/api/v1/chat/completions",
    referer: "https://simplcalculator.com",
    title: "Simpl Calculator",
  };
}

export function aiAvailable(): boolean {
  return !!getAiConfig().apiKey;
}
