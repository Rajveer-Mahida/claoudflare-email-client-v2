-- Phase 8: multi-tenancy. FRESH START — drops all legacy tables and recreates the
-- full schema with per-user ownership (owner = Clerk userId) on every user-data table.
-- Base tables (messages/attachments/labels/message_labels/messages_fts) had no DDL
-- checked into this repo (inherited from the legacy D1); they are (re)created here so
-- the schema is now authoritative.
--
-- ⚠ DESTRUCTIVE: wipes all existing mail, aliases, labels, drafts, rules, settings.
-- Intended to run against a clean/staging D1. Do NOT apply to production without
-- an explicit decision to discard current data.

-- ── Drop legacy objects ──────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS messages_ai;
DROP TRIGGER IF EXISTS messages_ad;
DROP TRIGGER IF EXISTS messages_au;
DROP TABLE IF EXISTS messages_fts;
DROP TABLE IF EXISTS admin_audit;
DROP TABLE IF EXISTS push_subscriptions;
DROP TABLE IF EXISTS rules;
DROP TABLE IF EXISTS aliases;
DROP TABLE IF EXISTS drafts;
DROP TABLE IF EXISTS message_labels;
DROP TABLE IF EXISTS labels;
DROP TABLE IF EXISTS attachments;
DROP TABLE IF EXISTS messages;
DROP TABLE IF EXISTS settings;
DROP TABLE IF EXISTS users;

-- ── Users (mirror of Clerk identities; upserted on first authenticated request) ─
CREATE TABLE users (
  id         TEXT PRIMARY KEY,       -- Clerk userId (user_...)
  email      TEXT,
  created_at INTEGER NOT NULL
);

-- ── Messages ─────────────────────────────────────────────────────────────────
CREATE TABLE messages (
  id           TEXT PRIMARY KEY,
  owner        TEXT NOT NULL,        -- Clerk userId that owns this message
  message_id   TEXT,
  in_reply_to  TEXT,
  thread_id    TEXT,
  direction    TEXT NOT NULL,        -- 'in' | 'out'
  from_addr    TEXT NOT NULL,
  from_name    TEXT,
  to_addr      TEXT NOT NULL,
  cc           TEXT,
  bcc          TEXT,
  subject      TEXT,
  snippet      TEXT,
  html         TEXT,
  text         TEXT,
  raw_key      TEXT NOT NULL DEFAULT '',
  size_bytes   INTEGER,
  received_at  INTEGER NOT NULL,
  is_read      INTEGER NOT NULL DEFAULT 0,
  is_deleted   INTEGER NOT NULL DEFAULT 0,
  is_starred   INTEGER NOT NULL DEFAULT 0,
  is_archived  INTEGER NOT NULL DEFAULT 0,
  snooze_until INTEGER,
  send_after   INTEGER,
  send_state   TEXT
);
CREATE INDEX idx_messages_owner_received ON messages(owner, received_at DESC);
CREATE INDEX idx_messages_owner_thread   ON messages(owner, thread_id);
CREATE INDEX idx_messages_thread         ON messages(thread_id);
CREATE INDEX idx_messages_to_addr        ON messages(to_addr);
CREATE INDEX idx_messages_send_state     ON messages(send_state);

-- ── Attachments (ownership derived via parent message) ───────────────────────
CREATE TABLE attachments (
  id         TEXT PRIMARY KEY,
  message_id TEXT NOT NULL,
  filename   TEXT,
  mime_type  TEXT,
  r2_key     TEXT NOT NULL,
  size_bytes INTEGER,
  content_id TEXT
);
CREATE INDEX idx_attachments_message ON attachments(message_id);

