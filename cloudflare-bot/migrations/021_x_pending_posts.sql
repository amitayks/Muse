-- Migration 021: Deferred X video post — schedule store (source of truth)
-- An X *video* media object needs ~10-60s after STATUS=succeeded before POST /2/tweets
-- will accept it (images are instant). We cannot wait inline (Cloudflare waitUntil ~30s
-- budget is consumed by the upload+poll). So when an X target includes a video we upload
-- the media inline (ids stay valid for hours) and enqueue a row here; an every-minute cron
-- trigger ("* * * * *") runs the deferred-post processor (core/x-pending.ts) on a fresh
-- budget, retrying the tweet-creation on "Your media IDs are invalid" / transient 5xx until
-- it works or the attempt budget runs out.
--
-- This table is the scheduling SOURCE OF TRUTH (one row per draft, keyed by draft_id for
-- idempotency). Additive only (D1 has no ALTER COLUMN).
-- See add-x-oauth2-media/design-deferred-video-post.md.

CREATE TABLE IF NOT EXISTS x_pending_posts (
  draft_id        TEXT PRIMARY KEY,                 -- 1:1 with a draft; idempotency anchor (INSERT OR REPLACE)
  chat_id         TEXT NOT NULL,                    -- owner; hydrateEnv + ownership-scoped writes
  payload         TEXT NOT NULL,                    -- JSON PendingXPayload (resolved media ids + content + options + IG results)
  attempts        INTEGER NOT NULL DEFAULT 0,
  max_attempts    INTEGER NOT NULL DEFAULT 6,
  status          TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'done' | 'failed'
  last_error      TEXT,
  next_attempt_at TEXT NOT NULL,                    -- SQLite datetime; first attempt ~45s out
  created_at      TEXT DEFAULT (datetime('now')),
  updated_at      TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_x_pending_due  ON x_pending_posts(status, next_attempt_at);
CREATE INDEX IF NOT EXISTS idx_x_pending_chat ON x_pending_posts(chat_id);
