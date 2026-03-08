-- Migration 009: Sync production schema
-- Production was set up manually (schema.sql + ad-hoc ALTERs), never through
-- wrangler d1 migrations apply. This migration adds all 14 columns that exist
-- in schema.sql / code but are missing from the production database.
-- Before running: backfill d1_migrations with rows for 001-008.

-- ── users ──────────────────────────────────────────────────────────
ALTER TABLE users ADD COLUMN onboarding_message_id INTEGER;
ALTER TABLE users ADD COLUMN default_publish_targets TEXT DEFAULT '{"x":true}';
ALTER TABLE users ADD COLUMN own_profile_image_url TEXT;
ALTER TABLE users ADD COLUMN own_username_x TEXT;
ALTER TABLE users ADD COLUMN own_display_name_x TEXT;

-- ── drafts ─────────────────────────────────────────────────────────
ALTER TABLE drafts ADD COLUMN publish_targets TEXT DEFAULT '{"x":true}';
ALTER TABLE drafts ADD COLUMN publish_results TEXT DEFAULT '{}';
ALTER TABLE drafts ADD COLUMN has_video INTEGER DEFAULT 0;

-- ── twitter_accounts ───────────────────────────────────────────────
ALTER TABLE twitter_accounts ADD COLUMN profile_image_url TEXT;
ALTER TABLE twitter_accounts ADD COLUMN next_poll_at TEXT;
ALTER TABLE twitter_accounts ADD COLUMN consecutive_empty_polls INTEGER DEFAULT 0;

-- ── twitter_tweets ─────────────────────────────────────────────────
ALTER TABLE twitter_tweets ADD COLUMN author_profile_image_url TEXT;
ALTER TABLE twitter_tweets ADD COLUMN author_display_name TEXT;

-- ── persona_cache ──────────────────────────────────────────────────
ALTER TABLE persona_cache ADD COLUMN profile_image_url TEXT;
