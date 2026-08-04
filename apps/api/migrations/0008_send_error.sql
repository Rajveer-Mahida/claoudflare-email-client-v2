-- Last provider error for a pending/failed outbound send, so the UI can show
-- the real reason instead of a generic "domain rejected" banner.
ALTER TABLE messages ADD COLUMN send_error TEXT;
