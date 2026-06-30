// The calculator engine island. Binds the server-rendered form, runs the pure
// compute() on every change, re-renders results, mounts/updates charts, runs
// scenarios, fetches AI insights on demand, and handles shareable-URL state +
// printing. Only the active calculator's math is dynamically loaded.
import type { CalculatorDefinition, CalcResult } from "../types/calculator";
import { loadCalculator } from "../lib/calculators/client";
import { mountChart, type ManagedChart } from "../lib/charts/render";
import {
  metricsGridHTML,
  chartContainersHTML,
  scenarioTableHTML,
  insightsHTML,
  type ScenarioComputed,
} from "../lib/render/result-html";
import { encodeState, readStateFromUrl } from "../lib/report/state";
import {
  setActiveCurrencyCode,
  loadCurrencyPreference,
} from "../lib/currency";
import { CURRENCY_CHANGE_EVENT } from "./currency-select";
import { simpleInsight } from "../lib/insights/simple";
import { setCalcContext } from "../lib/calc-context";
import {
  addFavorite,
  removeFavorite,
  listFavorites,
  saveHistory,
  saveReport,
  currentUserId,
} from "../lib/data/user-data";
import { AUTH_CHANGED_EVENT, OPEN_AUTH_EVENT } from "./auth";

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

export async function initCalculatorApp(): Promise<void> {
  const root = document.querySelector<HTMLElement>("[data-calc-app]");
  if (!root) return;
  const slug = root.dataset.calcApp!;
  const def = await loadCalculator(slug);
  if (!def) return;

  const form = root.querySelector<HTMLFormElement>("[data-calc-form]")!;
  const resultsEl = root.querySelector<HTMLElement>("[data-results]")!;
  const chartsEl = root.querySelector<HTMLElement>("[data-charts]")!;
  const scenariosEl = root.querySelector<HTMLElement>("[data-scenarios]");
  const charts = new Map<string, ManagedChart>();

  // Seed any empty date field (e.g. Age "as of") with today.
  form.querySelectorAll<HTMLInputElement>('input[type="date"]').forEach((i) => {
    if (!i.value) i.value = todayISO();
  });

  // Currency: locale-bound calculators force their jurisdiction currency;
  // others follow the user's saved preference and react to dropdown changes.
  const localeBound = def.localeBound;
  function applyCurrency() {
    setActiveCurrencyCode(localeBound ? localeBound.currency : loadCurrencyPreference());
  }
  applyCurrency();

  // Hydrate from a shared URL if present.
  const shared = readStateFromUrl();
  if (shared) {
    for (const [k, v] of Object.entries(shared)) {
      const field = form.elements.namedItem(k) as HTMLInputElement | null;
      if (field) field.value = String(v);
    }
  }

  function readInputs(): Record<string, number | string> {
    const out: Record<string, number | string> = {};
    for (const f of def!.fields) {
      const el = form.elements.namedItem(f.name) as HTMLInputElement | HTMLSelectElement | null;
      if (!el) continue;
      const raw = el.value;
      out[f.name] =
        f.type === "select" || f.type === "date" || f.type === "text" ? raw : Number(raw);
    }
    return out;
  }

  function compute(inputs: Record<string, number | string>): CalcResult | null {
    const parsed = def!.schema.safeParse(inputs);
    if (!parsed.success) return null;
    try {
      return def!.compute(parsed.data);
    } catch {
      return null;
    }
  }

  function syncSliderLabels() {
    form.querySelectorAll<HTMLInputElement>('input[type="range"]').forEach((r) => {
      const out = form.querySelector<HTMLElement>(`[data-range-value="${r.name}"]`);
      if (out) out.textContent = r.value;
    });
  }

  async function renderCharts(result: CalcResult) {
    // (Re)build containers, then mount/update each chart.
    const existing = new Set(charts.keys());
    const wanted = new Set(result.charts.map((c) => c.id));
    if (![...wanted].every((id) => existing.has(id)) || existing.size !== wanted.size) {
      charts.forEach((c) => c.dispose());
      charts.clear();
      chartsEl.innerHTML = chartContainersHTML(result);
    }
    for (const spec of result.charts) {
      const el = chartsEl.querySelector<HTMLElement>(`[data-chart-id="${spec.id}"]`);
      if (!el) continue;
      const existingChart = charts.get(spec.id);
      if (existingChart) existingChart.update(spec);
      else charts.set(spec.id, await mountChart(el, spec));
    }
  }

  function renderScenarios(inputs: Record<string, number | string>) {
    if (!scenariosEl || !def!.scenarios?.length) return;
    const computed: ScenarioComputed[] = [];
    for (const preset of def!.scenarios) {
      const merged = { ...inputs, ...preset.overrides };
      const r = compute(merged);
      if (r) computed.push({ preset, result: r });
    }
    scenariosEl.innerHTML = scenarioTableHTML(computed);
  }

  const simpleEl = root.querySelector<HTMLElement>("[data-simple-insight]");
  function renderSimpleInsight(result: CalcResult) {
    if (!simpleEl) return;
    const tips = simpleInsight(slug, result);
    simpleEl.innerHTML = tips.length
      ? `<ul class="grid gap-1.5">${tips
          .map(
            (t) =>
              `<li class="flex gap-2 text-body-sm text-ink"><span aria-hidden="true" class="text-link">•</span><span>${escapeHtml(t)}</span></li>`,
          )
          .join("")}</ul>`
      : "";
  }

  let lastResult: CalcResult | null = null;
  async function update() {
    applyCurrency();
    const inputs = readInputs();
    const result = compute(inputs);
    if (!result) return;
    lastResult = result;
    setCalcContext({ slug, title: def.title, summary: result.summary });
    resultsEl.innerHTML = metricsGridHTML(result);
    renderSimpleInsight(result);
    await renderCharts(result);
    renderScenarios(inputs);
    updateShareLink(inputs);
  }

  // Re-run when the global currency changes (currency-agnostic calculators only).
  if (!localeBound) {
    window.addEventListener(CURRENCY_CHANGE_EVENT, () => update());
  }

  // ── Shareable URL + print ──────────────────────────────────────────────
  function updateShareLink(inputs: Record<string, number | string>) {
    const url = new URL(window.location.href);
    url.searchParams.set("s", encodeState(inputs));
    history.replaceState(null, "", url.toString());
  }

  root.querySelector("[data-action='share']")?.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      flash("Link copied to clipboard");
    } catch {
      flash("Copy this page's URL to share");
    }
  });
  root.querySelector("[data-action='print']")?.addEventListener("click", () => window.print());

  function flash(msg: string) {
    const el = root!.querySelector<HTMLElement>("[data-toast]");
    if (!el) return;
    el.textContent = msg;
    el.removeAttribute("hidden");
    setTimeout(() => el.setAttribute("hidden", ""), 2200);
  }

  // ── AI insights ────────────────────────────────────────────────────────
  const aiBtn = root.querySelector<HTMLButtonElement>("[data-action='ai']");
  const aiOut = root.querySelector<HTMLElement>("[data-ai-output]");

  // Append a "Save AI report" action under freshly rendered insights (signed-in).
  function addSaveReportButton(title: string, payload: unknown) {
    if (!aiOut) return;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.dataset.saveReport = "";
    btn.className =
      "mt-3 inline-flex h-9 items-center gap-1.5 rounded-md border border-hairline bg-canvas px-3 text-body-sm text-ink hover:bg-canvas-soft-2";
    btn.textContent = "Save this AI report";
    btn.addEventListener("click", async () => {
      const uid = await currentUserId();
      if (!uid) {
        window.dispatchEvent(new Event(OPEN_AUTH_EVENT));
        return;
      }
      const ok = await saveReport(uid, slug, title, payload);
      if (ok) {
        btn.textContent = "Saved ✓";
        btn.disabled = true;
      } else {
        btn.textContent = "Couldn't save — retry";
      }
    });
    aiOut.appendChild(btn);
  }
  aiBtn?.addEventListener("click", async () => {
    if (!aiOut || !lastResult) return;
    aiBtn.disabled = true;
    aiOut.innerHTML = `<div class="flex items-center gap-2 text-body-sm text-mute"><span class="h-2 w-2 animate-pulse rounded-full bg-link"></span> Generating insights…</div>`;
    try {
      const res = await fetch("/api/ai/insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: def!.title, summary: lastResult.summary }),
      });
      const payload = await res.json();
      if (payload.available) {
        aiOut.innerHTML = insightsHTML(payload.data);
        addSaveReportButton(`${def!.title} — AI analysis`, payload.data);
      } else {
        aiOut.innerHTML = `<div class="rounded-md border border-hairline bg-canvas-soft p-4 text-body-sm text-body">
          AI insights are currently unavailable. Your results above are fully calculated and accurate — add an <code class="font-mono text-caption">OPENROUTER_API_KEY</code> to enable AI analysis.</div>`;
      }
    } catch {
      aiOut.innerHTML = `<p class="text-body-sm text-error">Couldn't generate insights. Please try again.</p>`;
    } finally {
      aiBtn.disabled = false;
    }
  });

  // ── Saved data (favorites + history) — signed-in only ────────────────────
  const favBtn = root.querySelector<HTMLButtonElement>("[data-fav-toggle]");
  const saveBtn = root.querySelector<HTMLButtonElement>("[data-save-history]");

  async function refreshSavedUi() {
    const uid = await currentUserId();
    const signedIn = !!uid;
    if (saveBtn) saveBtn.hidden = !signedIn;
    if (favBtn) {
      favBtn.hidden = !signedIn;
      if (signedIn) {
        const favs = await listFavorites();
        const on = favs.some((f) => f.slug === slug);
        favBtn.setAttribute("aria-pressed", on ? "true" : "false");
        favBtn.lastChild!.textContent = on ? " Saved" : " Save";
      }
    }
  }

  favBtn?.addEventListener("click", async () => {
    const uid = await currentUserId();
    if (!uid) {
      window.dispatchEvent(new Event(OPEN_AUTH_EVENT));
      return;
    }
    const on = favBtn.getAttribute("aria-pressed") === "true";
    const ok = on ? await removeFavorite(slug) : await addFavorite(uid, slug);
    if (!ok) {
      flash("Couldn't update favorites — please try again");
      return;
    }
    await refreshSavedUi();
    flash(on ? "Removed from favorites" : "Saved to favorites");
  });

  saveBtn?.addEventListener("click", async () => {
    const uid = await currentUserId();
    if (!uid) {
      window.dispatchEvent(new Event(OPEN_AUTH_EVENT));
      return;
    }
    if (!lastResult) return;
    const ok = await saveHistory(uid, slug, readInputs(), lastResult);
    flash(ok ? "Result saved to your history" : "Couldn't save your result — please try again");
  });

  window.addEventListener(AUTH_CHANGED_EVENT, () => {
    void refreshSavedUi();
  });
  void refreshSavedUi();

  // ── Wire events ──────────────────────────────────────────────────────────
  form.addEventListener("input", () => {
    syncSliderLabels();
    update();
  });
  form.addEventListener("submit", (e) => e.preventDefault());

  // Re-theme charts when the theme changes.
  new MutationObserver(() => {
    if (lastResult) renderCharts(lastResult);
  }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

  syncSliderLabels();
  await update();
}
