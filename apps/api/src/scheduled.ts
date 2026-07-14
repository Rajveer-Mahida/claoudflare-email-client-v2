// Undo-send cron — ported from the legacy project's src/scheduled.ts (with the
// from_addr fix). Sends pending replies whose send_after has elapsed. This worker
// is now the SINGLE owner of the cron (legacy workers deleted).

import type { Env } from "./env";

export async function runScheduled(env: Env): Promise<void> {
  const now = Date.now();

  const { results: pending } = await env.DB.prepare(
    `SELECT id, to_addr, cc, bcc, from_addr, subject, html, text FROM messages
      WHERE send_state = 'pending' AND send_after <= ? AND is_deleted = 0`,
  )
    .bind(now)
    .all<{
      id: string;
      to_addr: string;
      cc: string | null;
      bcc: string | null;
      from_addr: string | null;
      subject: string | null;
      html: string | null;
      text: string | null;
    }>();

  const splitAddrs = (s: string | null) =>
    (s ?? "").split(",").map((x) => x.trim()).filter(Boolean);

  for (const msg of pending ?? []) {
    const claim = await env.DB.prepare(
      `UPDATE messages SET send_state = 'sending' WHERE id = ? AND send_state = 'pending'`,
    )
      .bind(msg.id)
      .run();

    if (!((claim.meta?.changes ?? 0) > 0)) continue;

    try {
      // Pull any stored attachment blobs back from R2.
      const { results: atts } = await env.DB.prepare(
        `SELECT filename, mime_type, r2_key FROM attachments WHERE message_id = ?`,
      )
        .bind(msg.id)
        .all<{ filename: string | null; mime_type: string | null; r2_key: string }>();
      const attachments = [];
      for (const a of atts ?? []) {
        const obj = await env.EMAIL_CACHE.get(a.r2_key);
        if (!obj) continue;
        attachments.push({
          content: await obj.arrayBuffer(),
          filename: a.filename ?? "file",
          type: a.mime_type ?? "application/octet-stream",
          disposition: "attachment" as const,
        });
      }

      const cc = splitAddrs(msg.cc);
      const bcc = splitAddrs(msg.bcc);
      await env.EMAIL.send({
        to: splitAddrs(msg.to_addr),
        cc: cc.length ? cc : undefined,
        bcc: bcc.length ? bcc : undefined,
        from: msg.from_addr || env.REPLY_FROM,
        subject: msg.subject ?? "(no subject)",
        html: msg.html ?? undefined,
        text: msg.text ?? "",
        attachments: attachments.length ? attachments : undefined,
      });
      await env.DB.prepare(`UPDATE messages SET send_state = 'sent' WHERE id = ?`).bind(msg.id).run();
    } catch (err) {
      console.error("scheduled send failed", msg.id, err);
      // revert claim so it can retry next tick
      await env.DB.prepare(`UPDATE messages SET send_state = 'pending' WHERE id = ?`).bind(msg.id).run();
    }
  }
}