-- ── Labels (per-user) ────────────────────────────────────────────────────────
CREATE TABLE labels (
  id         TEXT PRIMARY KEY,
  owner      TEXT NOT NULL,
  name       TEXT NOT NULL,
  color      TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_labels_owner ON labels(owner);

CREATE TABLE message_labels (
  message_id TEXT NOT NULL,
  label_id   TEXT NOT NULL,
  PRIMARY KEY (message_id, label_id)
);

-- ── Drafts (per-user) ────────────────────────────────────────────────────────
CREATE TABLE drafts (
  id             TEXT PRIMARY KEY,
  owner          TEXT NOT NULL,
  to_addr        TEXT NOT NULL,
  cc             TEXT,
  bcc            TEXT,
  subject        TEXT,
  text           TEXT,
  html           TEXT,
  in_reply_to_id TEXT,
  attachments    TEXT,               -- JSON UploadedAttachment[]
  updated_at     INTEGER NOT NULL
);
CREATE INDEX idx_drafts_owner_updated ON drafts(owner, updated_at DESC);

-- ── Aliases (address globally unique; owner = who generated it) ───────────────
CREATE TABLE aliases (
  address    TEXT PRIMARY KEY,       -- globally unique across all users (shared domains)
  owner      TEXT NOT NULL,
  name       TEXT,
  note       TEXT,
  disabled   INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_aliases_owner ON aliases(owner);

-- ── Rules / filters (per-user) ───────────────────────────────────────────────
CREATE TABLE rules (
  id           TEXT PRIMARY KEY,
  owner        TEXT NOT NULL,
  field        TEXT NOT NULL,        -- from | to | subject
  op           TEXT NOT NULL,        -- contains | equals | startswith | endswith
  value        TEXT NOT NULL,
  action       TEXT NOT NULL,        -- label | archive | read | trash
  action_value TEXT,                 -- label_id when action = 'label'
  enabled      INTEGER NOT NULL DEFAULT 1,
  created_at   INTEGER NOT NULL
);
CREATE INDEX idx_rules_owner_enabled ON rules(owner, enabled);

-- ── Push subscriptions (per-user) ────────────────────────────────────────────
CREATE TABLE push_subscriptions (
  endpoint   TEXT PRIMARY KEY,
  owner      TEXT NOT NULL,
  p256dh     TEXT,
  auth       TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_push_owner ON push_subscriptions(owner);

-- ── Settings (per-user key/value) ────────────────────────────────────────────
CREATE TABLE settings (
  owner TEXT NOT NULL,
  key   TEXT NOT NULL,
  value TEXT NOT NULL,
  PRIMARY KEY (owner, key)
);

-- ── Admin audit (super-admin access to other users' data) ────────────────────
CREATE TABLE admin_audit (
  id           TEXT PRIMARY KEY,
  admin_id     TEXT NOT NULL,
  target_owner TEXT,
  action       TEXT NOT NULL,
  created_at   INTEGER NOT NULL
);
CREATE INDEX idx_admin_audit_created ON admin_audit(created_at DESC);

-- ── Full-text search over messages (external-content FTS5 + sync triggers) ────
CREATE VIRTUAL TABLE messages_fts USING fts5(
  subject, from_addr, snippet, text,
  content='messages', content_rowid='rowid'
);

CREATE TRIGGER messages_ai AFTER INSERT ON messages BEGIN
  INSERT INTO messages_fts(rowid, subject, from_addr, snippet, text)
  VALUES (new.rowid, new.subject, new.from_addr, new.snippet, new.text);
END;
CREATE TRIGGER messages_ad AFTER DELETE ON messages BEGIN
  INSERT INTO messages_fts(messages_fts, rowid, subject, from_addr, snippet, text)
  VALUES ('delete', old.rowid, old.subject, old.from_addr, old.snippet, old.text);
END;
CREATE TRIGGER messages_au AFTER UPDATE ON messages BEGIN
  INSERT INTO messages_fts(messages_fts, rowid, subject, from_addr, snippet, text)
  VALUES ('delete', old.rowid, old.subject, old.from_addr, old.snippet, old.text);
  INSERT INTO messages_fts(rowid, subject, from_addr, snippet, text)
  VALUES (new.rowid, new.subject, new.from_addr, new.snippet, new.text);
END;
