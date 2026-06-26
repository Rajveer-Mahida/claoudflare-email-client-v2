// Undo-send cron — ported from the legacy project's src/scheduled.ts (with the
// from_addr fix). Sends pending replies whose send_after has elapsed. This worker
// is now the SINGLE owner of the cron (legacy workers deleted).

import type { Env } from "./env";

export async function runScheduled(env: Env): Promise<void> {
  const now = Date.now();

  const { results: pending } = await env.DB.prepare(
    `SELECT id, to_addr, from_addr, subject, html, text FROM messages
      WHERE send_state = 'pending' AND send_after <= ? AND is_deleted = 0`,
  )
    .bind(now)
    .all<{
      id: string;
      to_addr: string;
      from_addr: string | null;
      subject: string | null;
      html: string | null;
      text: string | null;
    }>();

  for (const msg of pending ?? []) {
    const claim = await env.DB.prepare(
      `UPDATE messages SET send_state = 'sending' WHERE id = ? AND send_state = 'pending'`,
    )
      .bind(msg.id)
      .run();

    if (!((claim.meta?.changes ?? 0) > 0)) continue;

    try {
      await env.EMAIL.send({
        to: msg.to_addr,
        from: msg.from_addr || env.REPLY_FROM || "reply@rajveer.space",
        subject: msg.subject ?? "(no subject)",
        html: msg.html ?? undefined,
        text: msg.text ?? "",
      });
      await env.DB.prepare(`UPDATE messages SET send_state = 'sent' WHERE id = ?`).bind(msg.id).run();
    } catch (err) {
      console.error("scheduled send failed", msg.id, err);
      // revert claim so it can retry next tick
      await env.DB.prepare(`UPDATE messages SET send_state = 'pending' WHERE id = ?`).bind(msg.id).run();
    }
  }
}
