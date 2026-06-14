# x-oauth2-token-lifecycle Specification

## Purpose
TBD - created by archiving change fix-x-oauth2-token-lifecycle. Update Purpose after archive.
## Requirements
### Requirement: Crash-safe token persistence
The system SHALL persist the rotated X OAuth 2.0 access token, refresh token, and access-token expiry in a **single atomic database write**. Because X invalidates the previous refresh token the instant a new one is issued, the new refresh token MUST NEVER be persisted independently of (or out of step with) its matching access token. A partial write that stores a new access token while leaving a stale refresh token (or vice versa) is prohibited.

#### Scenario: Successful refresh persists atomically
- **WHEN** a token refresh succeeds and returns a new access token, rotated refresh token, and expiry
- **THEN** all three values SHALL be written to the user's row in one atomic statement, such that no observer or subsequent request can read a new access token paired with the old refresh token

#### Scenario: Interruption cannot strand a stale refresh token
- **WHEN** the worker is interrupted during or immediately after a refresh persist
- **THEN** the stored state SHALL be either the complete previous token set or the complete new token set — never a mix that pairs the retired refresh token with the new access token

### Requirement: Proactive, expiry-aware token resolution
The system SHALL resolve a usable OAuth 2.0 bearer per request via `getValidXAccessToken(env, chatId)`. When the stored access token is at or within the refresh buffer (60s) of expiry, or its expiry is unknown, the system SHALL refresh it using the stored refresh token before returning. When no OAuth 2.0 token is stored, the function SHALL return null without attempting a refresh.

#### Scenario: Token still valid
- **WHEN** `getValidXAccessToken` is called and the stored access token is more than 60s from expiry
- **THEN** it SHALL return the decrypted access token without contacting the X token endpoint

#### Scenario: Token near expiry triggers refresh
- **WHEN** `getValidXAccessToken` is called and the stored access token is within 60s of expiry
- **THEN** it SHALL refresh via the stored refresh token, persist the rotated set atomically, and return the new access token

#### Scenario: No token stored
- **WHEN** `getValidXAccessToken` is called for a user with no `x_oauth2_access_enc`
- **THEN** it SHALL return null immediately and SHALL NOT attempt a refresh

### Requirement: Definitive vs. transient refresh-failure classification
The system SHALL classify a refresh-token request failure as either **definitive** (the refresh token is dead and unrecoverable) or **transient** (a temporary condition that may succeed on retry). A definitive failure is an HTTP 4xx response from the X token endpoint whose body indicates an invalid token — `error` of `invalid_grant` or `invalid_request`, and/or an `error_description` reporting the token was invalid (e.g. "Value passed for the token was invalid."). All other failures — network errors, 5xx, and 429 rate limits — SHALL be treated as transient. Only definitive failures SHALL be allowed to invalidate stored credentials; transient failures SHALL leave the stored tokens intact for a later retry.

#### Scenario: Invalid refresh token is definitive
- **WHEN** the X token endpoint returns HTTP 400 with `{"error":"invalid_grant"}` or `error_description` "Value passed for the token was invalid."
- **THEN** the failure SHALL be classified as definitive (dead token)

#### Scenario: Transient failure does not invalidate
- **WHEN** the refresh request fails with a network error, HTTP 5xx, or HTTP 429
- **THEN** the failure SHALL be classified as transient, the stored tokens SHALL be left unchanged, and `getValidXAccessToken` SHALL return null so the operation can be retried on the next tick

### Requirement: Single-flight refresh under concurrent rotation
Because multiple paths (cron, poller, webhook, webapp, 401-retry) may attempt to refresh concurrently, the system SHALL serialize refreshes per user so that at most one refresher rotates the token at a time, preventing a losing racer from wrongly tearing down a healthy connection. A refresher SHALL claim a per-user lock (atomic compare-and-swap) before refreshing; only the caller that claims it SHALL perform the refresh. Concurrent callers that do not claim the lock SHALL reuse the currently stored access token while it remains valid (within the pre-expiry buffer, before hard expiry) rather than performing their own refresh. A lock held longer than a stale threshold SHALL be reclaimable so a crashed holder cannot deadlock token resolution. The lock SHALL be best-effort: if claiming fails for any reason, the system SHALL fall back to refreshing directly rather than block authentication. As defense-in-depth for the rare stale-lock-reclaim case, before invalidating on a definitive failure the holder SHALL re-check that the stored refresh token is unchanged.

#### Scenario: Only one concurrent refresher rotates
- **WHEN** two requests both find the token needs refresh at the same time
- **THEN** exactly one SHALL claim the lock and perform the refresh, and the other SHALL reuse the currently valid access token without performing its own refresh

#### Scenario: Loser reuses the still-valid token
- **WHEN** a caller cannot claim the refresh lock and the stored access token has not yet hard-expired
- **THEN** it SHALL return that access token (the in-flight refresher will persist a rotated one for subsequent calls)

#### Scenario: Stale lock is reclaimable
- **WHEN** a refresh lock was claimed longer ago than the stale threshold (its holder crashed mid-refresh)
- **THEN** a new refresher SHALL be able to reclaim the lock and proceed, rather than being blocked indefinitely

#### Scenario: Best-effort fallback when the lock is unavailable
- **WHEN** claiming or releasing the lock errors (e.g. the lock column is missing pre-migration)
- **THEN** the system SHALL proceed to refresh directly and SHALL NOT block authentication

