import { Hono } from "hono";
import type { HonoEnv } from "../env";
import { insertOutbound } from "../db";
import { getReplyEnabled } from "../settings";

export const reply = new Hono<HonoEnv>();

reply.post("/", async (c) => {
  if (!(await getReplyEnabled(c.env.DB))) {
    return c.json({ error: "Replies disabled in settings" }, 403);
  }

  const body = await c.req
    .json<{
      messageId?: string;
      to?: string;
      subject?: string;
      html?: string | null;
      text?: string;
      sendAfter?: number;
    }>()
    .catch(() => null);
  if (!body) return c.json({ error: "Invalid JSON" }, 400);

  const { messageId, to, subject, html, text, sendAfter } = body;
  if (!messageId || !to || !subject) {
    return c.json({ error: "Missing fields" }, 400);
  }

  const from = c.env.REPLY_FROM;
  if (!from) return c.json({ error: "REPLY_FROM not configured" }, 500);

  // Undo-send flow: persist as pending; the legacy email worker's cron sends it.
  if (sendAfter) {
    try {
      const id = await insertOutbound(c.env.DB, {
        inReplyToMessageId: String(messageId),
        from,
        to: String(to),
        subject: String(subject),
        html: html ?? null,
        text: String(text ?? ""),
        sendAfter: Number(sendAfter),
      });
      return c.json({ ok: true, id, pending: true });
    } catch (err) {
      return c.json({ error: (err as Error)?.message ?? "failed" }, 500);
    }
  }

  try {
    const resp = await c.env.EMAIL.send({
      to: String(to),
      from,
      subject: String(subject),
      html: html ? String(html) : undefined,
      text: text ? String(text) : undefined,
    });

    const id = await insertOutbound(c.env.DB, {
      inReplyToMessageId: String(messageId),
      from,
      to: String(to),
      subject: String(subject),
      html: html ?? null,
      text: String(text ?? ""),
    });

    return c.json({ ok: true, id, messageId: resp.messageId });
  } catch (err) {
    console.error("reply send failed", err);
    return c.json({ error: (err as Error)?.message ?? "send failed" }, 500);
  }
});
