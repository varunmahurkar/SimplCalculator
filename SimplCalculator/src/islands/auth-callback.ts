// Handles the redirect back from OAuth providers and magic-link emails. The
// supabase client (PKCE + detectSessionInUrl) exchanges the code on load; we
// then route the user: to username setup if they have no username yet, else home.
import { getSupabase } from "../lib/supabase";
import { getMyProfile } from "../lib/data/profile";

export async function initAuthCallback(): Promise<void> {
  const status = document.querySelector<HTMLElement>("[data-cb-status]");
  const sb = getSupabase();
  if (!sb) {
    window.location.replace("/");
    return;
  }

  // Wait for the PKCE code exchange to produce a session.
  let { data } = await sb.auth.getSession();
  if (!data.session) {
    await new Promise<void>((resolve) => {
      const { data: sub } = sb.auth.onAuthStateChange((_event, session) => {
        if (session) {
          sub.subscription.unsubscribe();
          resolve();
        }
      });
      setTimeout(resolve, 4000); // safety timeout
    });
    data = (await sb.auth.getSession()).data;
  }

  if (!data.session) {
    if (status) status.textContent = "That sign-in link is invalid or has expired. Redirecting…";
    setTimeout(() => window.location.replace("/"), 1800);
    return;
  }

  const profile = await getMyProfile();
  window.location.replace(profile?.username ? "/" : "/account?setup=1");
}
