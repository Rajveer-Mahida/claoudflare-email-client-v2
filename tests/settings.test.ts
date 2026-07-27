import { test } from "node:test";
import assert from "node:assert/strict";
import { isAllowedRecipient, aliasDomains, replyFrom } from "../apps/api/src/settings.ts";

const env = (vars: Record<string, string>) => vars as never;

test("rejects domains that aren't configured", () => {
  const e = env({ ALIAS_DOMAINS: "example.com" });
  assert.equal(isAllowedRecipient(e, "hi@example.com"), true);
  assert.equal(isAllowedRecipient(e, "hi@notmine.com"), false);
  // Substring tricks must not pass the domain check.
  assert.equal(isAllowedRecipient(e, "hi@evil-example.com"), false);
  assert.equal(isAllowedRecipient(e, "hi@example.com.evil.com"), false);
});

test("an empty allowlist accepts every address on those domains", () => {
  const e = env({ ALIAS_DOMAINS: "example.com,example.org", ALLOWED_EMAILS: "" });
  assert.equal(isAllowedRecipient(e, "anything@example.com"), true);
  assert.equal(isAllowedRecipient(e, "any.thing+tag@example.org"), true);
  assert.equal(isAllowedRecipient(e, "anything@elsewhere.com"), false);
});

// This is the shape that reproduces a pre-refactor suffix gate such as
// ALIAS_SUFFIX=smi, so an existing deployment keeps accepting exactly what it did.
test("a wildcard allowlist reproduces the old suffix gate", () => {
  const e = env({
    ALIAS_DOMAINS: "example.com,example.org",
    ALLOWED_EMAILS: "*.smi@example.com,*.smi@example.org",
  });
  assert.equal(isAllowedRecipient(e, "foo.smi@example.com"), true);
  assert.equal(isAllowedRecipient(e, "foo.smi@example.org"), true);
  assert.equal(isAllowedRecipient(e, "foo@example.com"), false);
  assert.equal(isAllowedRecipient(e, "foo.smix@example.com"), false);
  assert.equal(isAllowedRecipient(e, "foo.smi@elsewhere.com"), false);
});

test("allowlist entries are anchored, not substring matches", () => {
  const e = env({ ALIAS_DOMAINS: "example.com", ALLOWED_EMAILS: "me@example.com" });
  assert.equal(isAllowedRecipient(e, "me@example.com"), true);
  assert.equal(isAllowedRecipient(e, "notme@example.com"), false);
  assert.equal(isAllowedRecipient(e, "me@example.com.evil.com"), false);
});

test("dots in the allowlist are literal, not regex wildcards", () => {
  const e = env({ ALIAS_DOMAINS: "example.com", ALLOWED_EMAILS: "a.b@example.com" });
  assert.equal(isAllowedRecipient(e, "a.b@example.com"), true);
  assert.equal(isAllowedRecipient(e, "axb@example.com"), false);
});

test("matching is case-insensitive and tolerates whitespace in config", () => {
  const e = env({ ALIAS_DOMAINS: " Example.COM , other.com ", ALLOWED_EMAILS: " ME@example.com " });
  assert.equal(isAllowedRecipient(e, "me@EXAMPLE.com"), true);
  assert.equal(isAllowedRecipient(e, "  Me@Example.Com  "), true);
});

test("an unconfigured instance accepts nothing", () => {
  assert.equal(isAllowedRecipient(env({}), "anyone@anywhere.com"), false);
  assert.equal(isAllowedRecipient(env({ ALIAS_DOMAINS: "" }), "anyone@anywhere.com"), false);
});

test("malformed addresses are rejected, not crashed on", () => {
  const e = env({ ALIAS_DOMAINS: "example.com" });
  for (const bad of ["", "@", "no-at-sign", "@example.com", "me@"]) {
    assert.equal(isAllowedRecipient(e, bad), false, `should reject ${JSON.stringify(bad)}`);
  }
});

// The domain is taken from the LAST @, which is what makes a quoted local part
// work. The side effect is that `me@@example.com` reads as local `me@` and is
// accepted. That's deliberate: recipients arrive as pre-validated envelope
// addresses from Email Routing, and the domain check — the part that actually
// gates access — is still exact. Full RFC 5321 parsing would buy nothing here.
test("the domain is resolved from the last @", () => {
  const e = env({ ALIAS_DOMAINS: "example.com" });
  assert.equal(isAllowedRecipient(e, '"weird@local"@example.com'), true);
  assert.equal(isAllowedRecipient(e, "me@@example.com"), true);
  // What must never happen: a second @ smuggling in a foreign domain.
  assert.equal(isAllowedRecipient(e, "me@example.com@evil.com"), false);
});

test("aliasDomains splits, trims and drops blanks", () => {
  assert.deepEqual(aliasDomains(env({ ALIAS_DOMAINS: "a.com, b.com ,, c.com" })), [
    "a.com",
    "b.com",
    "c.com",
  ]);
  assert.deepEqual(aliasDomains(env({})), []);
});

test("replyFrom falls back to the first alias domain", () => {
  assert.equal(replyFrom(env({ ALIAS_DOMAINS: "a.com,b.com" })), "reply@a.com");
  assert.equal(replyFrom(env({ ALIAS_DOMAINS: "a.com", REPLY_FROM: "hi@x.com" })), "hi@x.com");
  assert.equal(replyFrom(env({ ALIAS_DOMAINS: "a.com", REPLY_FROM: "  " })), "reply@a.com");
  assert.equal(replyFrom(env({})), "");
});
