import { test } from "node:test";
import assert from "node:assert/strict";
import {
  toBase64,
  toResendPayload,
  toBindingOptions,
  isPermanentStatus,
  isPermanentFailure,
  usingResend,
  withDeliverability,
  formatReferences,
} from "../apps/api/src/send.ts";
import {
  messageIdRef,
  messageIdBare,
  expandMessageIdCandidates,
} from "../apps/api/src/headers.ts";

const env = (v: Record<string, string>) => v as never;

// The whole reason toBase64 chunks: the obvious spread form throws
// "Maximum call stack size exceeded" somewhere around 100k+ arguments, and
// Resend accepts attachments up to 40MB.
test("base64 handles buffers far past the call-stack limit", () => {
  for (const size of [0, 1, 2, 3, 1024, 65535, 65536, 1_500_000]) {
    const bytes = new Uint8Array(size);
    for (let i = 0; i < size; i++) bytes[i] = i % 256;
    assert.equal(
      toBase64(bytes.buffer),
      Buffer.from(bytes).toString("base64"),
      `mismatch at ${size} bytes`,
    );
  }
});

test("base64 accepts a Uint8Array as well as an ArrayBuffer", () => {
  const bytes = new Uint8Array([0, 255, 128, 1]);
  assert.equal(toBase64(bytes), Buffer.from(bytes).toString("base64"));
  assert.equal(toBase64(bytes.buffer), Buffer.from(bytes).toString("base64"));
});

test("maps the binding's option names onto Resend's", () => {
  const p = toResendPayload({
    from: "me@example.com",
    to: "them@example.com",
    subject: "Hi",
    replyTo: "reply@example.com",
    html: "<p>hi</p>",
    text: "hi",
  });
  assert.equal(p.reply_to, "reply@example.com");
  assert.ok(!("replyTo" in p), "replyTo must be renamed, not passed through");
  assert.equal(p.from, "me@example.com");
  assert.equal(p.to, "them@example.com");
});

test("a structured from-address becomes a display-name string", () => {
  assert.equal(
    toResendPayload({ from: { email: "a@b.com", name: "A B" }, to: "x@y.com", subject: "s" }).from,
    "A B <a@b.com>",
  );
  assert.equal(
    toResendPayload({ from: { email: "a@b.com" }, to: "x@y.com", subject: "s" }).from,
    "a@b.com",
  );
});

test("array recipients pass through unchanged", () => {
  const p = toResendPayload({
    from: "me@example.com",
    to: ["a@x.com", "b@x.com"],
    cc: ["c@x.com"],
    bcc: ["d@x.com"],
    subject: "s",
  });
  assert.deepEqual(p.to, ["a@x.com", "b@x.com"]);
  assert.deepEqual(p.cc, ["c@x.com"]);
  assert.deepEqual(p.bcc, ["d@x.com"]);
});

test("omits absent optional fields rather than sending nulls", () => {
  const p = toResendPayload({ from: "me@example.com", to: "x@y.com", subject: "s" });
  for (const k of ["cc", "bcc", "reply_to", "html", "text", "headers", "attachments"]) {
    assert.ok(!(k in p), `${k} should be omitted when unset`);
  }
});

// Resend has no `disposition`; inline images are identified by content_id only.
test("attachments are converted to Resend's shape", () => {
  const content = new Uint8Array([1, 2, 3]).buffer;
  const p = toResendPayload({
    from: "me@example.com",
    to: "x@y.com",
    subject: "s",
    attachments: [
      { content, filename: "a.pdf", type: "application/pdf", disposition: "attachment" },
      { content, filename: "logo.png", type: "image/png", disposition: "inline", contentId: "cid1" },
    ],
  });
  const atts = p.attachments as Array<Record<string, unknown>>;
  assert.equal(atts.length, 2);
  assert.equal(atts[0].filename, "a.pdf");
  assert.equal(atts[0].content_type, "application/pdf");
  assert.equal(atts[0].content, Buffer.from([1, 2, 3]).toString("base64"));
  assert.ok(!("type" in atts[0]), "type must be renamed to content_type");
  assert.ok(!("disposition" in atts[0]), "disposition has no Resend equivalent");
  assert.equal(atts[1].content_id, "cid1");
});

test("already-encoded string attachment content is not re-encoded", () => {
  const p = toResendPayload({
    from: "me@example.com",
    to: "x@y.com",
    subject: "s",
    attachments: [{ content: "YWJj", filename: "a.txt" }],
  });
  assert.equal((p.attachments as Array<Record<string, unknown>>)[0].content, "YWJj");
});

// Misclassifying here is what causes either an infinite retry loop or a
// message wrongly parked as failed.
test("classifies which failures are worth retrying", () => {
  // 403 is what Resend returns for an unverified sending domain, and 401 for a
  // bad key — both repeat forever, so they must stop the retry loop.
  for (const s of [400, 401, 403, 404, 422]) {
    assert.equal(isPermanentFailure(s), true, `${s} should be permanent`);
    assert.equal(isPermanentStatus(s), true, `${s} should be permanent`);
  }
  for (const s of [408, 429, 500, 502, 503, 504]) {
    assert.equal(isPermanentFailure(s), false, `${s} should be retryable`);
  }
});

// Resend returns 409 for two different cases — only the payload conflict is permanent.
test("idempotency payload conflict is permanent; concurrent request is retryable", () => {
  assert.equal(isPermanentFailure(409, "invalid_idempotent_request"), true);
  assert.equal(isPermanentFailure(409, "concurrent_idempotent_requests"), false);
  // Without a name, status-alone 409 stays permanent (safe default for conflicts).
  assert.equal(isPermanentFailure(409), true);
});

