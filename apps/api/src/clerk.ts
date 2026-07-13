import type { Env } from "./env";

// Clerk session-JWT verification (RS256) against the instance JWKS.
// The SPA sends the Clerk session token as `Authorization: Bearer <jwt>` (or the
// `__session` cookie). We verify it here so the worker trusts only Clerk-issued
// identities. `email` and `role` are custom session-token claims — configure them
// in the Clerk dashboard (Sessions → customize session token):
//   { "email": "{{user.primary_email_address}}", "role": "{{user.public_metadata.role}}" }

type Jwk = { kid: string; kty: string; n: string; e: string };

export type ClerkClaims = {
  userId: string;
  email: string | null;
  role: string | null;
};

const keyCache = new Map<string, CryptoKey>();
let cachedIssuer = "";

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

/** Clerk issuer, e.g. https://your-slug.clerk.accounts.dev (dev) or https://clerk.example.com (prod). */
function issuerOf(env: Env): string | null {
  return env.CLERK_ISSUER ? env.CLERK_ISSUER.replace(/\/$/, "") : null;
}

export function clerkEnabled(env: Env): boolean {
  return !!env.CLERK_ISSUER;
}

async function loadKeys(issuer: string): Promise<void> {
  const res = await fetch(`${issuer}/.well-known/jwks.json`);
  if (!res.ok) throw new Error("jwks fetch failed");
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
  cachedIssuer = issuer;
}

/** Verify a Clerk session JWT → claims, or null if invalid/expired. */
export async function verifyClerkJwt(env: Env, token: string): Promise<ClerkClaims | null> {
  const issuer = issuerOf(env);
  if (!issuer || !token) return null;

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
  let key = cachedIssuer === issuer ? keyCache.get(kid) : undefined;
  if (!key) {
    try {
      await loadKeys(issuer);
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
  // Small leeway for clock skew.
  if (typeof payload.exp === "number" && payload.exp < now - 5) return null;
  if (typeof payload.nbf === "number" && payload.nbf > now + 5) return null;
  if (payload.iss && payload.iss !== issuer) return null;

  const userId = typeof payload.sub === "string" ? payload.sub : null;
  if (!userId) return null;

  const email =
    typeof payload.email === "string" ? payload.email.toLowerCase() : null;
  const role = typeof payload.role === "string" ? payload.role : null;

  return { userId, email, role };
}
