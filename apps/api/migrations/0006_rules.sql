-- Phase 4: filters / rules. Applied to inbound mail (and optionally existing).

CREATE TABLE IF NOT EXISTS rules (
  id           TEXT PRIMARY KEY,
  field        TEXT NOT NULL,            -- from | to | subject
  op           TEXT NOT NULL,            -- contains | equals | startswith | endswith
  value        TEXT NOT NULL,
  action       TEXT NOT NULL,            -- label | archive | read | trash
  action_value TEXT,                     -- label_id when action = 'label'
  enabled      INTEGER NOT NULL DEFAULT 1,
  created_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rules_enabled ON rules(enabled);
