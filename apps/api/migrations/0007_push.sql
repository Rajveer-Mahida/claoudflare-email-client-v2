-- Phase 7: Web Push subscriptions for new-mail notifications.

CREATE TABLE IF NOT EXISTS push_subscriptions (
  endpoint   TEXT PRIMARY KEY,
  p256dh     TEXT,
  auth       TEXT,
  created_at INTEGER NOT NULL
);
