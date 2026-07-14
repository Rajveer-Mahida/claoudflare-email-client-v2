-- Baseline schema for fresh databases (one-click deploys).
--
-- The original 0001-0003 migrations lived in the legacy project and were never
-- checked in here; this file recreates exactly what they left behind (dumped from
-- the live D1's sqlite_master), *minus* what later migrations add themselves:
-- 0004 ALTERs cc/bcc onto messages and creates drafts; 0005/0006/0007 create
-- aliases/rules/push_subscriptions.
--
-- Everything is IF NOT EXISTS so this is a no-op on databases that already have
-- the legacy schema (it sorts before 0004 but is *applied* after it there).

CREATE TABLE IF NOT EXISTS messages (
  id            TEXT PRIMARY KEY,
  message_id    TEXT,
  in_reply_to   TEXT,
  thread_id     TEXT,
  direction     TEXT NOT NULL DEFAULT 'in',
  from_addr     TEXT NOT NULL,
  from_name     TEXT,
  to_addr       TEXT NOT NULL,
  subject       TEXT,
  snippet       TEXT,
  html          TEXT,
  text          TEXT,
  raw_key       TEXT NOT NULL DEFAULT '',
  size_bytes    INTEGER,
  received_at   INTEGER NOT NULL,
  is_read       INTEGER NOT NULL DEFAULT 0,
  is_deleted    INTEGER NOT NULL DEFAULT 0,
  is_starred    INTEGER NOT NULL DEFAULT 0,
  is_archived   INTEGER NOT NULL DEFAULT 0,
  snooze_until  INTEGER,
  send_after    INTEGER,
  send_state    TEXT
);

CREATE INDEX IF NOT EXISTS idx_messages_received ON messages(received_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_thread   ON messages(thread_id);
CREATE INDEX IF NOT EXISTS idx_messages_to       ON messages(to_addr);
CREATE INDEX IF NOT EXISTS idx_messages_deleted  ON messages(is_deleted);
CREATE INDEX IF NOT EXISTS idx_msg_starred  ON messages(is_starred)  WHERE is_starred = 1;
CREATE INDEX IF NOT EXISTS idx_msg_archived ON messages(is_archived) WHERE is_archived = 1;
CREATE INDEX IF NOT EXISTS idx_msg_snooze   ON messages(snooze_until);
CREATE INDEX IF NOT EXISTS idx_msg_pending  ON messages(send_state, send_after);

CREATE TABLE IF NOT EXISTS attachments (
  id         TEXT PRIMARY KEY,
  message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  filename   TEXT,
  mime_type  TEXT,
  r2_key     TEXT NOT NULL,
  size_bytes INTEGER,
  content_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_attachments_message ON attachments(message_id);
CREATE INDEX IF NOT EXISTS idx_att_cid ON attachments(message_id, content_id);

CREATE TABLE IF NOT EXISTS labels (
  id         TEXT    PRIMARY KEY,
  name       TEXT    NOT NULL UNIQUE,
  color      TEXT    NOT NULL DEFAULT '#888888',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS message_labels (
  message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  label_id   TEXT NOT NULL REFERENCES labels(id)   ON DELETE CASCADE,
  PRIMARY KEY (message_id, label_id)
);
CREATE INDEX IF NOT EXISTS idx_ml_label ON message_labels(label_id);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Full-text search over messages (external-content FTS5 + sync triggers).
CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
  subject,
  from_addr,
  snippet,
  text,
  content='messages',
  content_rowid='rowid'
);

CREATE TRIGGER IF NOT EXISTS messages_ai AFTER INSERT ON messages BEGIN
  INSERT INTO messages_fts(rowid, subject, from_addr, snippet, text)
  VALUES (new.rowid, new.subject, new.from_addr, new.snippet, new.text);
END;

CREATE TRIGGER IF NOT EXISTS messages_ad AFTER DELETE ON messages BEGIN
  INSERT INTO messages_fts(messages_fts, rowid, subject, from_addr, snippet, text)
  VALUES('delete', old.rowid, old.subject, old.from_addr, old.snippet, old.text);
END;

CREATE TRIGGER IF NOT EXISTS messages_au AFTER UPDATE ON messages BEGIN
  INSERT INTO messages_fts(messages_fts, rowid, subject, from_addr, snippet, text)
  VALUES('delete', old.rowid, old.subject, old.from_addr, old.snippet, old.text);
  INSERT INTO messages_fts(rowid, subject, from_addr, snippet, text)
  VALUES (new.rowid, new.subject, new.from_addr, new.snippet, new.text);
END;
