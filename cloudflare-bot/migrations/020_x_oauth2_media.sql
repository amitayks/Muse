-- Migration 020: X OAuth 2.0 (PKCE public client) for media-bearing posts
-- Adds encrypted storage for the per-user OAuth 2.0 access + refresh tokens and
-- the access token's expiry, plus a transient table for the in-flight
-- authorize <-> callback PKCE handshake. Additive only (D1 has no ALTER COLUMN).

-- Encrypted OAuth 2.0 user-context access token (AES-256-GCM, base64-encoded)
ALTER TABLE users ADD COLUMN x_oauth2_access_enc TEXT;

-- Encrypted OAuth 2.0 refresh token (rotated on every refresh; persist the new one)
ALTER TABLE users ADD COLUMN x_oauth2_refresh_enc TEXT;

-- ISO 8601 expiry of the stored OAuth 2.0 access token (NULL until connected)
ALTER TABLE users ADD COLUMN x_oauth2_expires_at TEXT;

-- Transient PKCE state for the authorize -> callback handshake.
-- Rows are single-use (deleted on callback) and swept after a short TTL (~10 min).
CREATE TABLE IF NOT EXISTS x_oauth_state (
  state TEXT PRIMARY KEY,
  chat_id TEXT,
  code_verifier TEXT,
  created_at TEXT
);
