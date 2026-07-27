// Generate a VAPID key pair for web push.
//   node scripts/generate-vapid.mjs
//
// Only the private JWK is a config value — the worker derives the public key
// from it, so there's nothing to keep in sync:
//   wrangler secret put VAPID_PRIVATE_JWK -c instances.jsonc -e <name>
//
// Push also needs a contact address: set the VAPID_SUBJECT var to a mailto: URI.

const pair = await crypto.subtle.generateKey(
  { name: "ECDSA", namedCurve: "P-256" },
  true,
  ["sign", "verify"],
);

const privateJwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
const publicRaw = await crypto.subtle.exportKey("raw", pair.publicKey);

const b64url = (buf) =>
  Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

console.log("VAPID_PRIVATE_JWK=" + JSON.stringify(JSON.stringify(privateJwk)));
console.log();
console.log("# Derived by the worker, shown here only so you can verify it:");
console.log("#   public key " + b64url(publicRaw));