#### Scenario: Genuinely dead token confirmed under the lock
- **WHEN** the single lock-holding refresher receives a definitive dead-token response and the stored refresh token is unchanged
- **THEN** the system SHALL invalidate the connection (clear credentials and signal reconnect)

### Requirement: Dead-token detection clears credentials and signals reconnect
When a refresh-token failure is confirmed definitive and genuinely dead, the system SHALL clear the stored OAuth 2.0 credentials (`x_oauth2_access_enc`, `x_oauth2_refresh_enc`, `x_oauth2_expires_at` set to NULL) and `getValidXAccessToken` SHALL return null. Clearing the credentials SHALL stop the failing refresh loop from re-attempting every tick, and SHALL cause the account's `needs_x_reconnect` state to become true while preserving the user's `has_x` intent flag (it SHALL NOT be reset to 0).

#### Scenario: Dead token is cleared
- **WHEN** a genuinely dead refresh token is confirmed
- **THEN** the three OAuth 2.0 token columns SHALL be set to NULL and subsequent calls to `getValidXAccessToken` SHALL return null without contacting the token endpoint

#### Scenario: Reconnect state derives correctly after clearing
- **WHEN** the credentials have been cleared due to a dead token and `has_x` is 1
- **THEN** the settings API SHALL report `needs_x_reconnect: true` and `has_x` SHALL remain 1

### Requirement: One-time reconnect notification
When a connection is invalidated due to a dead token, the system SHALL notify the user exactly once via Telegram with a message explaining the X connection expired and an action to reconnect in the webapp (a `web_app` button to the webapp settings using `WEBAPP_URL`). The notification SHALL be sent fire-and-forget so that a delivery failure can never block or fail token resolution, and SHALL NOT be repeated on subsequent ticks for the same invalidation.

#### Scenario: User notified on first invalidation
- **WHEN** a dead token is confirmed and the credentials are cleared
- **THEN** the user SHALL receive a single Telegram message with a reconnect action linking to the webapp settings

#### Scenario: No repeat notifications
- **WHEN** later requests run after the credentials were already cleared
- **THEN** no additional reconnect notification SHALL be sent (the cleared-credentials state short-circuits before the notify path)

#### Scenario: Notification failure is non-fatal
- **WHEN** sending the reconnect notification fails
- **THEN** token resolution SHALL still return null normally and the failure SHALL be swallowed

### Requirement: XReconnectError surfaces as a reconnect prompt
Any user-facing X operation that fails because no usable OAuth 2.0 bearer is available (an `XReconnectError`) SHALL surface a clear "reconnect your X account" message with a path to reconnect, and SHALL NOT report the failure as a generic or misleading error (such as "No tweets were found"). Non-user-facing paths (cron, poller) MAY continue to skip silently.

#### Scenario: Identity re-analysis hits a missing bearer
- **WHEN** identity re-analysis fails because `xFetch` throws `XReconnectError`
- **THEN** the user SHALL see a reconnect-X message (not "No tweets were found"), with an action to reconnect

#### Scenario: Background path with no bearer
- **WHEN** the poller runs for a user with no valid bearer
- **THEN** it SHALL skip that user's cycle without surfacing a user-facing error

### Requirement: Live connection-status endpoint
The system SHALL provide an authenticated `GET /api/v1/x/oauth/status` endpoint that performs a live token-health resolution (invoking `getValidXAccessToken`, which refreshes and, on a confirmed dead token, runs the invalidation path) and returns the current connection health as `{ connected: boolean, needsReconnect: boolean }`. This SHALL reflect live token state rather than mere presence of a stored token row.

#### Scenario: Healthy connection reports connected
- **WHEN** the status endpoint is called and a valid bearer can be resolved
- **THEN** it SHALL return `{ connected: true, needsReconnect: false }`

#### Scenario: Dead connection reports needs-reconnect
- **WHEN** the status endpoint is called and the stored token is dead
- **THEN** the dead-token invalidation SHALL run and the endpoint SHALL return `{ connected: false, needsReconnect: true }`

#### Scenario: Never connected
- **WHEN** the status endpoint is called for a user who never connected X via OAuth 2.0
- **THEN** it SHALL return `{ connected: false, needsReconnect: false }`

### Requirement: X authenticates exclusively via OAuth 2.0
All X (Twitter) API calls — reads, writes, media upload, and video publishing — SHALL authenticate with the user's OAuth 2.0 user-context bearer token via the shared bearer fetch wrapper. The legacy OAuth 1.0a signing path and its stored 1.0a credentials SHALL NOT be used for any X API call, and no OAuth 1.0a signature SHALL be generated. "X connected" SHALL mean the user has a usable OAuth 2.0 token.

#### Scenario: Video publish uses OAuth 2.0 end-to-end
- **WHEN** a video is published to X (Video Studio)
- **THEN** both the chunked media upload and the tweet-creation step SHALL use the OAuth 2.0 bearer, so OAuth2-minted media is accepted (no "media IDs are invalid" mismatch)

#### Scenario: No OAuth 1.0a code path remains
- **WHEN** any X API call is made
- **THEN** it SHALL go through the OAuth 2.0 bearer fetch wrapper, and the system SHALL NOT generate an OAuth 1.0a `Authorization` header or read legacy `X_API_KEY`/`X_ACCESS_TOKEN` credentials

