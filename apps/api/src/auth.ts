// Ported from legacy lib/auth.ts. Web Crypto HMAC session token.
// Secrets come from the Worker env (c.env) instead of process.env.

const COOKIE = "dm_session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

async function hmac(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const buf = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

/** The signing secret, or null when unset. There is deliberately no default:
 *  a fallback constant in a public repo means anyone can forge a session. */
function secretOf(env: { AUTH_SECRET?: string }): string | null {
  const s = env.AUTH_SECRET?.trim();
  return s ? s : null;
}

/** Length-independent constant-time comparison of two strings. */
function timingSafeEqual(a: string, b: string): boolean {
  const ab = new TextEncoder().encode(a);
  const bb = new TextEncoder().encode(b);
  // Compare lengths without an early return, then fold the result in.
  let diff = ab.length ^ bb.length;
  const n = Math.max(ab.length, bb.length);
  for (let i = 0; i < n; i++) {
    diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  }
  return diff === 0;
}

export async function createSessionToken(env: { AUTH_SECRET?: string }): Promise<string> {
  const secret = secretOf(env);
  if (!secret) throw new Error("AUTH_SECRET is not set");
  const exp = Date.now() + MAX_AGE * 1000;
  const sig = await hmac(secret, String(exp));
  return `${exp}.${sig}`;
}

export async function verifySessionToken(
  env: { AUTH_SECRET?: string },
  token: string,
): Promise<boolean> {
  const secret = secretOf(env);
  if (!secret) return false;
  const dot = token.indexOf(".");
  if (dot < 0) return false;
  const exp = Number(token.slice(0, dot));
  if (!exp || exp < Date.now()) return false;
  const expected = await hmac(secret, String(exp));
  return timingSafeEqual(token.slice(dot + 1), expected);
}

export function checkPassword(env: { AUTH_PASSWORD?: string }, input: string): boolean {
  const pw = env.AUTH_PASSWORD ?? "";
  if (!pw.length) return false;
  return timingSafeEqual(input, pw);
}

export const cookieName = () => COOKIE;
export const cookieMaxAge = () => MAX_AGE;
