// Outbound mail, with a provider behind it.
//
// Cloudflare's send_email binding may only deliver to *verified destination
// addresses* — addresses you own and have confirmed. Replying to a real
// correspondent therefore fails with "destination address is not a verified
// address", and their address can never be verified because Cloudflare mails
// the confirmation link to them. Lifting that needs Email Sending, which
// requires the Workers Paid plan.
//
// So: when RESEND_API_KEY is set, send through Resend and reach anyone. When it
// isn't, fall back to the binding, unchanged — a deployment on Workers Paid
// needs no API key and nothing that already worked breaks.

import type { Env, EmailAttachmentOut, SendEmailBinding } from "./env";

const RESEND_API = "https://api.resend.com/emails";

/** Exactly the binding's option shape, so call sites don't have to change. */
export type SendOptions = {
  to: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  from: string | { email: string; name?: string };
  replyTo?: string;
  subject: string;
  html?: string;
  text?: string;
  attachments?: EmailAttachmentOut[];
  headers?: Record<string, string>;
  /**
   * Retry-safety for paths that can run twice (the cron, send-now). Resend
   * de-duplicates on this for 24h, so a send it accepted but whose response we
   * never saw won't go out twice — a duplicate email to a real person.
   */
  idempotencyKey?: string;
  /**
   * The parent's Message-ID, for a reply. Becomes In-Reply-To (and the seed for
   * References) so the mail threads in the recipient's client — and because a
   * "Re:" subject with no threading headers reads as unsolicited to spam filters.
   */
  inReplyTo?: string | null;
  /**
   * Full References chain when known (e.g. grandparent + parent). Falls back to
   * `[inReplyTo]` when omitted.
   */
  references?: string[];
};

type BindingSendOpts = Parameters<SendEmailBinding["send"]>[0];

