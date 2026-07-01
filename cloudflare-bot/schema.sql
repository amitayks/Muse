-- Content Bot Database Schema

-- Drafts table
CREATE TABLE IF NOT EXISTS drafts (
  id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL,
  pr_number INTEGER NOT NULL,
  pr_title TEXT NOT NULL,
  commit_sha TEXT NOT NULL,
  source TEXT DEFAULT 'auto',
  status TEXT DEFAULT 'draft',
  content TEXT NOT NULL,
  image_url TEXT,
  scheduled_at TEXT,
  original_tweet_id TEXT,
  original_tweet_url TEXT,
  publish_targets TEXT DEFAULT '{"x":true}',
  publish_results TEXT DEFAULT '{}',
  has_video INTEGER DEFAULT 0,
  language TEXT, -- content language ('en' | 'he') chosen at creation; NULL for legacy drafts
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Migration for existing databases:
-- ALTER TABLE drafts ADD COLUMN chat_id TEXT NOT NULL DEFAULT '';
-- ALTER TABLE drafts ADD COLUMN source TEXT DEFAULT 'auto';

-- Users table (identity, encrypted keys, settings, UI state)
CREATE TABLE IF NOT EXISTS users (
  chat_id TEXT PRIMARY KEY,
  username TEXT,
  display_name TEXT,
  status TEXT DEFAULT 'onboarding',
  onboarding_step TEXT,
  -- Encrypted API keys (AES-256-GCM, base64-encoded)
  gemini_key_enc TEXT,
  x_api_key_enc TEXT,
  x_api_secret_enc TEXT,
  x_access_token_enc TEXT,
  x_access_secret_enc TEXT,
  github_token_enc TEXT,
  heygen_api_key_enc TEXT,
  instagram_token_enc TEXT,
  instagram_account_id_enc TEXT,
  instagram_app_secret_enc TEXT,
  -- X OAuth 2.0 (PKCE public client) user-context tokens
  x_oauth2_access_enc TEXT,
  x_oauth2_refresh_enc TEXT,
  claude_key_enc TEXT,
  -- LinkedIn OAuth 2.0 (confidential client) user-context tokens + identity
  linkedin_oauth2_access_enc TEXT,
  linkedin_oauth2_refresh_enc TEXT,
  -- ISO 8601 access-token expiry; ABSOLUTE refresh-token expiry (1yr, does not extend); person URN
  linkedin_oauth2_expires_at TEXT,
  linkedin_refresh_expires_at TEXT,
  linkedin_person_urn TEXT,
  -- Feature flags
  has_gemini INTEGER DEFAULT 0,
  has_x INTEGER DEFAULT 0,
  has_github INTEGER DEFAULT 0,
  has_heygen INTEGER DEFAULT 0,
  has_instagram INTEGER DEFAULT 0,
  has_claude INTEGER DEFAULT 0,
  has_linkedin INTEGER DEFAULT 0,
  -- UI state (merged from former chat_state)
  message_id INTEGER,
  onboarding_message_id INTEGER,
  current_view TEXT DEFAULT 'home',
  context TEXT,
  -- Settings
  ai_provider TEXT DEFAULT 'gemini',
  timezone TEXT DEFAULT 'UTC',
  page_size INTEGER DEFAULT 5,
  -- Identity language notification tracking (comma-separated lang codes)
  identity_lang_notified TEXT DEFAULT '',
  -- Identity analysis depth: how many tweets to analyze (100, 200, or 400)
  identity_tweet_count INTEGER DEFAULT 200,
  video_settings TEXT,
  -- Multi-platform publish defaults
  default_publish_targets TEXT DEFAULT '{"x":true}',
  -- Instagram long-lived token expiry (ISO 8601; NULL until exchanged/refreshed)
  instagram_token_expires_at TEXT,
  -- X OAuth 2.0 access token expiry (ISO 8601; NULL until connected/refreshed)
  x_oauth2_expires_at TEXT,
  -- X OAuth 2.0 single-flight refresh lock (ISO 8601 claim time; NULL when free; stale after 30s)
  x_oauth2_refresh_lock TEXT,
  -- Repo defaults (for newly added repos)
  repo_auto_overview INTEGER DEFAULT 0,
  repo_default_watch_pushes INTEGER DEFAULT 1,
  -- Own X profile data (for tweet card rendering)
  own_profile_image_url TEXT,
  own_username_x TEXT,
  own_display_name_x TEXT,
  -- Rate limiting
  daily_generates INTEGER DEFAULT 0,
  daily_reposts INTEGER DEFAULT 0,
  last_reset_date TEXT,
  consecutive_failures INTEGER DEFAULT 0,
  -- Timestamps
  created_at TEXT DEFAULT (datetime('now')),
  last_active_at TEXT,
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Transient PKCE state for the X OAuth 2.0 authorize <-> callback handshake.
-- Rows are single-use (deleted on callback) and swept after a short TTL (~10 min).
CREATE TABLE IF NOT EXISTS x_oauth_state (
  state TEXT PRIMARY KEY,
  chat_id TEXT,
  code_verifier TEXT,
  created_at TEXT
);

-- Transient state for the LinkedIn OAuth 2.0 authorize <-> callback handshake.
-- Single-use (deleted on callback), swept after a short TTL (~10 min). No code_verifier:
-- LinkedIn is a confidential client (client secret in Worker config), so there is no PKCE.
CREATE TABLE IF NOT EXISTS linkedin_oauth_state (
  state TEXT PRIMARY KEY,
  chat_id TEXT,
  created_at TEXT
);

-- Published posts archive
CREATE TABLE IF NOT EXISTS published (
  id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL,
  draft_id TEXT NOT NULL,
  pr_number INTEGER NOT NULL,
  tweet_ids TEXT,
  tweet_url TEXT,
  image_url TEXT,
  instagram_post_id TEXT,
  instagram_url TEXT,
  published_at TEXT DEFAULT (datetime('now'))
);

-- Deferred X video post — schedule store (source of truth). An X video media object needs
-- ~10-60s after STATUS=succeeded before POST /2/tweets accepts it. Media is uploaded inline
-- (ids valid for hours); the tweet-creation step is deferred — a row is enqueued here and the
-- every-minute cron processor (core/x-pending.ts) retries postThread/postQuoteTweet on
-- "Your media IDs are invalid" / transient 5xx until it works or the attempt budget runs out.
-- One row per draft (idempotency). (migration 021)
CREATE TABLE IF NOT EXISTS x_pending_posts (
  draft_id        TEXT PRIMARY KEY,
  chat_id         TEXT NOT NULL,
  payload         TEXT NOT NULL,
  attempts        INTEGER NOT NULL DEFAULT 0,
  max_attempts    INTEGER NOT NULL DEFAULT 6,
  status          TEXT NOT NULL DEFAULT 'pending',
  last_error      TEXT,
  next_attempt_at TEXT NOT NULL,
  created_at      TEXT DEFAULT (datetime('now')),
  updated_at      TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_x_pending_due  ON x_pending_posts(status, next_attempt_at);
CREATE INDEX IF NOT EXISTS idx_x_pending_chat ON x_pending_posts(chat_id);

-- Durable publish-job queue — one in-flight publish per draft (generalizes x_pending_posts). A
-- publish (multi-platform, possibly multi-video) can exceed one Worker budget; instead of running
-- publishDraft inline we enqueue a row here and the every-minute cron processor (core/publish-jobs.ts)
-- runs publishDraft on a fresh budget, persisting partial `progress` (already-uploaded media keyed by
-- platform + tweet index + media index) so a heavy publish completes across ticks without re-uploading
-- or double-posting. One row per draft (idempotency). (migration 024)
CREATE TABLE IF NOT EXISTS publish_jobs (
  draft_id        TEXT PRIMARY KEY,
  chat_id         TEXT NOT NULL,
  lang            TEXT,
  prior_status    TEXT,
  state           TEXT NOT NULL DEFAULT 'pending',
  progress        TEXT,
  attempts        INTEGER NOT NULL DEFAULT 0,
  max_attempts    INTEGER NOT NULL DEFAULT 6,
  last_error      TEXT,
  next_attempt_at TEXT NOT NULL,
  created_at      TEXT DEFAULT (datetime('now')),
  updated_at      TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_publish_jobs_due  ON publish_jobs(state, next_attempt_at);
CREATE INDEX IF NOT EXISTS idx_publish_jobs_chat ON publish_jobs(chat_id);

-- Pre-warmed media uploads — one row per (draft, media, platform) holding a reusable platform media
-- handle (X media_id / Instagram container id / LinkedIn asset URN) uploaded ahead of publish so the
-- publish path skips the slow upload and posts instantly. The scheduling columns (status, attempts,
-- next_attempt_at) let this table double as the warm queue, mirroring publish_jobs / x_pending_posts.
-- caption_hash is Instagram-only (the container bakes in the caption); expires_at is conservative
-- (X/IG ≈ warm time + 23h; LinkedIn null/far). Warming is best-effort — a missing/expired handle just
-- falls back to inline upload at publish. (migration 025)
CREATE TABLE IF NOT EXISTS media_uploads (
  draft_id        TEXT NOT NULL,
  chat_id         TEXT NOT NULL,
  media_key       TEXT NOT NULL,
  platform        TEXT NOT NULL,
  media_kind      TEXT NOT NULL,
  handle          TEXT,
  caption_hash    TEXT,
  status          TEXT DEFAULT 'pending',
  expires_at      TEXT,
  attempts        INTEGER DEFAULT 0,
  max_attempts    INTEGER DEFAULT 6,
  last_error      TEXT,
  next_attempt_at TEXT NOT NULL,
  started_at      TEXT,                            -- when the row last entered 'processing' (migration 026)
  created_at      TEXT DEFAULT (datetime('now')),
  updated_at      TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (draft_id, media_key, platform)
);
CREATE INDEX IF NOT EXISTS idx_media_uploads_due   ON media_uploads(status, next_attempt_at);
CREATE INDEX IF NOT EXISTS idx_media_uploads_draft ON media_uploads(draft_id);
CREATE INDEX IF NOT EXISTS idx_media_uploads_chat  ON media_uploads(chat_id);

-- Watched repos for auto-detection
CREATE TABLE IF NOT EXISTS repos (
  id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL,
  owner TEXT NOT NULL,
  repo TEXT NOT NULL,
  is_watching INTEGER DEFAULT 1,
  config TEXT NOT NULL,
  webhook_id TEXT,
  webhook_secret TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(chat_id, owner, repo)
);

-- Repo overviews — persistent project context for content generation
CREATE TABLE IF NOT EXISTS repo_overviews (
  id TEXT PRIMARY KEY,
  repo_id TEXT NOT NULL UNIQUE,
  summary TEXT,
  tech_stack TEXT,
  key_features TEXT,
  target_audience TEXT,
  brand_voice TEXT,
  visual_theme TEXT,
  recent_changes TEXT,
  version INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Video drafts — video generation lifecycle
CREATE TABLE IF NOT EXISTS video_drafts (
  id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL,
  repo_id TEXT,
  status TEXT DEFAULT 'draft',
  script TEXT,
  caption TEXT,
  twitter_caption TEXT,
  title TEXT,
  config TEXT,
  heygen_video_id TEXT,
  video_url TEXT,
  reference_sha TEXT,
  scheduled_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Video published records
CREATE TABLE IF NOT EXISTS video_published (
  id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL,
  video_draft_id TEXT NOT NULL,
  repo_id TEXT,
  twitter_url TEXT,
  instagram_url TEXT,
  caption TEXT,
  published_at TEXT DEFAULT (datetime('now'))
);

-- Video configuration presets
CREATE TABLE IF NOT EXISTS video_presets (
  id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL,
  name TEXT NOT NULL,
  config TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

-- ==================== TWITTER REPOST SYSTEM ====================

-- Followed Twitter/X accounts
CREATE TABLE IF NOT EXISTS twitter_accounts (
  id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL,
  username TEXT NOT NULL,
  user_id TEXT,
  display_name TEXT,
  is_watching INTEGER DEFAULT 1,
  last_tweet_id TEXT,
  config TEXT NOT NULL,
  thread_buffer TEXT,
  profile_image_url TEXT,
  next_poll_at TEXT,
  consecutive_empty_polls INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(chat_id, username)
);

-- AI-generated persona overviews for followed accounts
CREATE TABLE IF NOT EXISTS twitter_account_overviews (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL UNIQUE,
  persona TEXT,
  topics TEXT,
  communication_style TEXT,
  notable_context TEXT,
  recent_themes TEXT,
  version INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- All fetched tweets for persona context and batch tracking
CREATE TABLE IF NOT EXISTS twitter_tweets (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  chat_id TEXT NOT NULL,
  conversation_id TEXT,
  thread_position INTEGER DEFAULT 0,
  is_thread INTEGER DEFAULT 0,
  text TEXT NOT NULL,
  author_username TEXT NOT NULL,
  metrics TEXT,
  tweet_url TEXT,
  tweeted_at TEXT,
  relevance_score INTEGER,
  relevance_reason TEXT,
  status TEXT DEFAULT 'pending',
  draft_id TEXT,
  batch_message_id INTEGER,
  media_url TEXT DEFAULT NULL,
  author_profile_image_url TEXT,
  author_display_name TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Migration for existing databases:
-- ALTER TABLE drafts ADD COLUMN original_tweet_id TEXT;
-- ALTER TABLE drafts ADD COLUMN original_tweet_url TEXT;

-- Persona cache for non-followed accounts
CREATE TABLE IF NOT EXISTS persona_cache (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  user_id TEXT,
  display_name TEXT,
  bio TEXT,
  persona TEXT,
  topics TEXT,
  profile_image_url TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- ==================== PROMPT STORAGE ====================

-- Admin-managed default system prompts (per type × language)
CREATE TABLE IF NOT EXISTS default_prompts (
  prompt_type TEXT NOT NULL,
  language TEXT NOT NULL,
  content TEXT NOT NULL,
  version INTEGER DEFAULT 1,
  updated_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (prompt_type, language)
);

-- Per-user prompt customizations (sparse — only if user edited)
CREATE TABLE IF NOT EXISTS user_prompts (
  chat_id TEXT NOT NULL,
  prompt_type TEXT NOT NULL,
  language TEXT NOT NULL,
  content TEXT NOT NULL,
  based_on_version INTEGER DEFAULT 1,
  updated_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (chat_id, prompt_type, language),
  FOREIGN KEY (chat_id) REFERENCES users(chat_id)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
CREATE INDEX IF NOT EXISTS idx_drafts_status ON drafts(status);
CREATE INDEX IF NOT EXISTS idx_drafts_pr ON drafts(pr_number);
CREATE INDEX IF NOT EXISTS idx_published_pr ON published(pr_number);
CREATE INDEX IF NOT EXISTS idx_repos_watching ON repos(is_watching);
CREATE INDEX IF NOT EXISTS idx_video_drafts_status ON video_drafts(status);
CREATE INDEX IF NOT EXISTS idx_video_drafts_heygen ON video_drafts(heygen_video_id);
CREATE INDEX IF NOT EXISTS idx_video_drafts_chat ON video_drafts(chat_id);
CREATE INDEX IF NOT EXISTS idx_video_published_chat ON video_published(chat_id);
CREATE INDEX IF NOT EXISTS idx_video_presets_chat ON video_presets(chat_id);
CREATE INDEX IF NOT EXISTS idx_twitter_accounts_watching ON twitter_accounts(is_watching);
CREATE INDEX IF NOT EXISTS idx_twitter_accounts_chat ON twitter_accounts(chat_id);
CREATE INDEX IF NOT EXISTS idx_twitter_tweets_account ON twitter_tweets(account_id);
CREATE INDEX IF NOT EXISTS idx_twitter_tweets_status ON twitter_tweets(status);
CREATE INDEX IF NOT EXISTS idx_twitter_tweets_conversation ON twitter_tweets(conversation_id);
CREATE INDEX IF NOT EXISTS idx_twitter_tweets_batch ON twitter_tweets(batch_message_id);
CREATE INDEX IF NOT EXISTS idx_drafts_source ON drafts(source);
