-- Migration 017: Instagram token lifecycle (exchange + auto-refresh)
-- Adds storage for the Instagram App Secret (needed once for the short-lived ->
-- long-lived token exchange) and the long-lived token's expiry timestamp so the
-- cron can refresh it before it lapses. Additive only (D1 has no ALTER COLUMN).

-- Encrypted Instagram App Secret (per-user; used for ig_exchange_token at connect time)
ALTER TABLE users ADD COLUMN instagram_app_secret_enc TEXT;

-- ISO 8601 expiry of the stored long-lived Instagram token (NULL until exchanged/refreshed)
ALTER TABLE users ADD COLUMN instagram_token_expires_at TEXT;
