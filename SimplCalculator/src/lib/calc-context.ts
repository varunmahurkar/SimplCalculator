// Tiny shared singleton so the chat island can read the calculator's current
// title + result summary that the calculator-app island keeps up to date.
// Both islands import this module, which Vite dedupes into one shared chunk.

export interface CalcContext {
  slug: string;
  title: string;
  summary: Record<string, number | string>;
}

let ctx: CalcContext = { slug: "", title: "", summary: {} };

export function setCalcContext(next: CalcContext): void {
  ctx = next;
}

export function getCalcContext(): CalcContext {
  return ctx;
}
