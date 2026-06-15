-- Migration 023: LinkedIn publishing (OAuth 2.0 confidential client + post pipeline)
-- Adds per-user LinkedIn OAuth 2.0 token storage, the member's person URN, the
-- has_linkedin connect flag, and a transient state table for the authorize <-> callback
-- handshake. LinkedIn is a confidential client (the client secret lives in Worker config,
-- not here) with 60-day access tokens and 1-year refresh tokens — refresh_expires_at is an
-- ABSOLUTE bound that does not extend on refresh. Additive only (D1 has no ALTER COLUMN).

-- Encrypted OAuth 2.0 tokens (AES-256-GCM, base64-encoded; NULL until connected)
ALTER TABLE users ADD COLUMN linkedin_oauth2_access_enc TEXT;
ALTER TABLE users ADD COLUMN linkedin_oauth2_refresh_enc TEXT;

-- ISO 8601 access-token expiry (NULL until connected/refreshed)
ALTER TABLE users ADD COLUMN linkedin_oauth2_expires_at TEXT;

-- ISO 8601 ABSOLUTE refresh-token expiry (1 year; does not extend on refresh). Once past,
-- the connection needs a full reconnect.
ALTER TABLE users ADD COLUMN linkedin_refresh_expires_at TEXT;

-- Member person URN (urn:li:person:{sub}); plaintext identifier, resolved once at connect.
ALTER TABLE users ADD COLUMN linkedin_person_urn TEXT;

-- Connect intent flag (1 once connected; preserved on dead-token clear so the webapp can
-- derive needs_linkedin_reconnect).
ALTER TABLE users ADD COLUMN has_linkedin INTEGER DEFAULT 0;

-- Transient state for the LinkedIn OAuth 2.0 authorize <-> callback handshake.
-- Rows are single-use (deleted on callback) and swept after a short TTL (~10 min).
-- No code_verifier column: LinkedIn is a confidential client, so there is no PKCE.
CREATE TABLE IF NOT EXISTS linkedin_oauth_state (
  state TEXT PRIMARY KEY,
  chat_id TEXT,
  created_at TEXT
);
