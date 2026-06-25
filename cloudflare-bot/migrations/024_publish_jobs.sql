-- Migration 024: Durable publish-job queue — one in-flight publish per draft.
-- Generalizes the x_pending_posts pattern: a publish (multi-platform, possibly multi-video) can
-- exceed one Worker budget (~30s). Instead of running publishDraft inline we enqueue a row here and
-- the every-minute cron processor (core/publish-jobs.ts) runs publishDraft on a fresh budget,
-- persisting partial `progress` (already-uploaded media keyed by platform + tweet index + media index)
-- so a heavy publish completes across ticks without re-uploading or double-posting.
--
-- This table is the scheduling SOURCE OF TRUTH (one row per draft, keyed by draft_id for
-- idempotency). Additive only (D1 has no ALTER COLUMN).
-- See openspec/changes/durable-publish-queue/design.md.

CREATE TABLE IF NOT EXISTS publish_jobs (
  draft_id        TEXT PRIMARY KEY,                 -- 1:1 with a draft; idempotency anchor (UPSERT)
  chat_id         TEXT NOT NULL,                    -- owner; hydrateEnv + ownership-scoped writes
  lang            TEXT,                             -- user language for the publish notification
  prior_status    TEXT,                             -- status to restore on failure ('approved' | 'scheduled')
  state           TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'processing' | 'done' | 'failed'
  progress        TEXT,                             -- JSON PublishProgress (completed uploads per platform)
  attempts        INTEGER NOT NULL DEFAULT 0,
  max_attempts    INTEGER NOT NULL DEFAULT 6,
  last_error      TEXT,
  next_attempt_at TEXT NOT NULL,                    -- SQLite datetime; first attempt is due immediately
  created_at      TEXT DEFAULT (datetime('now')),
  updated_at      TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_publish_jobs_due  ON publish_jobs(state, next_attempt_at);
CREATE INDEX IF NOT EXISTS idx_publish_jobs_chat ON publish_jobs(chat_id);
