-- Migration 026: Add media_uploads.started_at — when a warm row entered 'processing'.
-- Lets the webapp's per-media progress ring distinguish a freshly-claimed 'processing' row (animated
-- indeterminate spinner) and bound how long a stuck 'processing' lease is shown as in-flight. Set to
-- datetime('now') by claimDueWarms when a row transitions to 'processing'.
--
-- Additive only (D1 has no ALTER COLUMN). Re-running this is harmless: the column-add fails with
-- "duplicate column name" once the column exists, which the migrate route guards with a PRAGMA check.

ALTER TABLE media_uploads ADD COLUMN started_at TEXT;
