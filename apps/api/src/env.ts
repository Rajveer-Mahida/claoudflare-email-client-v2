export interface EmailAttachmentOut {
  content: ArrayBuffer | string;
  filename: string;
  type?: string;
  disposition?: "attachment" | "inline";
  contentId?: string;
}

export interface SendEmailBinding {
  send(opts: {
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
  }): Promise<{ messageId: string }>;
}

export type Env = {
  // Bindings — see wrangler.jsonc / instances.jsonc.
  DB: D1Database;
  EMAIL_CACHE: R2Bucket;
  EMAIL: SendEmailBinding;
  ASSETS: Fetcher;

  // Inbound mail. ALIAS_DOMAINS is the only required var: mail addressed to any
  // other domain is rejected. ALLOWED_EMAILS narrows that further — empty means
  // every address on those domains is accepted, entries may use `*` wildcards.
  ALIAS_DOMAINS?: string;
  ALLOWED_EMAILS?: string;
  FORWARD_TO?: string;
  FALLBACK_FORWARD_TO?: string;

  // Display only: shapes the addresses the alias generator suggests
  // (<name>.<suffix>@<domain>). Does not affect which mail is accepted.
  ALIAS_SUFFIX?: string;

  // Outbound fallback sender; defaults to reply@<first ALIAS_DOMAINS entry>.
  REPLY_FROM?: string;

  // Login. Both are secrets and both are required — auth fails closed without
  // AUTH_SECRET rather than falling back to a well-known value.
  AUTH_SECRET?: string;
  AUTH_PASSWORD?: string;

  // Web push (VAPID). The public key is derived from the private JWK.
  VAPID_SUBJECT?: string;
  VAPID_PRIVATE_JWK?: string;

  // AI (Claude). AI_MODEL overrides the default model.
  ANTHROPIC_API_KEY?: string;
  AI_MODEL?: string;
};

/** Hono context env shape. */
export type HonoEnv = { Bindings: Env };