/** Message-IDs travel in angle brackets; stored values may lack them. */
function messageIdRef(id: string): string {
  const t = id.trim();
  return t.startsWith("<") ? t : `<${t}>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * A plain-text-only message is a spam signal on its own — real mail clients
 * send multipart/alternative. When we have text but no HTML, derive a minimal
 * HTML part rather than sending text alone.
 */
export function htmlFromText(text: string): string {
  return `<div style="white-space:pre-wrap">${escapeHtml(text)}</div>`;
}

/** Build a space-separated References value, unique and bracket-normalized. */
export function formatReferences(ids: string[]): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    const t = id?.trim();
    if (!t) continue;
    const ref = messageIdRef(t);
    if (seen.has(ref)) continue;
    seen.add(ref);
    out.push(ref);
  }
  return out.join(" ");
}

/** Threading headers + an HTML alternative, applied to every send path. */
export function withDeliverability(opts: SendOptions): SendOptions {
  const out: SendOptions = { ...opts };

  if (opts.inReplyTo) {
    const ref = messageIdRef(opts.inReplyTo);
    const chain = opts.references?.length ? opts.references : [opts.inReplyTo];
    out.headers = {
      "In-Reply-To": ref,
      References: formatReferences(chain),
      ...(opts.headers ?? {}),
    };
  }

  if (!out.html && out.text && out.text.trim()) {
    out.html = htmlFromText(out.text);
  }
  return out;
}

/**
 * Drop transport-only fields before calling the Cloudflare binding — it only
 * accepts the binding shape, and unknown keys are not part of that contract.
 */
export function toBindingOptions(opts: SendOptions): BindingSendOpts {
  const { idempotencyKey: _k, inReplyTo: _i, references: _r, ...binding } = opts;
  return binding;
}

export class SendError extends Error {
  status?: number;
  /** Retrying will never help — bad request, unverified domain, bad key. */
  permanent: boolean;
  constructor(message: string, opts: { status?: number; permanent: boolean }) {
    super(message);
    this.name = "SendError";
    this.status = opts.status;
    this.permanent = opts.permanent;
  }
}

/**
 * Is a provider failure worth retrying?
 *
 * 4xx means we sent something wrong and will keep sending it wrong. The
 * exceptions are 408 (timeout), 429 (rate limit), and Resend's
 * `concurrent_idempotent_requests` (409 — same key still in flight; safe to
 * retry). `invalid_idempotent_request` (also 409 — same key, different payload)
 * stays permanent.
 */
export function isPermanentFailure(status: number, errorName?: string): boolean {
  if (errorName === "concurrent_idempotent_requests") return false;
  if (status === 408 || status === 429) return false;
  return status >= 400 && status < 500;
}

/** @deprecated Prefer isPermanentFailure — kept for callers that only have a status. */
export function isPermanentStatus(status: number): boolean {
  return isPermanentFailure(status);
}

/**
 * Base64 for an ArrayBuffer, in chunks.
 *
 * `btoa(String.fromCharCode(...bytes))` is the obvious version and blows the
 * call stack once the buffer is large — Resend accepts attachments up to 40MB,
 * so that limit is reachable in normal use.
 */
export function toBase64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  const CHUNK = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

function addressText(from: SendOptions["from"]): string {
  if (typeof from === "string") return from;
  return from.name ? `${from.name} <${from.email}>` : from.email;
}

/**
 * Map the binding's options onto Resend's schema. Exported so the mapping can
 * be unit-tested without a network call.
 *
 * Resend differs in several places: snake_case reply_to, content_type instead
 * of type, base64 content, and no `disposition` at all — inline images are
 * identified purely by content_id.
 */
export function toResendPayload(opts: SendOptions): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    from: addressText(opts.from),
    to: opts.to,
    subject: opts.subject,
  };
  if (opts.cc !== undefined) payload.cc = opts.cc;
  if (opts.bcc !== undefined) payload.bcc = opts.bcc;
  if (opts.replyTo !== undefined) payload.reply_to = opts.replyTo;
  if (opts.html !== undefined) payload.html = opts.html;
  if (opts.text !== undefined) payload.text = opts.text;
  if (opts.headers !== undefined) payload.headers = opts.headers;

  if (opts.attachments?.length) {
    payload.attachments = opts.attachments.map((a) => {
      const att: Record<string, unknown> = {
        filename: a.filename,
        content: typeof a.content === "string" ? a.content : toBase64(a.content),
      };
      if (a.type) att.content_type = a.type;
      if (a.contentId) att.content_id = a.contentId;
      return att;
    });
  }
  return payload;
}

async function sendViaResend(env: Env, opts: SendOptions): Promise<{ messageId: string }> {
  const headers: Record<string, string> = {
    authorization: `Bearer ${env.RESEND_API_KEY!.trim()}`,
    "content-type": "application/json",
  };
  if (opts.idempotencyKey) headers["Idempotency-Key"] = opts.idempotencyKey;

  let res: Response;
  try {
    res = await fetch(RESEND_API, {
      method: "POST",
      headers,
      body: JSON.stringify(toResendPayload(opts)),
    });
  } catch (err) {
    // Couldn't reach Resend at all — always worth retrying.
    throw new SendError((err as Error)?.message ?? "network error", { permanent: false });
  }

  if (!res.ok) {
    let detail = "";
    let errorName = "";
    try {
      const body = (await res.json()) as { message?: string; error?: string; name?: string };
      detail = body.message ?? body.error ?? body.name ?? "";
      errorName = body.name ?? "";
    } catch {
      /* non-JSON error body */
    }
    // Resend's own wording is specific ("The domain is not verified") and far
    // more useful to the user than anything we'd invent.
    throw new SendError(detail || `Resend returned ${res.status}`, {
      status: res.status,
      permanent: isPermanentFailure(res.status, errorName),
    });
  }

  const body = (await res.json().catch(() => ({}))) as { id?: string };
  return { messageId: body.id ?? "" };
}

/** True when outbound mail goes through Resend rather than the binding. */
export function usingResend(env: Env): boolean {
  return !!env.RESEND_API_KEY?.trim();
}

/**
 * Send one message. Resend when configured, else the Cloudflare binding.
 * Always throws SendError, so callers can tell a permanent failure from one
 * worth retrying.
 */
export async function sendMail(env: Env, raw: SendOptions): Promise<{ messageId: string }> {
  const opts = withDeliverability(raw);
  if (usingResend(env)) return sendViaResend(env, opts);

  try {
    return await env.EMAIL.send(toBindingOptions(opts));
  } catch (err) {
    // The binding rejects an unverified destination permanently — retrying that
    // every minute forever is exactly the loop this replaces.
    const message = (err as Error)?.message ?? "send failed";
    throw new SendError(message, { permanent: /not a verified|not allowed/i.test(message) });
  }
}
