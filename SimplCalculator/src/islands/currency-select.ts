// Currency dropdown island. Persists the choice and broadcasts a change so any
// active calculator re-runs compute() with the new currency formatting.
import {
  CURRENCIES,
  loadCurrencyPreference,
  saveCurrencyPreference,
  setActiveCurrencyCode,
} from "../lib/currency";

export const CURRENCY_CHANGE_EVENT = "simpl:currency-change";

export function initCurrencySelect(): void {
  // Apply the saved preference to the shared store as early as possible.
  const pref = loadCurrencyPreference();
  setActiveCurrencyCode(pref);

  const selects = document.querySelectorAll<HTMLSelectElement>("[data-currency-select]");
  selects.forEach((sel) => {
    sel.value = pref;
    sel.addEventListener("change", () => {
      const code = sel.value;
      if (!CURRENCIES.some((c) => c.code === code)) return;
      setActiveCurrencyCode(code);
      saveCurrencyPreference(code);
      // keep other instances in sync
      selects.forEach((s) => (s.value = code));
      window.dispatchEvent(new CustomEvent(CURRENCY_CHANGE_EVENT, { detail: { code } }));
    });
  });
}
