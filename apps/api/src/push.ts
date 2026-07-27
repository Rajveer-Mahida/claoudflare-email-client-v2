// Minimal Web Push (VAPID, no payload) implemented with Web Crypto — no npm deps.
// A data-less push wakes the service worker, which shows a generic "new mail"
// notification. Avoids the heavy aes128gcm payload encryption entirely.

import type { Env } from "./env";

function b64url(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlStr(str: string): string {
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): Uint8Array {
  const pad = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(pad + "=".repeat((4 - (pad.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** The VAPID public key (the `k=` applicationServerKey), derived from the
 *  private JWK so it never has to be configured — and can never drift out of
 *  sync with the private half. A P-256 public key is the uncompressed EC point
 *  0x04 ‖ x ‖ y, which is exactly what the JWK's x/y coordinates give us. */
export function vapidPublicKey(env: Env): string | null {
  if (!env.VAPID_PRIVATE_JWK) return null;
  try {
    const jwk = JSON.parse(env.VAPID_PRIVATE_JWK) as { x?: string; y?: string };
    if (!jwk.x || !jwk.y) return null;
    const x = b64urlDecode(jwk.x);
    const y = b64urlDecode(jwk.y);
    if (x.length !== 32 || y.length !== 32) return null;
    const point = new Uint8Array(65);
    point[0] = 0x04;
    point.set(x, 1);
    point.set(y, 33);
    return b64url(point);
  } catch {
    return null;
  }
}

async function vapidJwt(env: Env, aud: string): Promise<string> {
  const jwk = JSON.parse(env.VAPID_PRIVATE_JWK!);
  const key = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const header = b64urlStr(JSON.stringify({ typ: "JWT", alg: "ES256" }));
  const payload = b64urlStr(
    JSON.stringify({
      aud,
      exp: Math.floor(Date.now() / 1000) + 12 * 3600,
      sub: env.VAPID_SUBJECT!,
    }),
  );
  const data = `${header}.${payload}`;
  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    new TextEncoder().encode(data),
  );
  return `${data}.${b64url(sig)}`; // Web Crypto returns raw r||s — exactly ES256
}

async function sendPush(env: Env, endpoint: string, publicKey: string): Promise<number> {
  const aud = new URL(endpoint).origin;
  const jwt = await vapidJwt(env, aud);
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `vapid t=${jwt}, k=${publicKey}`,
      TTL: "86400",
    },
  });
  return res.status;
}

/** Push a data-less "new mail" wake to every subscription; prune dead ones. */
export async function notifyNewMail(env: Env): Promise<void> {
  // Push needs a key pair and a contact address; without either, stay quiet
  // rather than signing with a placeholder subject.
  const publicKey = vapidPublicKey(env);
  if (!publicKey || !env.VAPID_SUBJECT?.trim()) return;
  const subs =
    (await env.DB.prepare(`SELECT endpoint FROM push_subscriptions`).all<{ endpoint: string }>())
      .results ?? [];
  for (const s of subs) {
    try {
      const status = await sendPush(env, s.endpoint, publicKey);
      if (status === 404 || status === 410) {
        await env.DB.prepare(`DELETE FROM push_subscriptions WHERE endpoint = ?`)
          .bind(s.endpoint)
          .run();
      }
    } catch (e) {
      console.error("push send failed", e);
    }
  }
}