test("binding options drop transport-only fields", () => {
  const binding = toBindingOptions(
    withDeliverability({
      from: "a@x.com",
      to: "b@y.com",
      subject: "s",
      text: "hi",
      idempotencyKey: "msg-1",
      inReplyTo: "<parent@mail>",
      references: ["<grand@mail>", "<parent@mail>"],
    }),
  );
  assert.ok(!("idempotencyKey" in binding));
  assert.ok(!("inReplyTo" in binding));
  assert.ok(!("references" in binding));
  assert.equal(binding.from, "a@x.com");
  assert.equal(binding.headers?.["In-Reply-To"], "<parent@mail>");
  assert.ok(binding.headers?.References?.includes("<grand@mail>"));
  assert.ok(binding.headers?.References?.includes("<parent@mail>"));
});

// A "Re:" subject with no threading headers doesn't thread in the recipient's
// client and reads as unsolicited — which is how the first replies landed in spam.
test("a reply carries In-Reply-To and References", () => {
  const o = withDeliverability({
    from: "a@x.com",
    to: "b@y.com",
    subject: "Re: Test",
    text: "hi",
    inReplyTo: "<abc@mail.gmail.com>",
  });
  assert.equal(o.headers?.["In-Reply-To"], "<abc@mail.gmail.com>");
  assert.equal(o.headers?.References, "<abc@mail.gmail.com>");
});

test("References includes the full chain when provided", () => {
  const o = withDeliverability({
    from: "a@x.com",
    to: "b@y.com",
    subject: "Re: x",
    text: "hi",
    inReplyTo: "parent@mail",
    references: ["grand@mail", "parent@mail", "parent@mail"],
  });
  assert.equal(o.headers?.["In-Reply-To"], "<parent@mail>");
  assert.equal(o.headers?.References, "<grand@mail> <parent@mail>");
});

test("formatReferences normalizes and dedupes", () => {
  assert.equal(formatReferences(["a@b", "<a@b>", "c@d"]), "<a@b> <c@d>");
});

test("bare Message-IDs get their angle brackets", () => {
  const o = withDeliverability({
    from: "a@x.com",
    to: "b@y.com",
    subject: "Re: x",
    text: "hi",
    inReplyTo: "abc@mail.gmail.com",
  });
  assert.equal(o.headers?.["In-Reply-To"], "<abc@mail.gmail.com>");
});

test("no threading headers when it isn't a reply", () => {
  const o = withDeliverability({ from: "a@x.com", to: "b@y.com", subject: "x", text: "hi" });
  assert.equal(o.headers, undefined);
});

test("caller-supplied headers win over the derived ones", () => {
  const o = withDeliverability({
    from: "a@x.com",
    to: "b@y.com",
    subject: "x",
    text: "hi",
    inReplyTo: "<a@b>",
    headers: { "In-Reply-To": "<explicit@b>" },
  });
  assert.equal(o.headers?.["In-Reply-To"], "<explicit@b>");
});

test("text-only mail gains an HTML alternative", () => {
  const o = withDeliverability({ from: "a@x.com", to: "b@y.com", subject: "x", text: "hi\nthere" });
  assert.ok(o.html?.includes("hi\nthere"));
  assert.ok(o.html?.includes("pre-wrap"), "newlines must survive rendering");
});

test("existing HTML is never overwritten, and empty text adds none", () => {
  assert.equal(
    withDeliverability({ from: "a@x", to: "b@y", subject: "x", text: "hi", html: "<b>mine</b>" })
      .html,
    "<b>mine</b>",
  );
  assert.equal(
    withDeliverability({ from: "a@x", to: "b@y", subject: "x", text: "   " }).html,
    undefined,
  );
});

test("the generated HTML escapes markup rather than injecting it", () => {
  const o = withDeliverability({
    from: "a@x",
    to: "b@y",
    subject: "x",
    text: '<script>alert("x")</script> & co',
  });
  assert.ok(!o.html?.includes("<script>"), "raw tags must not survive");
  assert.ok(o.html?.includes("&lt;script&gt;"));
  assert.ok(o.html?.includes("&amp;"));
});

test("provider selection follows RESEND_API_KEY", () => {
  assert.equal(usingResend(env({})), false);
  assert.equal(usingResend(env({ RESEND_API_KEY: "" })), false);
  assert.equal(usingResend(env({ RESEND_API_KEY: "   " })), false, "whitespace is not a key");
  assert.equal(usingResend(env({ RESEND_API_KEY: "re_abc" })), true);
});

test("message-id helpers normalize brackets", () => {
  assert.equal(messageIdRef("a@b.com"), "<a@b.com>");
  assert.equal(messageIdRef("<a@b.com>"), "<a@b.com>");
  assert.equal(messageIdBare("<a@b.com>"), "a@b.com");
  assert.equal(messageIdBare("a@b.com"), "a@b.com");
});

test("expandMessageIdCandidates includes both forms and caps", () => {
  const expanded = expandMessageIdCandidates(["a@b.com", "<c@d.com>"]);
  assert.deepEqual(expanded, ["<a@b.com>", "a@b.com", "<c@d.com>", "c@d.com"]);
  assert.equal(expandMessageIdCandidates(["a@b", "c@d", "e@f"], 3).length, 3);
});
