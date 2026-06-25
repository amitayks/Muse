-- Migration 025: Pre-warmed media uploads — one row per (draft, media, platform).
-- Records a reusable platform media handle (X media_id / Instagram container id / LinkedIn asset URN)
-- uploaded ahead of publish so the publish path skips the slow per-platform upload and posts instantly.
-- The scheduling columns (status, attempts, next_attempt_at) let this table double as the warm queue,
-- mirroring publish_jobs / x_pending_posts — no separate queue.
--
-- caption_hash is Instagram-only (the container bakes in the caption, so a caption edit invalidates it);
-- expires_at is set conservatively (X/IG ≈ warm time + 23h within the 24h validity window; LinkedIn
-- null/far since the asset URN is durable). Warming is BEST-EFFORT: a missing/expired/failed handle
-- simply falls back to inline upload at publish, so this table is never a correctness dependency.
--
-- One row per (draft_id, media_key, platform) (UPSERT for idempotency). Additive only (D1 has no
-- ALTER COLUMN). See openspec/changes/prewarm-media-uploads/design.md.

CREATE TABLE IF NOT EXISTS media_uploads (
  draft_id        TEXT NOT NULL,                    -- owning draft
  chat_id         TEXT NOT NULL,                    -- owner; hydrateEnv + ownership-scoped writes
  media_key       TEXT NOT NULL,                    -- R2 key of the source media — "which media"
  platform        TEXT NOT NULL,                    -- 'x' | 'instagram_post' | 'instagram_reel' | 'instagram_story' | 'linkedin'
  media_kind      TEXT NOT NULL,                    -- 'photo' | 'video'
  handle          TEXT,                             -- platform media_id / container id / asset URN; null until ready
  caption_hash    TEXT,                             -- Instagram only (caption baked into the container); null otherwise
  status          TEXT DEFAULT 'pending',           -- 'pending' | 'processing' | 'ready' | 'failed' | 'expired'
  expires_at      TEXT,                             -- X/IG ≈ warm time + 23h; LinkedIn null/far
  attempts        INTEGER DEFAULT 0,
  max_attempts    INTEGER DEFAULT 6,
  last_error      TEXT,
  next_attempt_at TEXT NOT NULL,                    -- SQLite datetime; first attempt is due immediately
  created_at      TEXT DEFAULT (datetime('now')),
  updated_at      TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (draft_id, media_key, platform)
);

CREATE INDEX IF NOT EXISTS idx_media_uploads_due   ON media_uploads(status, next_attempt_at);
CREATE INDEX IF NOT EXISTS idx_media_uploads_draft ON media_uploads(draft_id);
CREATE INDEX IF NOT EXISTS idx_media_uploads_chat  ON media_uploads(chat_id);
