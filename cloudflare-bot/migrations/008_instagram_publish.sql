-- Migration 008: Instagram post integration
-- Adds multi-platform publish targets, results tracking, profile image storage,
-- and fixes the instagram columns gap on users table.

-- Drafts: publish targets, results, and video flag
ALTER TABLE drafts ADD COLUMN publish_targets TEXT DEFAULT '{"x":true}';
ALTER TABLE drafts ADD COLUMN publish_results TEXT DEFAULT '{}';
ALTER TABLE drafts ADD COLUMN has_video INTEGER DEFAULT 0;

-- Users: default publish targets and own profile data for tweet card rendering
ALTER TABLE users ADD COLUMN default_publish_targets TEXT DEFAULT '{"x":true}';
ALTER TABLE users ADD COLUMN own_profile_image_url TEXT;
ALTER TABLE users ADD COLUMN own_username_x TEXT;
ALTER TABLE users ADD COLUMN own_display_name_x TEXT;

-- Users: fix schema gap — instagram columns exist in code but not in schema
ALTER TABLE users ADD COLUMN instagram_token_enc TEXT;
ALTER TABLE users ADD COLUMN instagram_account_id_enc TEXT;
ALTER TABLE users ADD COLUMN has_instagram INTEGER DEFAULT 0;

-- Twitter tweets: author profile data for tweet card rendering
ALTER TABLE twitter_tweets ADD COLUMN author_profile_image_url TEXT;
ALTER TABLE twitter_tweets ADD COLUMN author_display_name TEXT;

-- Twitter accounts: profile image for tweet card rendering
ALTER TABLE twitter_accounts ADD COLUMN profile_image_url TEXT;

-- Persona cache: profile image for tweet card rendering
ALTER TABLE persona_cache ADD COLUMN profile_image_url TEXT;
