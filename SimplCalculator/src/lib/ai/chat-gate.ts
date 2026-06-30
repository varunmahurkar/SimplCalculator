// Server-side chat gating. The anonymous limit is enforced with a signed,
// httpOnly cookie that carries today's message/token counts — clearing
// localStorage or using incognito cannot bypass it. A valid Supabase JWT
// lifts the limit.
import crypto from "node:crypto";

export const ANON_MSG_CAP = 4;
export const ANON_TOKEN_CAP = 1000;
export const SIGNED_IN_MSG_CAP = 20;
export const COOKIE_NAME = "sc_chat";

function secret(): string {
  return (
    process.env.CHAT_COOKIE_SECRET ||
    process.env.OPENROUTER_API_KEY || // any stable server secret as a fallback
    "simpl-calculator-dev-secret"
  );
}

interface Counter {
  d: string; // YYYY-MM-DD
  m: number; // messages today
  t: number; // tokens today
}

function sign(payload: string): string {
  return crypto.createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function readCounter(cookieHeader: string | null, today: string): Counter {
  const fresh: Counter = { d: today, m: 0, t: 0 };
  if (!cookieHeader) return fresh;
  const match = cookieHeader.split(/;\s*/).find((c) => c.startsWith(`${COOKIE_NAME}=`));
  if (!match) return fresh;
  try {
    const raw = decodeURIComponent(match.slice(COOKIE_NAME.length + 1));
    const [b64, sig] = raw.split(".");
    if (!b64 || !sig || sign(b64) !== sig) return fresh;
    const parsed = JSON.parse(Buffer.from(b64, "base64url").toString("utf-8")) as Counter;
    return parsed.d === today ? parsed : fresh; // reset daily
  } catch {
    return fresh;
  }
}

export function serializeCounter(c: Counter): string {
  const b64 = Buffer.from(JSON.stringify(c), "utf-8").toString("base64url");
  const value = `${b64}.${sign(b64)}`;
  // 2-day max-age covers the daily reset window.
  return `${COOKIE_NAME}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=172800`;
}

/** Verify a Supabase HS256 access token using SUPABASE_JWT_SECRET. */
export function isSignedIn(authHeader: string | null): boolean {
  const jwtSecret = process.env.SUPABASE_JWT_SECRET;
  if (!jwtSecret || !authHeader?.startsWith("Bearer ")) return false;
  const token = authHeader.slice(7);
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  try {
    const [h, p, s] = parts;
    const expected = crypto.createHmac("sha256", jwtSecret).update(`${h}.${p}`).digest("base64url");
    if (expected !== s) return false;
    const payload = JSON.parse(Buffer.from(p, "base64url").toString("utf-8"));
    if (payload.exp && Date.now() / 1000 > payload.exp) return false;
    return true;
  } catch {
    return false;
  }
}

export function todayUTC(): string {
  // Pure-ish: derived from Date but only the calendar day matters.
  return new Date().toISOString().slice(0, 10);
}
