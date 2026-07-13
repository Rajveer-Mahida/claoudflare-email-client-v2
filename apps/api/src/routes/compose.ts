import { Hono } from "hono";
import type { HonoEnv, Env, EmailAttachmentOut } from "../env";
import type { ComposeRequest, UploadedAttachment } from "@email/shared";
import { recordOutbound, getMessage, deleteDraft, getAliasOwner } from "../db";
import { getComposeEnabled } from "../settings";
import { writeOwner } from "../scope";

export const compose = new Hono<HonoEnv>();

/** Build Cloudflare Email attachments by pulling the uploaded blobs back from R2. */
async function loadAttachments(
  env: Env,
  items: UploadedAttachment[],
): Promise<EmailAttachmentOut[]> {
  const out: EmailAttachmentOut[] = [];
  for (const a of items) {
    const obj = await env.EMAIL_CACHE.get(a.key);
    if (!obj) continue;
    out.push({
      content: await obj.arrayBuffer(),
      filename: a.filename,
      type: a.mime_type || "application/octet-stream",
      disposition: "attachment",
    });
  }
  return out;
}

// POST /api/send — new mail, reply-all, or forward (universal sender).
compose.post("/", async (c) => {
  const owner = writeOwner(c);
  if (!(await getComposeEnabled(c.env.DB, owner))) {
    return c.json({ error: "Compose disabled in settings" }, 403);
  }

  const body = await c.req.json<ComposeRequest>().catch(() => null);
  if (!body) return c.json({ error: "Invalid JSON" }, 400);

  const to = (body.to ?? []).map((s) => s.trim()).filter(Boolean);
  const cc = (body.cc ?? []).map((s) => s.trim()).filter(Boolean);
  const bcc = (body.bcc ?? []).map((s) => s.trim()).filter(Boolean);
  if (!to.length) return c.json({ error: "At least one recipient required" }, 400);
  if (!body.subject?.trim()) return c.json({ error: "Subject required" }, 400);

  // Sender: explicit, else the thread's alias (reply/forward). Must be an alias
  // owned by the caller — no shared/system fallback in multi-tenant mode.
  let from = body.from?.trim().toLowerCase() || "";
  if (!from && body.inReplyToMessageId) {
    const parent = await getMessage(c.env.DB, body.inReplyToMessageId, owner);
    if (parent) from = parent.direction === "in" ? parent.to_addr : parent.from_addr;
  }
  if (!from) return c.json({ error: "Sender alias required" }, 400);
  if ((await getAliasOwner(c.env.DB, from)) !== owner) {
    return c.json({ error: "You can only send from your own alias" }, 403);
  }

  const attachments = body.attachments ?? [];
  const ccStr = cc.length ? cc.join(", ") : null;
  const bccStr = bcc.length ? bcc.join(", ") : null;

  // Scheduled send → store pending; the cron sends it later (with attachments/cc).
  if (body.sendAfter) {
    const id = await recordOutbound(c.env.DB, owner, {
      from,
      to: to.join(", "),
      cc: ccStr,
      bcc: bccStr,
      subject: body.subject,
      html: body.html ?? null,
      text: body.text ?? "",
      inReplyToMessageId: body.inReplyToMessageId ?? null,
      sendAfter: Number(body.sendAfter),
      attachments: attachments.map((a) => ({
        key: a.key,
        filename: a.filename,
        mime_type: a.mime_type,
        size_bytes: a.size_bytes,
      })),
    });
    if (body.draftId) await deleteDraft(c.env.DB, body.draftId, owner);
    return c.json({ ok: true, id, pending: true });
  }

  try {
    await c.env.EMAIL.send({
      to,
      cc: cc.length ? cc : undefined,
      bcc: bcc.length ? bcc : undefined,
      from,
      subject: body.subject,
      html: body.html ? String(body.html) : undefined,
      text: body.text || "",
      attachments: attachments.length ? await loadAttachments(c.env, attachments) : undefined,
    });

    const id = await recordOutbound(c.env.DB, owner, {
      from,
      to: to.join(", "),
      cc: ccStr,
      bcc: bccStr,
      subject: body.subject,
      html: body.html ?? null,
      text: body.text ?? "",
      inReplyToMessageId: body.inReplyToMessageId ?? null,
      attachments: attachments.map((a) => ({
        key: a.key,
        filename: a.filename,
        mime_type: a.mime_type,
        size_bytes: a.size_bytes,
      })),
    });
    if (body.draftId) await deleteDraft(c.env.DB, body.draftId, owner);
    return c.json({ ok: true, id });
  } catch (err) {
    console.error("send failed", err);
    return c.json({ error: (err as Error)?.message ?? "send failed" }, 500);
  }
});
