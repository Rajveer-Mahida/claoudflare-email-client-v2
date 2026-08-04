// Undo-send cron — ported from the legacy project's src/scheduled.ts (with the
// from_addr fix). Sends pending replies whose send_after has elapsed. This worker
// is now the SINGLE owner of the cron (legacy workers deleted).

import type { Env } from "./env";
import { replyFrom } from "./settings";
import { sendMail, SendError } from "./send";
import { markSendOutcome, referencesForOutbound } from "./db";

export async function runScheduled(env: Env): Promise<void> {
  const now = Date.now();

  const { results: pending } = await env.DB.prepare(
    `SELECT id, in_reply_to, to_addr, cc, bcc, from_addr, subject, html, text FROM messages
      WHERE send_state = 'pending' AND send_after <= ? AND is_deleted = 0`,
  )
    .bind(now)
    .all<{
      id: string;
      in_reply_to: string | null;
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
      `UPDATE messages SET send_state = 'sending', send_error = NULL WHERE id = ? AND send_state = 'pending'`,
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
      await sendMail(env, {
        // The cron can run this row again; let the provider de-duplicate rather
        // than sending a real person the same mail twice.
        idempotencyKey: msg.id,
        inReplyTo: msg.in_reply_to,
        references: await referencesForOutbound(env.DB, msg.in_reply_to),
        to: splitAddrs(msg.to_addr),
        cc: cc.length ? cc : undefined,
        bcc: bcc.length ? bcc : undefined,
        from: msg.from_addr || replyFrom(env),
        subject: msg.subject ?? "(no subject)",
        html: msg.html ?? undefined,
        text: msg.text ?? "",
        attachments: attachments.length ? attachments : undefined,
      });
      await env.DB.prepare(
        `UPDATE messages SET send_state = 'sent', send_error = NULL WHERE id = ?`,
      )
        .bind(msg.id)
        .run();
    } catch (err) {
      // Log the reason, not just a stack — the previous form gave no clue why.
      console.error(
        "scheduled send failed",
        msg.id,
        (err as Error)?.message ?? String(err),
        err instanceof SendError ? `status=${err.status} permanent=${err.permanent}` : "",
      );
      // A permanent failure (unverified domain, bad key, malformed request)
      // fails identically next minute and every minute after, so park it as
      // 'failed' — the cron only picks up 'pending'. Transient failures still
      // revert to 'pending' and retry.
      const permanent = err instanceof SendError && err.permanent;
      const message = (err as Error)?.message ?? "send failed";
      await markSendOutcome(env.DB, msg.id, permanent ? "failed" : "pending", message);
    }
  }
}
