import type { Env } from "./env";

// Cloudflare Access (Zero Trust) JWT verification.
// Access injects `Cf-Access-Jwt-Assertion` (and a `CF_Authorization` cookie) on
// every request that passed the edge gate. We verify it against the team's
// public JWKS so the worker can't be reached by bypassing the gate (e.g. the
// raw *.workers.dev URL, which carries no token).

type Jwk = { kid: string; kty: string; n: string; e: string };

const keyCache = new Map<string, CryptoKey>();
let cachedTeam = "";

function b64urlToBytes(s: string): Uint8Array {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function decodeSegment(seg: string): Record<string, unknown> {
  return JSON.parse(new TextDecoder().decode(b64urlToBytes(seg)));
}

async function loadKeys(teamDomain: string): Promise<void> {
  const res = await fetch(`https://${teamDomain}/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error("certs fetch failed");
  const data = (await res.json()) as { keys?: Jwk[] };
  keyCache.clear();
  for (const jwk of data.keys ?? []) {
    const key = await crypto.subtle.importKey(
      "jwk",
      { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: "RS256", ext: true },
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
    keyCache.set(jwk.kid, key);
  }
  cachedTeam = teamDomain;
}

export function accessEnabled(env: Env): boolean {
  return !!(env.ACCESS_AUD && env.ACCESS_TEAM_DOMAIN);
}

/** Verify an Access JWT → the verified email, or null if invalid. */
export async function verifyAccessJwt(env: Env, token: string): Promise<string | null> {
  const teamDomain = env.ACCESS_TEAM_DOMAIN;
  const aud = env.ACCESS_AUD;
  if (!teamDomain || !aud || !token) return null;

  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [h, p, s] = parts;

  let header: Record<string, unknown>;
  let payload: Record<string, unknown>;
  try {
    header = decodeSegment(h);
    payload = decodeSegment(p);
  } catch {
    return null;
  }

  const kid = String(header.kid ?? "");
  let key = cachedTeam === teamDomain ? keyCache.get(kid) : undefined;
  if (!key) {
    try {
      await loadKeys(teamDomain);
    } catch {
      return null;
    }
    key = keyCache.get(kid);
  }
  if (!key) return null;

  const ok = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    b64urlToBytes(s),
    new TextEncoder().encode(`${h}.${p}`),
  );
  if (!ok) return null;

  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp === "number" && payload.exp < now) return null;
  const auds = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!auds.includes(aud)) return null;
  if (payload.iss && payload.iss !== `https://${teamDomain}`) return null;

  return typeof payload.email === "string" ? payload.email.toLowerCase() : null;
}

/** Is this Access-verified email allowed? Empty allowlist → any verified email. */
export function emailAllowed(env: Env, email: string | null): boolean {
  if (!email) return false;
  const list = (env.ALLOWED_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return list.length === 0 || list.includes(email);
}
