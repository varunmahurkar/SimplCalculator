// Account view island: loads the signed-in user's favorites, saved results, and
// saved AI reports, and lets them delete rows. All reads/writes are RLS-scoped
// server-side; this island just renders what Supabase returns for the user.
import {
  listFavorites,
  listHistory,
  listReports,
  deleteRow,
  currentUserId,
} from "../lib/data/user-data";
import { AUTH_CHANGED_EVENT } from "./auth";
import { searchIndex } from "../lib/calculators/registry";
import {
  getMyProfile,
  updateMyProfile,
  uploadAvatar,
  deleteMyAccount,
  validateUsername,
  isUsernameAvailable,
} from "../lib/data/profile";

const DEFAULT_AVATAR =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23999'%3E%3Cpath d='M12 12a5 5 0 100-10 5 5 0 000 10zm0 2c-5 0-9 2.5-9 5.5V22h18v-2.5c0-3-4-5.5-9-5.5z'/%3E%3C/svg%3E";

function hrefFor(slug: string): string {
  const cat = searchIndex.find((s) => s.slug === slug)?.category ?? "finance";
  return `/calculators/${cat}/${slug}`;
}
function titleFor(slug: string): string {
  return searchIndex.find((s) => s.slug === slug)?.title ?? slug;
}
function fmtDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString();
}

function row(label: string, href: string | null, onDelete: () => void): HTMLLIElement {
  const li = document.createElement("li");
  li.className =
    "flex items-center justify-between gap-3 rounded-md border border-hairline bg-canvas px-3 py-2 text-body-sm";
  const left = href ? document.createElement("a") : document.createElement("span");
  if (href) (left as HTMLAnchorElement).href = href;
  left.className = "min-w-0 truncate text-ink hover:text-link";
  left.textContent = label;
  const del = document.createElement("button");
  del.type = "button";
  del.textContent = "Delete";
  del.className = "shrink-0 text-caption text-mute hover:text-error";
  del.addEventListener("click", onDelete);
  li.append(left, del);
  return li;
}

