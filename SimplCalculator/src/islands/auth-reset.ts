// Password-recovery page island. The email link signs the user into a recovery
// session; here they set a new password.
import { getSupabase, updatePassword } from "../lib/supabase";

export function initAuthReset(): void {
  const root = document.querySelector<HTMLElement>("[data-reset-root]");
  if (!root) return;
  const form = root.querySelector<HTMLFormElement>("[data-reset-form]")!;
  const pw = form.elements.namedItem("password") as HTMLInputElement;
  const toggle = root.querySelector<HTMLButtonElement>("[data-pw-toggle]")!;
  const msg = root.querySelector<HTMLElement>("[data-reset-msg]")!;
  const waiting = root.querySelector<HTMLElement>("[data-reset-waiting]")!;

  function showMsg(text: string, kind: "error" | "ok" = "error") {
    msg.textContent = text;
    msg.className = `text-caption ${kind === "ok" ? "text-cyan-deep" : "text-error"}`;
    msg.hidden = !text;
  }

  toggle.addEventListener("click", () => {
    pw.type = pw.type === "password" ? "text" : "password";
    toggle.setAttribute("aria-pressed", pw.type === "text" ? "true" : "false");
  });

  const sb = getSupabase();
  if (!sb) {
    waiting.textContent = "Auth is not configured.";
    return;
  }

  // Reveal the form once a recovery session is present.
  sb.auth.onAuthStateChange((event, session) => {
    if (session || event === "PASSWORD_RECOVERY") {
      waiting.hidden = true;
      form.hidden = false;
    }
  });
  sb.auth.getSession().then(({ data }) => {
    if (data.session) {
      waiting.hidden = true;
      form.hidden = false;
    }
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    showMsg("");
    if (pw.value.length < 6) { showMsg("Password must be at least 6 characters."); return; }
    const { error } = await updatePassword(pw.value);
    if (error) { showMsg(error); return; }
    showMsg("Password updated. Redirecting to your account…", "ok");
    setTimeout(() => window.location.replace("/account"), 1200);
  });
}
