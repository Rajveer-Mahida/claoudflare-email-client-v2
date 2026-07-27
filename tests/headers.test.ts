import { test } from "node:test";
import assert from "node:assert/strict";
import { mailedBy, signedBy, replyToOf, domainOf } from "../apps/api/src/headers.ts";

const h = (o: Record<string, string>) => Object.entries(o).map(([key, value]) => ({ key, value }));

// A realistic Cloudflare Email Routing header, like the Netflix mail in the UI.
const netflix = h({
  "authentication-results":
    "mx.cloudflare.net; dkim=pass header.d=members.netflix.com; spf=pass smtp.mailfrom=bounce.netflix.com; dmarc=pass header.from=members.netflix.com",
  "return-path": "<bounce-abc@bounce.netflix.com>",
  "dkim-signature": "v=1; a=rsa-sha256; d=members.netflix.com; s=s1; bh=xxx",
  "reply-to": "no-reply@members.netflix.com",
});

test("reads verified spf/dkim results", () => {
  assert.equal(mailedBy(netflix), "bounce.netflix.com");
  assert.equal(signedBy(netflix), "members.netflix.com");
  assert.equal(replyToOf(netflix), "no-reply@members.netflix.com");
});

// The security-relevant case: a failed check must never be reported as though
// it had been verified, or a forged sender shows up looking legitimate.
test("ignores failed checks rather than reporting the claimed domain", () => {
  const failed = h({
    "authentication-results":
      "mx.cloudflare.net; dkim=fail header.d=spoofed.com; spf=softfail smtp.mailfrom=spoofed.com",
  });
  assert.equal(signedBy(failed), null);
  // No verified SPF and no Return-Path to fall back on.
  assert.equal(mailedBy(failed), null);
});

test("falls back to Return-Path / DKIM-Signature when unauthenticated", () => {
  const noAuth = h({
    "return-path": "<bounces@mailer.example.com>",
    "dkim-signature": "v=1; a=rsa-sha256; d=example.com; s=sel",
  });
  assert.equal(mailedBy(noAuth), "mailer.example.com");
  assert.equal(signedBy(noAuth), "example.com");
});

test("a pass for one method doesn't leak into the other", () => {
  const mixed = h({
    "authentication-results": "mx; spf=pass smtp.mailfrom=ok.com; dkim=fail header.d=bad.com",
  });
  assert.equal(mailedBy(mixed), "ok.com");
  assert.equal(signedBy(mixed), null);
});

test("handles missing headers without throwing", () => {
  assert.equal(mailedBy([]), null);
  assert.equal(signedBy([]), null);
  assert.equal(replyToOf([]), null);
});

test("header keys are matched case-insensitively", () => {
  const upper = h({ "Authentication-Results": "mx; dkim=pass header.d=Example.COM" });
  assert.equal(signedBy(upper), "example.com");
});

test("domainOf handles the address forms that appear in headers", () => {
  assert.equal(domainOf("a@b.com"), "b.com");
  assert.equal(domainOf("Name <a@b.com>"), "b.com");
  assert.equal(domainOf("<a@b.com>"), "b.com");
  assert.equal(domainOf("A@B.COM"), "b.com");
  assert.equal(domainOf("no-at-sign"), null);
  assert.equal(domainOf(""), null);
  assert.equal(domainOf(null), null);
});
