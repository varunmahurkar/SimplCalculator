// Theme toggle island — cycles system → light → dark, persists to localStorage,
// and reflects the system preference live. The pre-paint script in BaseLayout
// already sets data-theme on first load; this only handles user interaction.

type ThemePref = "system" | "light" | "dark";

const STORAGE_KEY = "theme";
const ORDER: ThemePref[] = ["system", "light", "dark"];

const ICONS: Record<ThemePref, string> = {
  // monitor
  system:
    '<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>',
  // sun
  light:
    '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>',
  // moon
  dark: '<path d="M21 12.8A9 9 0 1111.2 3 7 7 0 0021 12.8z"/>',
};

function getPref(): ThemePref {
  const v = localStorage.getItem(STORAGE_KEY) as ThemePref | null;
  return v && ORDER.includes(v) ? v : "system";
}

function systemDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function apply(pref: ThemePref): void {
  const dark = pref === "dark" || (pref === "system" && systemDark());
  document.documentElement.dataset.theme = dark ? "dark" : "light";
}

function render(btn: HTMLButtonElement, pref: ThemePref): void {
  const svg = btn.querySelector("svg");
  if (svg) svg.innerHTML = ICONS[pref];
  btn.setAttribute("aria-label", `Theme: ${pref}. Click to change.`);
  btn.dataset.pref = pref;
}

export function initThemeToggle(): void {
  const buttons = document.querySelectorAll<HTMLButtonElement>(
    "[data-theme-toggle]",
  );
  if (!buttons.length) return;

  let pref = getPref();
  buttons.forEach((b) => render(b, pref));

  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const next = ORDER[(ORDER.indexOf(pref) + 1) % ORDER.length];
      pref = next;
      localStorage.setItem(STORAGE_KEY, next);
      apply(next);
      buttons.forEach((b) => render(b, next));
    });
  });

  // React to OS theme changes while on "system".
  window
    .matchMedia("(prefers-color-scheme: dark)")
    .addEventListener("change", () => {
      if (pref === "system") apply("system");
    });
}
