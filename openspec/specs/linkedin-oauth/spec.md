# linkedin-oauth Specification

## Purpose
TBD - created by archiving change add-linkedin-publishing. Update Purpose after archive.
## Requirements
### Requirement: LinkedIn OAuth connect start endpoint
The system SHALL provide an authenticated `GET /api/v1/linkedin/oauth/start` that mints a random CSRF `state`, persists a transient `{ state → chat_id }` row, and returns `{ authorizeUrl }` pointing at `https://www.linkedin.com/oauth/v2/authorization` with `response_type=code`, `client_id=env.LINKEDIN_CLIENT_ID`, `redirect_uri=env.LINKEDIN_REDIRECT_URI`, `scope="openid profile w_member_social"`, and the `state`. LinkedIn is a confidential client, so NO PKCE `code_challenge` is included.

#### Scenario: Start returns an authorize URL
- **WHEN** an authenticated user calls `GET /api/v1/linkedin/oauth/start`
- **THEN** a fresh `state` SHALL be stored mapped to the caller's `chat_id`
- **AND** the response SHALL be `{ authorizeUrl }` with scope `openid profile w_member_social`

#### Scenario: Not configured
- **WHEN** `LINKEDIN_CLIENT_ID` or `LINKEDIN_REDIRECT_URI` is not set
- **THEN** the endpoint SHALL return HTTP 503 ("LinkedIn OAuth is not configured")

### Requirement: LinkedIn OAuth callback endpoint
The system SHALL provide a top-level `GET /linkedin/oauth/callback` (matching the registered `LINKEDIN_REDIRECT_URI` path) that single-use-validates the `state`, exchanges the `code` for tokens at the token endpoint, resolves and stores the member's person URN, marks the account connected (`has_linkedin = 1`), and redirects back to the webapp with `?linkedin_connected=1` on success or `?linkedin_connected=0` on any failure.

#### Scenario: Successful connect
- **WHEN** LinkedIn redirects to the callback with a valid `code` and a known, unused `state`
- **THEN** the system SHALL exchange the code, persist the encrypted access + refresh tokens and their expiries, store the person URN, set `has_linkedin = 1`, and redirect to the webapp with `?linkedin_connected=1`

#### Scenario: Missing or replayed state
- **WHEN** the callback is hit without a `code`/`state`, or with a `state` that is unknown/expired/already used
- **THEN** the system SHALL NOT store any tokens and SHALL redirect with `?linkedin_connected=0`

#### Scenario: State is single-use
- **WHEN** the callback validates a `state`
- **THEN** that `state` row SHALL be deleted on read so it cannot be replayed

### Requirement: LinkedIn OAuth status probe endpoint
The system SHALL provide an authenticated `GET /api/v1/linkedin/oauth/status` that returns `{ connected, needsReconnect }`, where `connected` is true iff a usable bearer can currently be resolved (refreshing proactively) and `needsReconnect` is true iff no bearer can be resolved but the user previously connected (`has_linkedin = 1`).

#### Scenario: Connected and healthy
- **WHEN** the probe runs and a valid bearer is resolved (after any needed refresh)
- **THEN** it SHALL return `{ connected: true, needsReconnect: false }`

#### Scenario: Connected intent but dead token
- **WHEN** the probe runs, `has_linkedin = 1`, but no usable bearer can be resolved
- **THEN** it SHALL return `{ connected: false, needsReconnect: true }`

#### Scenario: Never connected
- **WHEN** the probe runs and `has_linkedin = 0`
- **THEN** it SHALL return `{ connected: false, needsReconnect: false }`

### Requirement: LinkedIn token exchange and refresh service
The system SHALL provide `services/linkedin-oauth.ts` exposing `buildAuthorizeUrl(env, state)`, `exchangeCode(env, code)`, and `refreshAccessToken(env, refreshToken)`. Token requests SHALL `POST https://www.linkedin.com/oauth/v2/accessToken` form-encoded as a CONFIDENTIAL client — including `client_id` AND `client_secret` (`env.LINKEDIN_CLIENT_SECRET`) in the body. The parsed result SHALL include the access token, refresh token, access-token expiry (`expires_in`), and refresh-token expiry (`refresh_token_expires_in`).

#### Scenario: Authorization-code exchange
- **WHEN** `exchangeCode(env, code)` is called
- **THEN** it SHALL POST `grant_type=authorization_code` with `code`, `redirect_uri`, `client_id`, and `client_secret`
- **AND** return `{ accessToken, refreshToken, expiresInSec, refreshExpiresInSec }`

#### Scenario: Refresh exchange
- **WHEN** `refreshAccessToken(env, refreshToken)` is called
- **THEN** it SHALL POST `grant_type=refresh_token` with `refresh_token`, `client_id`, and `client_secret`
- **AND** return the rotated `{ accessToken, refreshToken, expiresInSec, refreshExpiresInSec }`

