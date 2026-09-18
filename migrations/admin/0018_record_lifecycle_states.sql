-- Preserve destructive actions as auditable lifecycle state changes.
ALTER TABLE customers ADD COLUMN archived_at TEXT;
