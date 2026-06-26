// Ported near-verbatim from the legacy project's lib/db.ts.
// Only change: every function takes the D1Database explicitly (Hono passes c.env.DB)
// instead of pulling it from getCloudflareContext().

import type {
  MessageRow,
  AttachmentRow,
  LabelRow,
  ViewCounts,
  LabelCount,
  ViewName,
  DraftRow,
} from "@email/shared";

type DB = D1Database;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function viewWhere(view: ViewName, now: number): { where: string; args: unknown[] } {
  switch (view) {
    case "starred":
      return { where: "is_starred=1 AND is_deleted=0", args: [] };
    case "snoozed":
      return { where: "snooze_until > ? AND is_deleted=0", args: [now] };
    case "archived":
      return { where: "is_archived=1 AND is_deleted=0", args: [] };
    case "trash":
      return { where: "is_deleted=1", args: [] };
    case "sent":
      return {
        where:
          "direction='out' AND (send_state IS NULL OR send_state IN ('sent','pending','cancelled'))",
        args: [],
      };
    default: // inbox
      return {
        where:
          "is_deleted=0 AND is_archived=0 AND direction='in' AND (snooze_until IS NULL OR snooze_until <= ?)",
        args: [now],
      };
  }
}

export async function listMessages(
  db: DB,
  opts: {
    limit?: number;
    offset?: number;
    q?: string;
    view?: ViewName;
    labelId?: string;
  } = {},
): Promise<MessageRow[]> {
  const limit = opts.limit ?? 50;
  const offset = opts.offset ?? 0;
  const view = opts.view ?? "inbox";
  const now = Date.now();
  const { where, args } = viewWhere(view, now);

  if (opts.labelId) {
    if (opts.q?.trim()) {
      const term = opts.q.trim().replace(/"/g, '""');
      const res = await db
        .prepare(
          `SELECT m.* FROM messages m
           JOIN messages_fts f ON f.rowid = m.rowid
           JOIN message_labels ml ON ml.message_id = m.id
           WHERE messages_fts MATCH ? AND ml.label_id = ? AND m.is_deleted = 0
           ORDER BY m.received_at DESC LIMIT ? OFFSET ?`,
        )
        .bind(`"${term}"*`, opts.labelId, limit, offset)
        .all<MessageRow>();
      return res.results ?? [];
    }
    const res = await db
      .prepare(
        `SELECT m.* FROM messages m
         JOIN message_labels ml ON ml.message_id = m.id
         WHERE ml.label_id = ? AND m.is_deleted = 0
         ORDER BY m.received_at DESC LIMIT ? OFFSET ?`,
      )
      .bind(opts.labelId, limit, offset)
      .all<MessageRow>();
    return res.results ?? [];
  }

  if (opts.q?.trim()) {
    const term = opts.q.trim().replace(/"/g, '""');
    const res = await db
      .prepare(
        `SELECT m.* FROM messages m
         JOIN messages_fts f ON f.rowid = m.rowid
         WHERE messages_fts MATCH ? AND ${where}
         ORDER BY m.received_at DESC LIMIT ? OFFSET ?`,
      )
      .bind(`"${term}"*`, ...args, limit, offset)
      .all<MessageRow>();
    return res.results ?? [];
  }

  const res = await db
    .prepare(
      `SELECT * FROM messages WHERE ${where} ORDER BY received_at DESC LIMIT ? OFFSET ?`,
    )
    .bind(...args, limit, offset)
    .all<MessageRow>();
  return res.results ?? [];
}

export async function getViewCounts(db: DB): Promise<ViewCounts> {
  const now = Date.now();
  const row = await db
    .prepare(
      `SELECT
        SUM(CASE WHEN is_deleted=0 AND is_archived=0 AND direction='in' AND (snooze_until IS NULL OR snooze_until <= ?) THEN 1 ELSE 0 END) as inbox,
        SUM(CASE WHEN is_read=0 AND is_deleted=0 AND is_archived=0 AND direction='in' AND (snooze_until IS NULL OR snooze_until <= ?) THEN 1 ELSE 0 END) as unread,
        SUM(CASE WHEN is_starred=1 AND is_deleted=0 THEN 1 ELSE 0 END) as starred,
        SUM(CASE WHEN snooze_until > ? AND is_deleted=0 THEN 1 ELSE 0 END) as snoozed,
        SUM(CASE WHEN is_archived=1 AND is_deleted=0 THEN 1 ELSE 0 END) as archived,
        SUM(CASE WHEN is_deleted=1 THEN 1 ELSE 0 END) as trash,
        SUM(CASE WHEN direction='out' AND (send_state IS NULL OR send_state IN ('sent','pending')) THEN 1 ELSE 0 END) as sent
      FROM messages`,
    )
    .bind(now, now, now)
    .first<ViewCounts>();
  return row ?? { inbox: 0, unread: 0, starred: 0, snoozed: 0, archived: 0, trash: 0, sent: 0 };
}

export async function getLabelCounts(db: DB): Promise<LabelCount[]> {
  const res = await db
    .prepare(
      `SELECT l.id, l.name, l.color, l.created_at, COUNT(ml.message_id) as count
       FROM labels l
       LEFT JOIN message_labels ml ON ml.label_id = l.id
       LEFT JOIN messages m ON m.id = ml.message_id AND m.is_deleted = 0
       GROUP BY l.id
       ORDER BY l.name ASC`,
    )
    .all<LabelCount>();
  return res.results ?? [];
}

export async function getMessage(db: DB, id: string): Promise<MessageRow | null> {
  const res = await db.prepare(`SELECT * FROM messages WHERE id = ?`).bind(id).first<MessageRow>();
  return res ?? null;
}

export async function getThread(db: DB, threadId: string): Promise<MessageRow[]> {
  const res = await db
    .prepare(`SELECT * FROM messages WHERE thread_id = ? ORDER BY received_at ASC`)
    .bind(threadId)
    .all<MessageRow>();
  return res.results ?? [];
}

export async function getAttachments(db: DB, messageId: string): Promise<AttachmentRow[]> {
  const res = await db
    .prepare(`SELECT * FROM attachments WHERE message_id = ?`)
    .bind(messageId)
    .all<AttachmentRow>();
  return res.results ?? [];
}

export async function attachmentsForMessages(
  db: DB,
  ids: string[],
): Promise<Record<string, AttachmentRow[]>> {
  const map: Record<string, AttachmentRow[]> = {};
  if (!ids.length) return map;
  const ph = ids.map(() => "?").join(",");
  const res = await db
    .prepare(`SELECT * FROM attachments WHERE message_id IN (${ph})`)
    .bind(...ids)
    .all<AttachmentRow>();
  for (const a of res.results ?? []) {
    (map[a.message_id] ??= []).push(a);
  }
  return map;
}

export async function getAttachmentByCid(
  db: DB,
  messageId: string,
  contentId: string,
): Promise<AttachmentRow | null> {
  const res = await db
    .prepare(`SELECT * FROM attachments WHERE message_id = ? AND content_id = ?`)
    .bind(messageId, contentId)
    .first<AttachmentRow>();
  return res ?? null;
}

export async function markRead(db: DB, id: string, read = true): Promise<void> {
  await db.prepare(`UPDATE messages SET is_read = ? WHERE id = ?`).bind(read ? 1 : 0, id).run();
}

export async function softDelete(db: DB, id: string): Promise<void> {
  await db.prepare(`UPDATE messages SET is_deleted = 1 WHERE id = ?`).bind(id).run();
}

export async function permanentDeleteMessages(db: DB, ids: string[]): Promise<void> {
  if (!ids.length) return;
  for (const c of chunk(ids, 100)) {
    const ph = c.map(() => "?").join(",");
    await db.prepare(`DELETE FROM messages WHERE id IN (${ph})`).bind(...c).run();
  }
}

export async function markAllRead(
  db: DB,
  opts: { view: ViewName; labelId?: string },
): Promise<void> {
  const now = Date.now();
  if (opts.labelId) {
    await db
      .prepare(
        `UPDATE messages SET is_read = 1 WHERE is_read = 0 AND id IN (
          SELECT m.id FROM messages m JOIN message_labels ml ON ml.message_id = m.id
          WHERE ml.label_id = ? AND m.is_deleted = 0
        )`,
      )
      .bind(opts.labelId)
      .run();
    return;
  }
  const { where, args } = viewWhere(opts.view, now);
  await db.prepare(`UPDATE messages SET is_read = 1 WHERE is_read = 0 AND ${where}`).bind(...args).run();
}

export async function setFlag(
  db: DB,
  ids: string[],
  field: "is_starred" | "is_archived" | "is_deleted" | "is_read",
  value: 0 | 1,
): Promise<void> {
  if (!ids.length) return;
  for (const c of chunk(ids, 100)) {
    const ph = c.map(() => "?").join(",");
    await db.prepare(`UPDATE messages SET ${field} = ? WHERE id IN (${ph})`).bind(value, ...c).run();
  }
}

export async function setSnooze(db: DB, ids: string[], until: number | null): Promise<void> {
  if (!ids.length) return;
  for (const c of chunk(ids, 100)) {
    const ph = c.map(() => "?").join(",");
    await db.prepare(`UPDATE messages SET snooze_until = ? WHERE id IN (${ph})`).bind(until, ...c).run();
  }
}

// ── Labels ──────────────────────────────────────────────────────────────────

export async function listLabels(db: DB): Promise<LabelRow[]> {
  const res = await db.prepare(`SELECT * FROM labels ORDER BY name ASC`).all<LabelRow>();
  return res.results ?? [];
}

export async function createLabel(db: DB, name: string, color: string): Promise<LabelRow> {
  const id = crypto.randomUUID();
  const created_at = Date.now();
  await db
    .prepare(`INSERT INTO labels (id, name, color, created_at) VALUES (?,?,?,?)`)
    .bind(id, name, color, created_at)
    .run();
  return { id, name, color, created_at };
}

export async function deleteLabel(db: DB, id: string): Promise<void> {
  await db.prepare(`DELETE FROM labels WHERE id = ?`).bind(id).run();
}

export async function applyLabels(db: DB, messageIds: string[], labelIds: string[]): Promise<void> {
  for (const mid of messageIds) {
    for (const lid of labelIds) {
      await db
        .prepare(`INSERT OR IGNORE INTO message_labels (message_id, label_id) VALUES (?,?)`)
        .bind(mid, lid)
        .run();
    }
  }
}

export async function removeLabel(db: DB, messageId: string, labelId: string): Promise<void> {
  await db
    .prepare(`DELETE FROM message_labels WHERE message_id = ? AND label_id = ?`)
    .bind(messageId, labelId)
    .run();
}

export async function labelsForMessages(
  db: DB,
  ids: string[],
): Promise<Map<string, LabelRow[]>> {
  if (!ids.length) return new Map();
  const ph = ids.map(() => "?").join(",");
  const res = await db
    .prepare(
      `SELECT ml.message_id, l.id, l.name, l.color, l.created_at
       FROM message_labels ml JOIN labels l ON l.id = ml.label_id
       WHERE ml.message_id IN (${ph})`,
    )
    .bind(...ids)
    .all<{ message_id: string } & LabelRow>();
  const map = new Map<string, LabelRow[]>();
  for (const row of res.results ?? []) {
    const arr = map.get(row.message_id) ?? [];
    arr.push({ id: row.id, name: row.name, color: row.color, created_at: row.created_at });
    map.set(row.message_id, arr);
  }
  return map;
}

// ── Outbound / undo-send ─────────────────────────────────────────────────────

export async function insertOutbound(
  db: DB,
  opts: {
    inReplyToMessageId: string;
    from: string;
    to: string;
    subject: string;
    html: string | null;
    text: string;
    sendAfter?: number;
  },
): Promise<string> {
  const id = crypto.randomUUID();
  const ts = Date.now();
  const snippet = opts.text.replace(/\s+/g, " ").trim().slice(0, 200);
  const pending = opts.sendAfter !== undefined;

  const parent = await getMessage(db, opts.inReplyToMessageId);
  const threadId = parent?.thread_id ?? parent?.message_id ?? opts.inReplyToMessageId;
  const inReplyTo = parent?.message_id ?? null;

  await db
    .prepare(
      `INSERT INTO messages
         (id, in_reply_to, thread_id, direction, from_addr, from_name,
          to_addr, subject, snippet, html, text, raw_key, received_at, is_read,
          send_state, send_after)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?)`,
    )
    .bind(
      id,
      inReplyTo,
      threadId,
      "out",
      opts.from,
      null,
      opts.to,
      opts.subject,
      snippet,
      opts.html,
      opts.text,
      "",
      ts,
      pending ? "pending" : null,
      opts.sendAfter ?? null,
    )
    .run();
  return id;
}

/** Record an outbound message (new compose / forward / reply) with cc/bcc and
 *  attachment rows. Returns the new message id. Pending if sendAfter is set. */
export async function recordOutbound(
  db: DB,
  opts: {
    from: string;
    to: string;
    cc?: string | null;
    bcc?: string | null;
    subject: string;
    html: string | null;
    text: string;
    inReplyToMessageId?: string | null;
    sendAfter?: number;
    attachments?: { key: string; filename: string; mime_type: string; size_bytes: number }[];
  },
): Promise<string> {
  const id = crypto.randomUUID();
  const ts = Date.now();
  const snippet = opts.text.replace(/\s+/g, " ").trim().slice(0, 200);
  const pending = opts.sendAfter !== undefined;

  let threadId: string = id;
  let inReplyTo: string | null = null;
  if (opts.inReplyToMessageId) {
    const parent = await getMessage(db, opts.inReplyToMessageId);
    threadId = parent?.thread_id ?? parent?.message_id ?? opts.inReplyToMessageId;
    inReplyTo = parent?.message_id ?? null;
  }

  await db
    .prepare(
      `INSERT INTO messages
         (id, in_reply_to, thread_id, direction, from_addr, from_name,
          to_addr, cc, bcc, subject, snippet, html, text, raw_key, received_at,
          is_read, send_state, send_after)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?)`,
    )
    .bind(
      id,
      inReplyTo,
      threadId,
      "out",
      opts.from,
      null,
      opts.to,
      opts.cc ?? null,
      opts.bcc ?? null,
      opts.subject,
      snippet,
      opts.html,
      opts.text,
      "",
      ts,
      pending ? "pending" : null,
      opts.sendAfter ?? null,
    )
    .run();

  for (const a of opts.attachments ?? []) {
    await db
      .prepare(
        `INSERT INTO attachments (id, message_id, filename, mime_type, r2_key, size_bytes, content_id)
         VALUES (?,?,?,?,?,?,?)`,
      )
      .bind(crypto.randomUUID(), id, a.filename, a.mime_type, a.key, a.size_bytes, null)
      .run();
  }
  return id;
}

// ── Drafts ───────────────────────────────────────────────────────────────────

export async function listDrafts(db: DB): Promise<DraftRow[]> {
  const res = await db.prepare(`SELECT * FROM drafts ORDER BY updated_at DESC`).all<DraftRow>();
  return res.results ?? [];
}

export async function getDraft(db: DB, id: string): Promise<DraftRow | null> {
  return (await db.prepare(`SELECT * FROM drafts WHERE id = ?`).bind(id).first<DraftRow>()) ?? null;
}

export async function upsertDraft(
  db: DB,
  d: {
    id?: string;
    to_addr: string;
    cc?: string | null;
    bcc?: string | null;
    subject?: string | null;
    text?: string | null;
    html?: string | null;
    in_reply_to_id?: string | null;
    attachments?: string | null;
  },
): Promise<DraftRow> {
  const id = d.id ?? crypto.randomUUID();
  const updated_at = Date.now();
  await db
    .prepare(
      `INSERT INTO drafts (id, to_addr, cc, bcc, subject, text, html, in_reply_to_id, attachments, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET
         to_addr=excluded.to_addr, cc=excluded.cc, bcc=excluded.bcc, subject=excluded.subject,
         text=excluded.text, html=excluded.html, in_reply_to_id=excluded.in_reply_to_id,
         attachments=excluded.attachments, updated_at=excluded.updated_at`,
    )
    .bind(
      id,
      d.to_addr,
      d.cc ?? null,
      d.bcc ?? null,
      d.subject ?? null,
      d.text ?? null,
      d.html ?? null,
      d.in_reply_to_id ?? null,
      d.attachments ?? null,
      updated_at,
    )
    .run();
  return {
    id,
    to_addr: d.to_addr,
    cc: d.cc ?? null,
    bcc: d.bcc ?? null,
    subject: d.subject ?? null,
    text: d.text ?? null,
    html: d.html ?? null,
    in_reply_to_id: d.in_reply_to_id ?? null,
    attachments: d.attachments ?? null,
    updated_at,
  };
}

export async function deleteDraft(db: DB, id: string): Promise<void> {
  await db.prepare(`DELETE FROM drafts WHERE id = ?`).bind(id).run();
}

export async function draftCount(db: DB): Promise<number> {
  const r = await db.prepare(`SELECT COUNT(*) AS n FROM drafts`).first<{ n: number }>();
  return r?.n ?? 0;
}

export async function claimPendingMessage(db: DB, id: string): Promise<boolean> {
  const res = await db
    .prepare(`UPDATE messages SET send_state='sending' WHERE id = ? AND send_state = 'pending'`)
    .bind(id)
    .run();
  return (res.meta?.changes ?? 0) > 0;
}

export async function markMessageSent(db: DB, id: string): Promise<void> {
  await db.prepare(`UPDATE messages SET send_state='sent' WHERE id = ?`).bind(id).run();
}

export async function cancelPendingMessage(db: DB, id: string): Promise<boolean> {
  const res = await db
    .prepare(`UPDATE messages SET send_state='cancelled' WHERE id = ? AND send_state = 'pending'`)
    .bind(id)
    .run();
  return (res.meta?.changes ?? 0) > 0;
}
