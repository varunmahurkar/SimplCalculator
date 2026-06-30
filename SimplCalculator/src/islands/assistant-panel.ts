// Global AI assistant — a calculation navigator. Posts a free-text situation
// to /api/ai/assistant and renders suggested calculators + a workflow chain.
import { searchIndex } from "../lib/calculators/registry";

interface AssistantData {
  intent: string;
  message: string;
  calculators: { slug: string; reason: string }[];
  workflow: string[];
}

function hrefFor(slug: string): string {
  const cat = searchIndex.find((s) => s.slug === slug)?.category ?? "finance";
  return `/calculators/${cat}/${slug}`;
}
function titleFor(slug: string): string {
  return searchIndex.find((s) => s.slug === slug)?.title ?? slug;
}

export function initAssistantPanel(): void {
  const root = document.querySelector<HTMLElement>("[data-assistant-root]");
  if (!root) return;
  const panel = root.querySelector<HTMLElement>("[data-assistant-dialog]")!;
  const form = root.querySelector<HTMLFormElement>("[data-assistant-form]")!;
  const input = root.querySelector<HTMLInputElement>("[data-assistant-input]")!;
  const output = root.querySelector<HTMLElement>("[data-assistant-output]")!;

  let lastFocused: HTMLElement | null = null;
  const open = () => {
    lastFocused = document.activeElement as HTMLElement | null;
    root.removeAttribute("hidden");
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => input.focus());
  };
  const close = () => {
    root.setAttribute("hidden", "");
    document.body.style.overflow = "";
    lastFocused?.focus?.();
  };

  function renderLoading() {
    output.innerHTML = `<div class="flex items-center gap-2 text-body-sm text-mute"><span class="h-2 w-2 animate-pulse rounded-full bg-link"></span> Thinking…</div>`;
  }

  function renderResult(data: AssistantData, degraded: boolean) {
    const cards = data.calculators
      .map(
        (c) => `
        <a href="${hrefFor(c.slug)}" class="block rounded-md border border-hairline bg-canvas p-3 transition-colors hover:bg-canvas-soft-2">
          <span class="block text-body-sm font-medium text-ink">${titleFor(c.slug)}</span>
          <span class="block text-caption text-body">${c.reason}</span>
        </a>`,
      )
      .join("");

    const chain =
      data.workflow.length > 1
        ? `<div class="mt-4">
            <p class="mb-2 font-mono text-caption uppercase tracking-wide text-mute">Suggested workflow</p>
            <div class="flex flex-wrap items-center gap-1.5">
              ${data.workflow
                .map(
                  (s, i) =>
                    `<a href="${hrefFor(s)}" class="rounded-pill border border-hairline px-2.5 py-1 text-caption text-ink hover:bg-canvas-soft-2">${titleFor(s)}</a>${i < data.workflow.length - 1 ? '<span class="text-mute">→</span>' : ""}`,
                )
                .join("")}
            </div>
          </div>`
        : "";

    output.innerHTML = `
      <p class="text-body-md text-ink">${data.message}</p>
      ${degraded ? '<p class="mt-1 text-caption text-mute">Showing matches from our catalog (live AI unavailable).</p>' : ""}
      <div class="mt-3 grid gap-2">${cards}</div>
      ${chain}`;
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const query = input.value.trim();
    if (!query) return;
    renderLoading();
    try {
      const res = await fetch("/api/ai/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      const payload = await res.json();
      renderResult(payload.data, payload.available === false);
    } catch {
      output.innerHTML = `<p class="text-body-sm text-error">Couldn't reach the assistant. Please try again.</p>`;
    }
  });

  root.querySelectorAll("[data-assistant-example]").forEach((el) =>
    el.addEventListener("click", () => {
      input.value = (el as HTMLElement).dataset.assistantExample ?? "";
      form.requestSubmit();
    }),
  );

  document.querySelectorAll("[data-assistant-open]").forEach((b) => b.addEventListener("click", open));
  root.querySelectorAll("[data-assistant-close]").forEach((b) => b.addEventListener("click", close));
  panel.addEventListener("click", (e) => e.stopPropagation());
  root.addEventListener("click", close);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !root.hasAttribute("hidden")) close();
  });
}
