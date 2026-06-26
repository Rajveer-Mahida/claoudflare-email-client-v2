-- Phase 1: compose & sending.
-- cc/bcc on outbound messages so scheduled sends carry them; drafts table.

ALTER TABLE messages ADD COLUMN cc TEXT;
ALTER TABLE messages ADD COLUMN bcc TEXT;

CREATE TABLE IF NOT EXISTS drafts (
  id             TEXT PRIMARY KEY,
  to_addr        TEXT NOT NULL DEFAULT '',
  cc             TEXT,
  bcc            TEXT,
  subject        TEXT,
  text           TEXT,
  html           TEXT,
  in_reply_to_id TEXT,
  attachments    TEXT,           -- JSON UploadedAttachment[]
  updated_at     INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_drafts_updated ON drafts(updated_at DESC);
