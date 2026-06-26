-- Phase 2: managed alias registry.
-- Aliases are auto-registered on first inbound and can be named/noted/disabled.

CREATE TABLE IF NOT EXISTS aliases (
  address    TEXT PRIMARY KEY,
  name       TEXT,
  note       TEXT,
  disabled   INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
