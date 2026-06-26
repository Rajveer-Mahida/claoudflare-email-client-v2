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
};

/** A list row is the message minus heavy body fields, plus its labels. */
export type MessageListItem = Omit<MessageRow, "html" | "text"> & {
  labels: LabelRow[];
};

/** Full message detail: the message, its thread, attachments, and labels. */
export type MessageDetail = {
  message: MessageRow;
  thread: MessageRow[];
  attachments: AttachmentRow[];
  labels: LabelRow[];
};

export type SettingsResponse = {
  reply_enabled: boolean;
  primary_alias_domain: string;
  alias_domains: string[];
};

export type FlagField = "is_starred" | "is_archived" | "is_deleted" | "is_read";