export async function initAccount(): Promise<void> {
  const root = document.querySelector<HTMLElement>("[data-account-root]");
  if (!root) return;

  const signedOut = root.querySelector<HTMLElement>("[data-account-signedout]")!;
  const content = root.querySelector<HTMLElement>("[data-account-content]")!;
  const favList = root.querySelector<HTMLUListElement>("[data-fav-list]")!;
  const histList = root.querySelector<HTMLUListElement>("[data-history-list]")!;
  const reportList = root.querySelector<HTMLUListElement>("[data-report-list]")!;
  const favEmpty = root.querySelector<HTMLElement>("[data-fav-empty]")!;
  const histEmpty = root.querySelector<HTMLElement>("[data-history-empty]")!;
  const reportEmpty = root.querySelector<HTMLElement>("[data-report-empty]")!;

  // Profile elements
  const profileForm = root.querySelector<HTMLFormElement>("[data-profile-form]")!;
  const unameInput = profileForm.elements.namedItem("username") as HTMLInputElement;
  const displayInput = profileForm.elements.namedItem("display_name") as HTMLInputElement;
  const unameStatus = root.querySelector<HTMLElement>("[data-username-status]")!;
  const profileMsg = root.querySelector<HTMLElement>("[data-profile-msg]")!;
  const avatarImg = root.querySelector<HTMLImageElement>("[data-avatar-img]")!;
  const avatarInput = root.querySelector<HTMLInputElement>("[data-avatar-input]")!;
  const deleteBtn = root.querySelector<HTMLButtonElement>("[data-delete-account]")!;

  let currentUsername: string | null = null;
  let unameOk = true; // true when unchanged or confirmed available

  function setUnameStatus(text: string, kind: "ok" | "error" | "mute") {
    unameStatus.textContent = text;
    unameStatus.className =
      "text-caption " + (kind === "ok" ? "text-cyan-deep" : kind === "error" ? "text-error" : "text-mute");
  }
  function setProfileMsg(text: string, kind: "error" | "ok" = "error") {
    profileMsg.textContent = text;
    profileMsg.className = `text-caption ${kind === "ok" ? "text-cyan-deep" : "text-error"}`;
    profileMsg.hidden = !text;
  }

  async function loadProfile() {
    const p = await getMyProfile();
    currentUsername = p?.username ?? null;
    unameInput.value = p?.username ?? "";
    displayInput.value = p?.display_name ?? "";
    avatarImg.src = p?.avatar_url || DEFAULT_AVATAR;
    unameOk = !!p?.username; // existing username is fine; null means must set one
    if (!p?.username && new URLSearchParams(location.search).get("setup") === "1") {
      setProfileMsg("Welcome! Pick a username to finish setting up your account.", "ok");
      unameInput.focus();
    }
  }

  async function render() {
    const uid = await currentUserId();
    signedOut.hidden = !!uid;
    content.hidden = !uid;
    if (!uid) return;
    await loadProfile();

    const [favs, hist, reports] = await Promise.all([
      listFavorites(),
      listHistory(),
      listReports(),
    ]);

    favList.replaceChildren();
    favEmpty.hidden = favs.length > 0;
    for (const f of favs) {
      favList.append(
        row(titleFor(f.slug), hrefFor(f.slug), async () => {
          await deleteRow("favorites", f.id);
          void render();
        }),
      );
    }

    histList.replaceChildren();
    histEmpty.hidden = hist.length > 0;
    for (const h of hist) {
      const label = `${titleFor(h.slug)} · ${fmtDate(h.created_at)}`;
      histList.append(
        row(label, hrefFor(h.slug), async () => {
          await deleteRow("calc_history", h.id);
          void render();
        }),
      );
    }

    reportList.replaceChildren();
    reportEmpty.hidden = reports.length > 0;
    for (const r of reports) {
      const label = `${r.title} · ${fmtDate(r.created_at)}`;
      reportList.append(
        row(label, hrefFor(r.slug), async () => {
          await deleteRow("ai_reports", r.id);
          void render();
        }),
      );
    }
  }

  // ── username live availability (only when changed) ────────────────────────
  let unameTimer: ReturnType<typeof setTimeout> | undefined;
  let unameSeq = 0;
  unameInput.addEventListener("input", () => {
    const value = unameInput.value.trim();
    if (value.toLowerCase() === (currentUsername ?? "").toLowerCase()) {
      unameOk = true;
      setUnameStatus("This is your current username.", "mute");
      return;
    }
    unameOk = false;
    const local = validateUsername(value);
    if (!local.ok) {
      setUnameStatus(local.reason ?? "Invalid username", value ? "error" : "mute");
      return;
    }
    setUnameStatus("Checking availability…", "mute");
    clearTimeout(unameTimer);
    const seq = ++unameSeq;
    unameTimer = setTimeout(async () => {
      const available = await isUsernameAvailable(value);
      if (seq !== unameSeq) return;
      unameOk = available;
      setUnameStatus(available ? `“${value}” is available` : `“${value}” is taken`, available ? "ok" : "error");
    }, 400);
  });

  // ── save profile ──────────────────────────────────────────────────────────
  profileForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    setProfileMsg("");
    const username = unameInput.value.trim();
    const local = validateUsername(username);
    if (!local.ok) { setProfileMsg(local.reason ?? "Invalid username"); return; }
    const changed = username.toLowerCase() !== (currentUsername ?? "").toLowerCase();
    if (changed && !unameOk && !(await isUsernameAvailable(username))) {
      setProfileMsg("That username is taken — please pick another.");
      return;
    }
    const res = await updateMyProfile({ username, display_name: displayInput.value.trim() || null });
    if (!res.ok) {
      setProfileMsg(res.error === "username-taken" ? "That username was just taken — pick another." : "Couldn't save — please try again.");
      return;
    }
    currentUsername = username;
    setProfileMsg("Profile saved.", "ok");
  });

  // ── avatar upload ─────────────────────────────────────────────────────────
  avatarInput.addEventListener("change", async () => {
    const file = avatarInput.files?.[0];
    if (!file) return;
    setProfileMsg("Uploading avatar…", "ok");
    const url = await uploadAvatar(file);
    if (!url) { setProfileMsg("Avatar upload failed (is the storage bucket set up?)."); return; }
    await updateMyProfile({ avatar_url: url });
    avatarImg.src = url;
    setProfileMsg("Avatar updated.", "ok");
  });

  // ── delete account ────────────────────────────────────────────────────────
  deleteBtn.addEventListener("click", async () => {
    const sure = window.confirm(
      "Permanently delete your account and ALL saved data? This cannot be undone.",
    );
    if (!sure) return;
    deleteBtn.disabled = true;
    const ok = await deleteMyAccount();
    if (!ok) { deleteBtn.disabled = false; setProfileMsg("Couldn't delete the account — please try again."); return; }
    window.location.replace("/");
  });

  window.addEventListener(AUTH_CHANGED_EVENT, () => {
    void render();
  });
  void render();
}
