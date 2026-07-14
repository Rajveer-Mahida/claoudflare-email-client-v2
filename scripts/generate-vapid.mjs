// Generate a VAPID key pair for web push.
//   node scripts/generate-vapid.mjs
// Put VAPID_PUBLIC_KEY in wrangler vars and VAPID_PRIVATE_JWK in secrets
// (`wrangler secret put VAPID_PRIVATE_JWK`).

const pair = await crypto.subtle.generateKey(
  { name: "ECDSA", namedCurve: "P-256" },
  true,
  ["sign", "verify"],
);

const privateJwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
const publicRaw = await crypto.subtle.exportKey("raw", pair.publicKey);

const b64url = (buf) =>
  Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

console.log("VAPID_PUBLIC_KEY=" + b64url(publicRaw));
console.log("VAPID_PRIVATE_JWK=" + JSON.stringify(JSON.stringify(privateJwk)));
