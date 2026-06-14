-- Migration 022: X OAuth 2.0 single-flight refresh lock
-- Adds a per-user compare-and-swap lock column so that only ONE refresher rotates the
-- OAuth 2.0 token at a time. X retires the previous refresh token the instant it issues a
-- new one, so concurrent refreshers could otherwise race — a loser seeing X reject the
-- just-rotated token and wrongly tearing down a healthy connection. The lock serializes
-- refreshes; a claim older than ~30s is treated as stale (crashed holder) and reclaimable.
-- Additive only (D1 has no ALTER COLUMN).

-- ISO 8601 claim timestamp; NULL when the lock is free.
ALTER TABLE users ADD COLUMN x_oauth2_refresh_lock TEXT;
