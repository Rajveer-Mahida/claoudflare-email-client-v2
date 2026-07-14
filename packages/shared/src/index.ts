// Single source of truth for the JSON contract between the Hono API worker and the SPA.
// Mirrors the D1 schema in the existing project (migrations 0001–0003).

export type Direction = "in" | "out";

export type SendState = "pending" | "sending" | "sent" | "cancelled" | null;

export type MessageRow = {
  id: string;
  message_id: string | null;
  in_reply_to: string | null;
  thread_id: string | null;
  direction: Direction;
  from_addr: string;
  from_name: string | null;
  to_addr: string;
  cc: string | null;
  bcc: string | null;
  subject: string | null;
  snippet: string | null;
  html: string | null;
  text: string | null;
  raw_key: string;
  size_bytes: number | null;
  received_at: number;
  is_read: number;
  is_deleted: number;
  is_starred: number;
  is_archived: number;
  snooze_until: number | null;
  send_after: number | null;
  send_state: SendState;
};

export type AttachmentRow = {
  id: string;
  message_id: string;
  filename: string | null;
  mime_type: string | null;
  r2_key: string;
  size_bytes: number | null;
  content_id: string | null;
};

export type LabelRow = {
  id: string;
  name: string;
  color: string;
  created_at: number;
};

export type ViewName = "inbox" | "starred" | "snoozed" | "archived" | "trash" | "sent";

export const VIEWS: ViewName[] = ["inbox", "starred", "snoozed", "archived", "trash", "sent"];

export type ViewCounts = {
  inbox: number;
  unread: number;
  starred: number;
  snoozed: number;
  archived: number;
  trash: number;
  sent: number;
};

export type LabelCount = LabelRow & { count: number };

export type CountsResponse = {
  views: ViewCounts;
  labels: LabelCount[];
  drafts: number;
};

/** A list row is the message minus heavy body fields, plus its labels. */
export type MessageListItem = Omit<MessageRow, "html" | "text"> & {
  labels: LabelRow[];
};

/** Full message detail: the message, its thread, per-message attachments, and labels. */
export type MessageDetail = {
  message: MessageRow;
  thread: MessageRow[];
  /** Attachments keyed by message id — covers every message in the thread. */
  attachments: Record<string, AttachmentRow[]>;
  labels: LabelRow[];
};

export type SettingsResponse = {
  reply_enabled: boolean;
  compose_enabled: boolean;
  primary_alias_domain: string;
  alias_domains: string[];
  alias_suffix: string;
  signature: string;
  block_remote_images: boolean;
  image_allowlist: string[];
};

export type FlagField = "is_starred" | "is_archived" | "is_deleted" | "is_read";

// ── Compose / drafts ─────────────────────────────────────────────────────────

/** A file already uploaded to R2, ready to attach to an outgoing message. */
export type UploadedAttachment = {
  key: string; // R2 key under uploads/
  filename: string;
  mime_type: string;
  size_bytes: number;
};

export type ComposeRequest = {
  from?: string; // alias to send from; defaults to primary alias
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  text: string;
  html?: string | null;
  attachments?: UploadedAttachment[];
  sendAfter?: number; // schedule-send timestamp (ms)
  inReplyToMessageId?: string; // set for reply / forward threading
  draftId?: string; // delete this draft once sent
};

export type DraftRow = {
  id: string;
  to_addr: string; // comma-joined
  cc: string | null;
  bcc: string | null;
  subject: string | null;
  text: string | null;
  html: string | null;
  in_reply_to_id: string | null;
  attachments: string | null; // JSON UploadedAttachment[]
  updated_at: number;
};

export type SignatureResponse = { signature: string };

// ── Aliases ──────────────────────────────────────────────────────────────────

export type AliasRow = {
  address: string;
  name: string | null;
  note: string | null;
  disabled: number;
  created_at: number;
};

export type AliasWithCount = AliasRow & {
  mail_count: number;
  unread_count: number;
};

// ── Filters / rules ──────────────────────────────────────────────────────────

export type RuleField = "from" | "to" | "subject";
export type RuleOp = "contains" | "equals" | "startswith" | "endswith";
export type RuleAction = "label" | "archive" | "read" | "trash";

export type RuleRow = {
  id: string;
  field: RuleField;
  op: RuleOp;
  value: string;
  action: RuleAction;
  action_value: string | null; // label_id when action === "label"
  enabled: number;
  created_at: number;
};
