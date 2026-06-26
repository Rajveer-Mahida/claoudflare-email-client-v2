import { Hono } from "hono";
import type { HonoEnv } from "../env";
import type {
  MessageListItem,
  MessageDetail,
  ViewName,
  FlagField,
} from "@email/shared";
import {
  listMessages,
  getMessage,
  getThread,
  getAttachments,
  labelsForMessages,
  markRead,
  softDelete,
  setFlag,
  setSnooze,
  markAllRead,
  permanentDeleteMessages,
  applyLabels,
  removeLabel,
  cancelPendingMessage,
  claimPendingMessage,
  markMessageSent,
} from "../db";
import { getReplyEnabled } from "../settings";

const FLAG_FIELDS: FlagField[] = ["is_starred", "is_archived", "is_deleted", "is_read"];

export const messages = new Hono<HonoEnv>();

// GET /api/messages?view=&q=&label=&limit=&offset=
messages.get("/", async (c) => {
  const db = c.env.DB;
  const view = (c.req.query("view") as ViewName) || "inbox";
  const q = c.req.query("q") ?? undefined;
  const labelId = c.req.query("label") ?? undefined;
  const limit = Number(c.req.query("limit") ?? "50");
  const offset = Number(c.req.query("offset") ?? "0");

  const rows = await listMessages(db, { view, q, labelId, limit, offset });
  const labelMap = await labelsForMessages(db, rows.map((m) => m.id));

  const items: MessageListItem[] = rows.map(({ html: _h, text: _t, ...rest }) => ({
    ...rest,
    labels: labelMap.get(rest.id) ?? [],
  }));
  return c.json(items);
});

// GET /api/messages/:id  → message + thread + attachments + labels
messages.get("/:id", async (c) => {
  const db = c.env.DB;
  const id = c.req.param("id");
  const message = await getMessage(db, id);
  if (!message) return c.json({ error: "not found" }, 404);

  const threadKey = message.thread_id ?? message.message_id ?? message.id;
  const [thread, attachments, labelMap] = await Promise.all([
    getThread(db, threadKey),
    getAttachments(db, id),
    labelsForMessages(db, [id]),
  ]);

  const detail: MessageDetail = {
    message,
    thread: thread.length ? thread : [message],
    attachments,
    labels: labelMap.get(id) ?? [],
  };
  return c.json(detail);
});

messages.post("/mark-read", async (c) => {
  const { id, read } = await c.req
    .json<{ id?: string; read?: boolean }>()
    .catch(() => ({}) as { id?: string; read?: boolean });
  if (!id) return c.json({ error: "id required" }, 400);
  await markRead(c.env.DB, id, read !== false);
  return c.json({ ok: true });
});

messages.post("/delete", async (c) => {
  const { id } = await c.req.json<{ id?: string }>().catch(() => ({}) as { id?: string });
  if (!id) return c.json({ error: "id required" }, 400);
  await softDelete(c.env.DB, id);
  return c.json({ ok: true });
});

messages.post("/flag", async (c) => {
  const { ids, field, value } = await c.req
    .json<{ ids?: string[]; field?: string; value?: 0 | 1 }>()
    .catch(() => ({}) as Record<string, never>);
  if (!ids?.length || !field || !FLAG_FIELDS.includes(field as FlagField) || value === undefined) {
    return c.json({ error: "invalid params" }, 400);
  }
  await setFlag(c.env.DB, ids, field as FlagField, value);
  return c.json({ ok: true });
});

messages.post("/snooze", async (c) => {
  const { ids, until } = await c.req
    .json<{ ids?: string[]; until?: number | null }>()
    .catch(() => ({}) as Record<string, never>);
  if (!ids?.length || until === undefined) {
    return c.json({ error: "ids and until required" }, 400);
  }
  await setSnooze(c.env.DB, ids, until);
  return c.json({ ok: true });
});

messages.post("/mark-all-read", async (c) => {
  const { view, labelId } = await c.req
    .json<{ view?: string; labelId?: string }>()
    .catch(() => ({}) as Record<string, never>);
  await markAllRead(c.env.DB, { view: (view as ViewName) || "inbox", labelId });
  return c.json({ ok: true });
});

messages.post("/permanent-delete", async (c) => {
  const { ids } = await c.req.json<{ ids?: string[] }>().catch(() => ({}) as { ids?: string[] });
  if (!ids?.length) return c.json({ error: "ids required" }, 400);
  await permanentDeleteMessages(c.env.DB, ids);
  return c.json({ ok: true });
});

messages.post("/labels", async (c) => {
  const { messageIds, labelIds } = await c.req
    .json<{ messageIds?: string[]; labelIds?: string[] }>()
    .catch(() => ({}) as Record<string, never>);
  if (!messageIds?.length || !labelIds?.length) {
    return c.json({ error: "messageIds and labelIds required" }, 400);
  }
  await applyLabels(c.env.DB, messageIds, labelIds);
  return c.json({ ok: true });
});

messages.delete("/labels", async (c) => {
  const { messageId, labelId } = await c.req
    .json<{ messageId?: string; labelId?: string }>()
    .catch(() => ({}) as Record<string, never>);
  if (!messageId || !labelId) return c.json({ error: "messageId and labelId required" }, 400);
  await removeLabel(c.env.DB, messageId, labelId);
  return c.json({ ok: true });
});

messages.post("/cancel-send", async (c) => {
  const { id } = await c.req.json<{ id?: string }>().catch(() => ({}) as { id?: string });
  if (!id) return c.json({ error: "id required" }, 400);
  const cancelled = await cancelPendingMessage(c.env.DB, id);
  return c.json({ ok: true, cancelled });
});

messages.post("/send-now", async (c) => {
  const { id } = await c.req.json<{ id?: string }>().catch(() => ({}) as { id?: string });
  if (!id) return c.json({ error: "id required" }, 400);

  const claimed = await claimPendingMessage(c.env.DB, id);
  if (!claimed) return c.json({ ok: true, skipped: true });

  const msg = await getMessage(c.env.DB, id);
  if (!msg) return c.json({ error: "not found" }, 404);

  if (!(await getReplyEnabled(c.env.DB))) {
    return c.json({ error: "Replies disabled in settings" }, 403);
  }

  try {
    await c.env.EMAIL.send({
      to: msg.to_addr,
      from: msg.from_addr || c.env.REPLY_FROM,
      subject: msg.subject ?? "(no subject)",
      html: msg.html ?? undefined,
      text: msg.text ?? "",
    });
    await markMessageSent(c.env.DB, id);
    return c.json({ ok: true });
  } catch (err) {
    console.error("send-now failed", err);
    return c.json({ error: (err as Error)?.message ?? "send failed" }, 500);
  }
});
