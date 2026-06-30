// ⌘K search palette. Filters the registry search index client-side.
import { searchIndex, type SearchEntry } from "../lib/calculators/registry";
import { categoryMap } from "../data/categories";

function categoryName(id: string): string {
  return categoryMap.get(id as any)?.name ?? id;
}

export function initSearchCommand(): void {
  const root = document.querySelector<HTMLElement>("[data-search-root]");
  if (!root) return;
  const dialog = root.querySelector<HTMLElement>("[data-search-dialog]")!;
  const input = root.querySelector<HTMLInputElement>("[data-search-input]")!;
  const list = root.querySelector<HTMLElement>("[data-search-results]")!;
  const empty = root.querySelector<HTMLElement>("[data-search-empty]")!;

  let activeIndex = 0;
  let current: SearchEntry[] = [];
  let lastFocused: HTMLElement | null = null;

  function open() {
    lastFocused = document.activeElement as HTMLElement | null;
    root!.removeAttribute("hidden");
    document.body.style.overflow = "hidden";
    input.value = "";
    render(searchIndex.slice(0, 8));
    requestAnimationFrame(() => input.focus());
  }
  function close() {
    root!.setAttribute("hidden", "");
    document.body.style.overflow = "";
    lastFocused?.focus?.();
  }

  function href(slug: string): string {
    const cat = searchIndex.find((s) => s.slug === slug)?.category ?? "finance";
    return `/calculators/${cat}/${slug}`;
  }

  function render(entries: SearchEntry[]) {
    current = entries;
    activeIndex = 0;
    if (!entries.length) {
      list.innerHTML = "";
      empty.removeAttribute("hidden");
      return;
    }
    empty.setAttribute("hidden", "");
    list.innerHTML = entries
      .map(
        (e, i) => `
      <a role="option" data-idx="${i}" href="${href(e.slug)}"
         class="flex items-start gap-3 rounded-md px-3 py-2.5 ${i === 0 ? "bg-canvas-soft-2" : ""}"
         aria-selected="${i === 0}">
        <span class="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-canvas-soft text-body text-caption font-mono">${categoryName(e.category).slice(0, 2)}</span>
        <span class="min-w-0">
          <span class="block text-body-sm font-medium text-ink">${e.title}</span>
          <span class="block truncate text-caption text-mute">${e.blurb}</span>
        </span>
      </a>`,
      )
      .join("");
  }

  function setActive(idx: number) {
    const items = list.querySelectorAll<HTMLElement>("[role=option]");
    if (!items.length) return;
    activeIndex = (idx + items.length) % items.length;
    items.forEach((el, i) => {
      const on = i === activeIndex;
      el.setAttribute("aria-selected", String(on));
      el.classList.toggle("bg-canvas-soft-2", on);
      if (on) el.scrollIntoView({ block: "nearest" });
    });
  }

  function search(q: string) {
    const query = q.trim().toLowerCase();
    if (!query) return render(searchIndex.slice(0, 8));
    const terms = query.split(/\s+/);
    const results = searchIndex
      .map((e) => ({ e, score: terms.reduce((a, t) => a + (e.keywords.includes(t) ? 1 : 0), 0) }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((r) => r.e);
    render(results);
  }

  input.addEventListener("input", () => search(input.value));
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive(activeIndex + 1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive(activeIndex - 1); }
    else if (e.key === "Enter") {
      e.preventDefault();
      const entry = current[activeIndex];
      if (entry) window.location.href = href(entry.slug);
    }
  });

  // Triggers + global shortcut
  document.querySelectorAll("[data-search-open]").forEach((b) => b.addEventListener("click", open));
  root.querySelectorAll("[data-search-close]").forEach((b) => b.addEventListener("click", close));
  dialog.addEventListener("click", (e) => e.stopPropagation());
  root.addEventListener("click", close);

  document.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      root.hasAttribute("hidden") ? open() : close();
    } else if (e.key === "Escape" && !root.hasAttribute("hidden")) {
      close();
    }
  });
}
