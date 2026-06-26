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
  DB: D1Database;
  EMAIL_CACHE: R2Bucket;
  EMAIL: SendEmailBinding;
  REPLY_FROM: string;
  ALIAS_DOMAIN?: string;
  ALIAS_DOMAINS?: string;
  ALIAS_SUFFIX?: string;
  AUTH_SECRET?: string;
  AUTH_PASSWORD?: string;
  // inbound email ingestion
  ALIAS_PATTERN?: string;
  FORWARD_TO?: string;
  FALLBACK_FORWARD_TO?: string;
};

/** Hono context env shape. */
export type HonoEnv = { Bindings: Env };
