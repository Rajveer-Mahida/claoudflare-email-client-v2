// Inbound email ingestion — ported from the legacy project's src/email-handler.ts.
// Cloudflare Email Routing delivers ForwardableEmailMessage here; we parse, store
// the raw .eml + attachments in R2, insert the message row in D1, and forward.

import PostalMime from "postal-mime";
import type { Env } from "./env";
import { registerAlias, isAliasDisabled, applyRules } from "./db";

const DEFAULT_PATTERN = "^[a-z0-9._%+-]+\\.smi@(rajveer\\.space|100xdev\\.qzz\\.io)$";

export async function handleEmail(
  message: ForwardableEmailMessage,
  env: Env,
  _ctx: ExecutionContext,
): Promise<void> {
  const recipient = message.to.toLowerCase();
  const pattern = new RegExp(env.ALIAS_PATTERN ?? DEFAULT_PATTERN, "i");

  if (!pattern.test(recipient)) {
    if (env.FALLBACK_FORWARD_TO) {
      console.log("Forwarding non-alias email to fallback:", recipient, "->", env.FALLBACK_FORWARD_TO);
      await message.forward(env.FALLBACK_FORWARD_TO);
    } else {
      console.log("Rejected:", recipient);
      message.setReject("Address not allowed");
    }
    return;
  }

  // Managed aliases: bounce mail to a disabled alias; auto-track new ones.
  if (await isAliasDisabled(env.DB, recipient)) {
    console.log("Rejected (disabled alias):", recipient);
    message.setReject("Address not active");
    return;
  }
  await registerAlias(env.DB, recipient);

  const raw = await new Response(message.raw).arrayBuffer();
  const parsed = await new PostalMime().parse(raw);

  const id = crypto.randomUUID();
  const ts = Date.now();
  const rawKey = `emails/${ts}-${id}.eml`;

  await env.EMAIL_CACHE.put(rawKey, raw, {
    httpMetadata: { contentType: "message/rfc822" },
  });

  const text = parsed.text ?? "";
  const snippet = text.replace(/\s+/g, " ").trim().slice(0, 200);
  const threadId = parsed.inReplyTo || parsed.messageId || id;
  const fromAddr = parsed.from?.address ?? message.from;
  const fromName = parsed.from?.name ?? null;

  await env.DB.prepare(
    `INSERT INTO messages
       (id, message_id, in_reply_to, thread_id, direction,
        from_addr, from_name, to_addr, subject, snippet,
        html, text, raw_key, size_bytes, received_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  )
    .bind(
      id,
      parsed.messageId ?? null,
      parsed.inReplyTo ?? null,
      threadId,
      "in",
      fromAddr,
      fromName,
      recipient,
      parsed.subject ?? "",
      snippet,
      parsed.html ?? null,
      text,
      rawKey,
      raw.byteLength,
      ts,
    )
    .run();

  // Apply user filters (label / archive / mark-read / trash).
  await applyRules(env.DB, {
    id,
    from_addr: fromAddr,
    to_addr: recipient,
    subject: parsed.subject ?? "",
  });

  for (const att of parsed.attachments ?? []) {
    const aid = crypto.randomUUID();
    const safeName = (att.filename ?? "file").replace(/[^A-Za-z0-9._-]+/g, "_");
    const r2Key = `attachments/${aid}-${safeName}`;

    let bytes: ArrayBuffer;
    if (typeof att.content === "string") {
      bytes = new TextEncoder().encode(att.content).buffer as ArrayBuffer;
    } else if (att.content instanceof ArrayBuffer) {
      bytes = att.content;
    } else {
      const view = att.content as ArrayBufferView;
      bytes = view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength) as ArrayBuffer;
    }

    await env.EMAIL_CACHE.put(r2Key, bytes, {
      httpMetadata: { contentType: att.mimeType ?? "application/octet-stream" },
    });

    const cid = att.contentId ? att.contentId.replace(/^<|>$/g, "") : null;

    await env.DB.prepare(
      `INSERT INTO attachments (id, message_id, filename, mime_type, r2_key, size_bytes, content_id)
       VALUES (?,?,?,?,?,?,?)`,
    )
      .bind(aid, id, att.filename ?? null, att.mimeType ?? null, r2Key, bytes.byteLength, cid)
      .run();
  }

  console.log("Stored:", { id, from: fromAddr, to: recipient, subject: parsed.subject });

  if (env.FORWARD_TO) {
    await message.forward(env.FORWARD_TO);
    console.log("Forwarded to:", env.FORWARD_TO);
  }
}