#### Scenario: Dead refresh token is distinguishable
- **WHEN** the token endpoint definitively rejects the refresh token (a 4xx `invalid_grant`)
- **THEN** the service SHALL throw a `LinkedInRefreshInvalidError` distinct from the generic error used for transient failures (network/5xx/429)

### Requirement: Person URN resolution at connect
On a successful connect, the system SHALL resolve the member's identity once via `GET https://api.linkedin.com/v2/userinfo` (OpenID Connect) and persist `urn:li:person:${sub}` as `users.linkedin_person_urn`. The person URN is an identifier (not a secret) and SHALL be stored in plaintext.

#### Scenario: URN fetched and stored on connect
- **WHEN** the callback completes the token exchange
- **THEN** it SHALL call `/v2/userinfo` with the new access token, read `sub`, and store `linkedin_person_urn = "urn:li:person:" + sub`

#### Scenario: URN fetch failure fails the connect
- **WHEN** the `/v2/userinfo` call fails after a successful token exchange
- **THEN** the connect SHALL be treated as failed (`?linkedin_connected=0`) so the account is not left connected without an author URN

### Requirement: Encrypted LinkedIn token storage and state table
The system SHALL persist LinkedIn credentials on the `users` row and the transient connect state in a dedicated table. `storeLinkedInTokens(env, chatId, accessToken, refreshToken, expiresInSec, refreshExpiresInSec)` SHALL encrypt and write the access and refresh tokens together with `linkedin_oauth2_expires_at` and `linkedin_refresh_expires_at` in a single atomic write. A `linkedin_oauth_state` table SHALL hold `{ state (PK), chat_id, created_at }`; reads SHALL be single-use and expired rows SHALL be ignored.

#### Scenario: Tokens persisted atomically
- **WHEN** `storeLinkedInTokens()` runs after exchange or refresh
- **THEN** `linkedin_oauth2_access_enc`, `linkedin_oauth2_refresh_enc`, `linkedin_oauth2_expires_at`, and `linkedin_refresh_expires_at` SHALL be written in one update so a rotated refresh token is never stranded without its matching access token

#### Scenario: State row TTL and single use
- **WHEN** a connect `state` is created
- **THEN** it SHALL be stored with a creation timestamp, consumed once on callback, and treated as invalid if older than the configured TTL

### Requirement: Proactive LinkedIn access-token refresh with rotation
The system SHALL provide `getValidLinkedInAccessToken(env, chatId)` that returns a usable decrypted access token, refreshing when `linkedin_oauth2_expires_at` is at/within a short buffer of now (or already past). On refresh it SHALL persist the rotated access AND refresh tokens (LinkedIn returns a new refresh token) and the new expiries via `storeLinkedInTokens`. It SHALL return null when no token is stored or a refresh fails. The refresh token's `linkedin_refresh_expires_at` is an ABSOLUTE bound that does NOT extend on refresh; once passed, the connection SHALL be treated as needing reconnect.

#### Scenario: Fresh token returned directly
- **WHEN** `getValidLinkedInAccessToken()` is called and the access token is not near expiry
- **THEN** it SHALL return the decrypted access token without calling the token endpoint

#### Scenario: Near-expiry access token is refreshed and rotated
- **WHEN** the access token is at/within the refresh buffer and a refresh token is present and not past its absolute expiry
- **THEN** the system SHALL refresh, persist the rotated access + refresh tokens and new expiries, and return the fresh access token

#### Scenario: Refresh token past absolute expiry
- **WHEN** `linkedin_refresh_expires_at` is in the past
- **THEN** the system SHALL NOT attempt a refresh, SHALL treat the connection as dead, and SHALL return null

### Requirement: LinkedIn dead-token invalidation and reconnect notification
On a confirmed dead refresh token (or a refresh token past its absolute expiry), the system SHALL clear the stored LinkedIn OAuth credentials so the failing-refresh loop stops and `needs_linkedin_reconnect` derives true, preserving `has_linkedin = 1`, and SHALL notify the user once (fire-and-forget) with a reconnect path into the webapp settings, reusing the existing reconnect-notification mechanism.

#### Scenario: Dead token clears credentials and notifies
- **WHEN** a refresh definitively fails with `LinkedInRefreshInvalidError` (and no concurrent refresher has already rotated the token)
- **THEN** the system SHALL clear `linkedin_oauth2_access_enc`/`linkedin_oauth2_refresh_enc`/expiries, keep `has_linkedin = 1`, and send a one-time "Reconnect LinkedIn" notification with a link to settings

#### Scenario: Concurrent refresh is not clobbered
- **WHEN** a refresh fails as invalid but a re-read shows the stored refresh token already changed (another refresher rotated it first)
- **THEN** the system SHALL NOT clear credentials or notify, and SHALL return the freshly stored access token

