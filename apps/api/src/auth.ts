// Ported from legacy lib/auth.ts. Web Crypto HMAC session token.
// Secrets come from the Worker env (c.env) instead of process.env.

const COOKIE = "smi_session";
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

function secretOf(env: { AUTH_SECRET?: string }): string {
  return env.AUTH_SECRET ?? "dev-secret-change-me";
}

export async function createSessionToken(env: { AUTH_SECRET?: string }): Promise<string> {
  const exp = Date.now() + MAX_AGE * 1000;
  const sig = await hmac(secretOf(env), String(exp));
  return `${exp}.${sig}`;
}

export async function verifySessionToken(
  env: { AUTH_SECRET?: string },
  token: string,
): Promise<boolean> {
  const dot = token.indexOf(".");
  if (dot < 0) return false;
  const exp = Number(token.slice(0, dot));
  if (!exp || exp < Date.now()) return false;
  const expected = await hmac(secretOf(env), String(exp));
  return token.slice(dot + 1) === expected;
}

export function checkPassword(env: { AUTH_PASSWORD?: string }, input: string): boolean {
  const pw = env.AUTH_PASSWORD ?? "";
  return pw.length > 0 && input === pw;
}

export const cookieName = () => COOKIE;
export const cookieMaxAge = () => MAX_AGE;
