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
      sub: env.VAPID_SUBJECT || "mailto:admin@rajveer.space",
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

async function sendPush(env: Env, endpoint: string): Promise<number> {
  const aud = new URL(endpoint).origin;
  const jwt = await vapidJwt(env, aud);
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `vapid t=${jwt}, k=${env.VAPID_PUBLIC_KEY}`,
      TTL: "86400",
    },
  });
  return res.status;
}

/** Push a data-less "new mail" wake to one owner's subscriptions; prune dead ones. */
export async function notifyNewMail(env: Env, owner: string): Promise<void> {
  if (!env.VAPID_PRIVATE_JWK || !env.VAPID_PUBLIC_KEY) return;
  const subs =
    (await env.DB.prepare(`SELECT endpoint FROM push_subscriptions WHERE owner = ?`)
      .bind(owner)
      .all<{ endpoint: string }>()).results ?? [];
  for (const s of subs) {
    try {
      const status = await sendPush(env, s.endpoint);
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
