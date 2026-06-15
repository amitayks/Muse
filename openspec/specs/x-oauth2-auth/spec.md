# x-oauth2-auth Specification

## Purpose
TBD - created by archiving change add-x-oauth2-media. Update Purpose after archive.
## Requirements
### Requirement: OAuth 2.0 PKCE connect flow (webapp-initiated)

The system SHALL provide a per-user X (Twitter) OAuth 2.0 Authorization Code + PKCE connect flow, using a **public client** (no client secret), initiated from the webapp. The flow SHALL request the scopes `tweet.read tweet.write users.read media.write offline.access`.

#### Scenario: Start authorization

- **WHEN** an authenticated user (identified by `chat_id`) invokes the backend start endpoint (`GET /api/v1/x/oauth/start`)
- **THEN** the backend SHALL generate a random `state` and a random `code_verifier`, compute `code_challenge = BASE64URL(SHA256(code_verifier))`, persist `{state, chat_id, code_verifier}` transiently, and return the X authorize URL containing `response_type=code`, the configured `client_id` and `redirect_uri`, the scopes, `state`, `code_challenge`, and `code_challenge_method=S256`

#### Scenario: Handle the authorization callback

- **WHEN** X redirects the user back to the backend callback (`GET /x/oauth/callback?code=…&state=…`)
- **THEN** the backend SHALL look up the transient `state`, reject the request if `state` is unknown/expired/already used, otherwise exchange the `code` at `POST https://api.twitter.com/2/oauth2/token` (`grant_type=authorization_code`, `code`, `redirect_uri`, `client_id`, `code_verifier`; `Content-Type: application/x-www-form-urlencoded`; no Authorization header)
- **AND** on success it SHALL persist the access token, refresh token, and expiry for the `chat_id`, delete the transient state row, and redirect the user back to the webapp indicating success
- **AND** on token-exchange failure it SHALL surface an error and NOT mark the user connected

#### Scenario: CSRF / replay protection on state

- **WHEN** a callback arrives with a `state` that is missing, expired, or already consumed
- **THEN** the backend SHALL reject the callback and SHALL NOT exchange the code

### Requirement: Encrypted token storage

The system SHALL store each user's OAuth 2.0 access token and refresh token **encrypted at rest** (via the existing `encrypt`/`decrypt` and `storeEncryptedKey`), and the access-token expiry as a plaintext ISO-8601 timestamp. New `users` columns: `x_oauth2_access_enc`, `x_oauth2_refresh_enc`, `x_oauth2_expires_at`.

#### Scenario: Persist tokens on connect

- **WHEN** the token exchange or a refresh returns `access_token`, `refresh_token`, and `expires_in`
- **THEN** the system SHALL write `x_oauth2_access_enc` and `x_oauth2_refresh_enc` (encrypted) and `x_oauth2_expires_at` (now + `expires_in`) for that `chat_id`
- **AND** access/refresh tokens SHALL never be written to logs

### Requirement: Token refresh (rotation-aware)

The system SHALL refresh the access token using the stored refresh token (`grant_type=refresh_token`, `refresh_token`, `client_id`) before/at expiry and reactively on a `401`, and SHALL persist the rotated refresh token returned by X.

#### Scenario: Proactive refresh before expiry

- **WHEN** a user's OAuth 2.0 access token is resolved and `x_oauth2_expires_at` is at or within a short buffer of now
- **THEN** the system SHALL refresh the token before use and persist the new access token, the new (rotated) refresh token, and the recomputed expiry

#### Scenario: Reactive refresh on 401

- **WHEN** an X API call returns `401 Unauthorized`
- **THEN** the system SHALL attempt one refresh and retry the call once
- **AND** if the refresh itself fails, the user SHALL be marked as needing reconnect

#### Scenario: Refresh-token rotation is persisted

- **WHEN** a refresh response includes a new `refresh_token`
- **THEN** the system SHALL overwrite `x_oauth2_refresh_enc` with the new value so subsequent refreshes use it

#### Scenario: Concurrent refreshes do not corrupt tokens

- **WHEN** two requests for the same user refresh concurrently
- **THEN** the system SHALL serialize/guard the refresh (single-flight or compare-and-set) so a valid access+refresh pair is always persisted

### Requirement: Bearer resolution for all X API calls

All X API calls SHALL authenticate with `Authorization: Bearer <access_token>` using the user's resolved OAuth 2.0 access token, replacing OAuth 1.0a HMAC signing on the live request path. This is cross-cutting over reads (`getUserTweets`, `getTweetById`, `searchConversation`, `lookupUserByUsername`, `getMyProfile`, `fetchUserTweets`), writes (`postTweet`, `postThread`, `postQuoteTweet`, `deleteTweet`), and media (`uploadVideoToX`, `uploadMediaFromBuffer`).

#### Scenario: Read and write calls use the bearer

- **WHEN** any X read or write request is made for a connected user
- **THEN** it SHALL send `Authorization: Bearer <access_token>` and SHALL NOT compute an OAuth 1.0a signature

#### Scenario: Media upload and media post share the same user context

- **WHEN** a video/photo is uploaded and then attached to a post
- **THEN** both the upload and the post SHALL use the same user's OAuth 2.0 bearer, so the uploaded media is accepted by `POST /2/tweets` (no `"Your media IDs are invalid"`)

### Requirement: Reconnect state for users without a valid token

The system SHALL expose a "needs X reconnect" signal for users who have no stored OAuth 2.0 token or whose refresh has failed, and the webapp SHALL present a Connect X entry point.

#### Scenario: Action attempted without a token

- **WHEN** an X read/write/media action is attempted for a user with no valid OAuth 2.0 token
- **THEN** the action SHALL fail with a reconnect-required signal rather than an opaque auth error
- **AND** the webapp SHALL show a Connect X prompt

#### Scenario: Existing OAuth 1.0a-only user

- **WHEN** a user who only has legacy OAuth 1.0a credentials (no `x_oauth2_access_enc`) attempts an X action
- **THEN** they SHALL be treated as not connected and prompted to connect via OAuth 2.0

