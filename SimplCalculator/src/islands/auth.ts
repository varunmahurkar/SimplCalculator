// Auth island — email/password + OAuth + magic-link + forgot-password, with a
// username field (live availability) on sign-up and a show/hide password toggle.
import {
  getSupabase,
  authEnabled,
  signInWithOAuth,
  sendPasswordReset,
  type OAuthProvider,
} from "../lib/supabase";
import { validateUsername, isUsernameAvailable, getMyProfile } from "../lib/data/profile";

export const OPEN_AUTH_EVENT = "simpl:open-auth";
export const AUTH_CHANGED_EVENT = "simpl:auth-changed";

const DEFAULT_AVATAR =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23999'%3E%3Cpath d='M12 12a5 5 0 100-10 5 5 0 000 10zm0 2c-5 0-9 2.5-9 5.5V22h18v-2.5c0-3-4-5.5-9-5.5z'/%3E%3C/svg%3E";

export function initAuth(): void {
  if (!authEnabled()) return;
  const sb = getSupabase();
  if (!sb) return;

  const root = document.querySelector<HTMLElement>("[data-auth-root]");
  if (!root) return;
  const dialog = root.querySelector<HTMLElement>("[data-auth-dialog]")!;
  const form = root.querySelector<HTMLFormElement>("[data-auth-form]")!;
  const title = root.querySelector<HTMLElement>("[data-auth-title]")!;
  const submit = root.querySelector<HTMLButtonElement>("[data-auth-submit]")!;
  const switchBtn = root.querySelector<HTMLButtonElement>("[data-auth-switch]")!;
  const switchLabel = root.querySelector<HTMLElement>("[data-auth-switch-label]")!;
  const msg = root.querySelector<HTMLElement>("[data-auth-msg]")!;
  const email = form.elements.namedItem("email") as HTMLInputElement;
  const password = form.elements.namedItem("password") as HTMLInputElement;
  // Optional/newer elements — nullable so a missing one (e.g. cached older HTML)
  // never throws and kills the critical sign-in trigger below.
  const username = form.elements.namedItem("username") as HTMLInputElement | null;
  const usernameRow = root.querySelector<HTMLElement>("[data-auth-username-row]");
  const usernameStatus = root.querySelector<HTMLElement>("[data-username-status]");
  const pwToggle = root.querySelector<HTMLButtonElement>("[data-pw-toggle]");
  const pwIconShow = root.querySelector<HTMLElement>("[data-pw-icon-show]");
  const pwIconHide = root.querySelector<HTMLElement>("[data-pw-icon-hide]");
  const forgotBtn = root.querySelector<HTMLButtonElement>("[data-auth-forgot]");

  let mode: "signin" | "signup" = "signin";
  let lastFocused: HTMLElement | null = null;
  let usernameOk = false;

  const open = () => {
    lastFocused = document.activeElement as HTMLElement | null;
    root.removeAttribute("hidden");
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => email.focus());
  };
  const close = () => {
    root.setAttribute("hidden", "");
    document.body.style.overflow = "";
    lastFocused?.focus?.();
  };

  function setMode(next: "signin" | "signup") {
    mode = next;
    const signup = next === "signup";
    title.textContent = signup ? "Create account" : "Sign in";
    submit.textContent = signup ? "Create account" : "Sign in";
    switchLabel.textContent = signup ? "Already have an account?" : "New here?";
    switchBtn.textContent = signup ? "Sign in" : "Create an account";
    password.autocomplete = signup ? "new-password" : "current-password";
    if (usernameRow) usernameRow.hidden = !signup;
    if (username) username.required = signup;
    if (forgotBtn) forgotBtn.hidden = signup;
    showMsg("");
  }

  function showMsg(text: string, kind: "error" | "ok" = "error") {
    if (!text) { msg.setAttribute("hidden", ""); return; }
    msg.textContent = text;
    msg.className = `text-caption ${kind === "ok" ? "text-cyan-deep" : "text-error"}`;
    msg.removeAttribute("hidden");
  }

  function setUsernameStatus(text: string, kind: "ok" | "error" | "mute") {
    if (!usernameStatus) return;
    usernameStatus.textContent = text;
    usernameStatus.className =
      "text-caption " + (kind === "ok" ? "text-cyan-deep" : kind === "error" ? "text-error" : "text-mute");
  }

  // ── live username availability (debounced) ────────────────────────────────
  let unameTimer: ReturnType<typeof setTimeout> | undefined;
  let unameSeq = 0;
  username?.addEventListener("input", () => {
    usernameOk = false;
    const value = username!.value.trim();
    const local = validateUsername(value);
    if (!local.ok) {
      setUsernameStatus(local.reason ?? "Invalid username", value ? "error" : "mute");
      return;
    }
    setUsernameStatus("Checking availability…", "mute");
    clearTimeout(unameTimer);
    const seq = ++unameSeq;
    unameTimer = setTimeout(async () => {
      const available = await isUsernameAvailable(value);
      if (seq !== unameSeq) return; // a newer keystroke superseded this check
      if (available) {
        usernameOk = true;
        setUsernameStatus(`“${value}” is available`, "ok");
      } else {
        setUsernameStatus(`“${value}” is taken`, "error");
      }
    }, 400);
  });

  // ── show / hide password ──────────────────────────────────────────────────
  pwToggle?.addEventListener("click", () => {
    const show = password.type === "password";
    password.type = show ? "text" : "password";
    pwToggle.setAttribute("aria-pressed", show ? "true" : "false");
    pwToggle.setAttribute("aria-label", show ? "Hide password" : "Show password");
    if (pwIconShow) pwIconShow.hidden = show;
    if (pwIconHide) pwIconHide.hidden = !show;
  });

  // Nav signed-in/out controls
  const signedOutBtn = document.querySelector<HTMLElement>("[data-auth-signedout]");
  const authMenu = document.querySelector<HTMLElement>("[data-auth-menu]");
  const authChip = document.querySelector<HTMLButtonElement>("[data-auth-chip]");
  const authName = document.querySelector<HTMLElement>("[data-auth-name]");
  const authAvatar = document.querySelector<HTMLImageElement>("[data-auth-avatar]");
  const authMenuEmail = document.querySelector<HTMLElement>("[data-auth-menu-email]");
  const authMenuPanel = document.querySelector<HTMLElement>("[data-auth-menu-panel]");

  function closeMenu() {
    authMenuPanel?.setAttribute("hidden", "");
    authChip?.setAttribute("aria-expanded", "false");
  }

  // ── flash-free nav state ──────────────────────────────────────────────────
  // getSession() is async, so without this the nav shows "Sign in" for a moment
  // on every page load — which reads as "logged out" while navigating. We cache
  // a tiny hint of the signed-in display and paint it SYNCHRONOUSLY on init, then
  // refreshState() confirms/corrects it against the real session.
  const NAV_CACHE = "sc_nav_user";
  interface NavHint { name: string; avatar: string; email: string }

  function paintSignedIn(hint: { name: string; avatar?: string; email?: string }) {
    if (signedOutBtn) signedOutBtn.hidden = true;
    if (authMenu) authMenu.hidden = false;
    if (authName) authName.textContent = hint.name;
    if (authAvatar) authAvatar.src = hint.avatar || DEFAULT_AVATAR;
    if (authMenuEmail && hint.email) authMenuEmail.textContent = hint.email;
    document.querySelectorAll<HTMLElement>("[data-auth-state]").forEach((el) => (el.dataset.signedIn = "1"));
    document.querySelectorAll<HTMLElement>("[data-account-link]").forEach((el) => (el.hidden = false));
  }
  function paintSignedOut() {
    if (signedOutBtn) signedOutBtn.hidden = false;
    if (authMenu) authMenu.hidden = true;
    closeMenu();
    document.querySelectorAll<HTMLElement>("[data-auth-state]").forEach((el) => (el.dataset.signedIn = "0"));
    document.querySelectorAll<HTMLElement>("[data-account-link]").forEach((el) => (el.hidden = true));
  }

  function paintFromCache() {
    try {
      const raw = localStorage.getItem(NAV_CACHE);
      if (raw) paintSignedIn(JSON.parse(raw) as NavHint);
    } catch {
      /* ignore corrupt cache */
    }
  }

  async function refreshState() {
    const { data } = await sb!.auth.getSession();
    const user = data.session?.user ?? null;

    if (!user) {
      try { localStorage.removeItem(NAV_CACHE); } catch {}
      paintSignedOut();
      window.dispatchEvent(new CustomEvent(AUTH_CHANGED_EVENT, { detail: { signedIn: false } }));
      return;
    }

    // Signed in — prefer username, fall back to display name, then email local-part.
    const emailVal = user.email ?? "";
    const profile = await getMyProfile();
    const name = profile?.username || profile?.display_name || emailVal.split("@")[0] || "Account";
    const avatar = profile?.avatar_url || DEFAULT_AVATAR;
    paintSignedIn({ name, avatar, email: emailVal });
    if (authChip) authChip.setAttribute("aria-label", `Account menu for ${name}`);
    try {
      localStorage.setItem(NAV_CACHE, JSON.stringify({ name, avatar, email: emailVal } satisfies NavHint));
    } catch {}

    window.dispatchEvent(new CustomEvent(AUTH_CHANGED_EVENT, { detail: { signedIn: true } }));
  }

  // Dropdown: chip toggles the menu (does NOT sign out anymore).
  authChip?.addEventListener("click", (e) => {
    e.stopPropagation();
    const isOpen = !authMenuPanel?.hasAttribute("hidden");
    if (isOpen) {
      closeMenu();
    } else {
      authMenuPanel?.removeAttribute("hidden");
      authChip.setAttribute("aria-expanded", "true");
    }
  });
  document.addEventListener("click", (e) => {
    if (authMenu && !authMenu.contains(e.target as Node)) closeMenu();
  });
  document.querySelector("[data-auth-signout]")?.addEventListener("click", async () => {
    closeMenu();
    await sb.auth.signOut();
    await refreshState();
  });

  switchBtn.addEventListener("click", () => setMode(mode === "signin" ? "signup" : "signin"));

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    submit.disabled = true;
    showMsg("");
    try {
      if (mode === "signup") {
        const uname = username?.value.trim() ?? "";
        const local = validateUsername(uname);
        if (!local.ok) { showMsg(local.reason ?? "Invalid username"); return; }
        if (!usernameOk && !(await isUsernameAvailable(uname))) {
          showMsg("That username is taken — please pick another.");
          return;
        }
        const { error } = await sb.auth.signUp({
          email: email.value,
          password: password.value,
          options: { data: { username: uname } },
        });
        if (error) throw error;
        showMsg("Account created. Check your email if confirmation is required.", "ok");
      } else {
        const { error } = await sb.auth.signInWithPassword({ email: email.value, password: password.value });
        if (error) throw error;
      }
      await refreshState();
      const { data } = await sb.auth.getSession();
      if (data.session) close();
    } catch (err: any) {
      showMsg(err?.message ?? "Something went wrong. Please try again.");
    } finally {
      submit.disabled = false;
    }
  });

  // ── OAuth ─────────────────────────────────────────────────────────────────
  root.querySelectorAll<HTMLButtonElement>("[data-oauth]").forEach((btn) =>
    btn.addEventListener("click", async () => {
      const provider = btn.dataset.oauth as OAuthProvider;
      showMsg("");
      const { error } = await signInWithOAuth(provider);
      if (error) showMsg(`Couldn't start ${provider} sign-in: ${error}`);
      // On success the browser redirects to the provider, then /auth/callback.
    }),
  );

  // ── forgot password ─────────────────────────────────────────────────────--
  forgotBtn?.addEventListener("click", async () => {
    showMsg("");
    if (!email.value) { showMsg("Enter your email above, then tap “Forgot password?”."); return; }
    const { error } = await sendPasswordReset(email.value);
    showMsg(error ? `Couldn't send reset: ${error}` : "Password-reset email sent — check your inbox.", error ? "error" : "ok");
  });

  // Triggers — the sign-in button opens the modal (signed-in state uses the chip menu).
  document.querySelectorAll("[data-auth-open]").forEach((b) =>
    b.addEventListener("click", () => {
      setMode("signin");
      open();
    }),
  );
  window.addEventListener(OPEN_AUTH_EVENT, () => { setMode("signup"); open(); });
  root.querySelectorAll("[data-auth-close]").forEach((b) => b.addEventListener("click", close));
  dialog.addEventListener("click", (e) => e.stopPropagation());
  root.addEventListener("click", close);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !root.hasAttribute("hidden")) close(); });

  // Paint the cached signed-in state immediately (no "Sign in" flash on
  // navigation), then confirm against the real session.
  paintFromCache();
  sb.auth.onAuthStateChange(() => refreshState());
  refreshState();
}
