# instagram-token-lifecycle Specification

## Purpose
TBD - created by archiving change fix-instagram-publish-emoji-and-token-refresh. Update Purpose after archive.
## Requirements
### Requirement: Long-lived token exchange on connect
When a user connects Instagram, the system SHALL exchange the user-supplied short-lived token for a long-lived (~60-day) token via the Instagram Graph API `ig_exchange_token` grant, and persist both the resulting token and its computed expiry. The exchange SHALL be implemented in a dedicated service `services/instagram-token.ts` exposing `exchangeForLongLivedToken(shortLivedToken, appSecret)`.

The `ig_exchange_token` grant requires the Instagram App Secret; therefore the connect flow SHALL accept and store an encrypted App Secret (`instagram_app_secret_enc`). The App Secret is required only for the initial exchange — refresh does not need it.

#### Scenario: Successful exchange on connect
- **WHEN** a valid short-lived token, account ID, and App Secret are provided at connect time
- **THEN** the system SHALL call `GET https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret={appSecret}&access_token={shortLivedToken}`
- **AND** store the returned `access_token` encrypted as `instagram_token_enc`
- **AND** store `instagram_token_expires_at = now + expires_in` (ISO 8601)
- **AND** store the App Secret encrypted as `instagram_app_secret_enc`

#### Scenario: Exchange fails but token is already long-lived
- **WHEN** the exchange call returns an error (e.g., the pasted token is already long-lived, so `ig_exchange_token` is rejected)
- **THEN** the system SHALL attempt a refresh (`ig_refresh_token`) to validate and extend the token
- **AND** if refresh succeeds, store the refreshed token and `instagram_token_expires_at = now + expires_in`

#### Scenario: Both exchange and refresh fail
- **WHEN** neither exchange nor refresh succeeds (e.g., token younger than 24h and not exchangeable)
- **THEN** the system SHALL store the pasted token as-is with a conservative `instagram_token_expires_at = now + 60 days`
- **AND** log a warning that the token expiry is estimated rather than authoritative

### Requirement: Automatic pre-expiry token refresh via cron
The system SHALL refresh long-lived Instagram tokens before they expire, using the existing 15-minute cron, so a connected account never silently loses publishing. Refresh SHALL be implemented as `refreshLongLivedToken(token)` in `services/instagram-token.ts` and invoked from a per-user cron step.

A token SHALL be refreshed when it is within 7 days of `instagram_token_expires_at`. Refresh uses only the token (no App Secret).

#### Scenario: Token approaching expiry is refreshed
- **WHEN** the cron runs and a connected user's `instagram_token_expires_at` is `<= now + 7 days` and `> now`
- **THEN** the system SHALL call `GET https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token={token}`
- **AND** store the returned `access_token` as the new `instagram_token_enc`
- **AND** update `instagram_token_expires_at = now + expires_in`

#### Scenario: Cron coordinator wakes for refresh-eligible users
- **WHEN** the cron coordinator selects users with pending work
- **THEN** the selection SHALL also include users where `has_instagram = 1 AND instagram_token_expires_at IS NOT NULL AND instagram_token_expires_at <= datetime('now', '+7 days')`
- **AND** the per-user cron SHALL run the Instagram token-refresh step for those users

#### Scenario: Refresh fails because token already expired
- **WHEN** the refresh call fails because the token has already expired (cannot be refreshed)
- **THEN** the system SHALL NOT crash the rest of the user's cron tasks
- **AND** the system SHALL notify the user that Instagram needs to be reconnected, with a reconnect action

#### Scenario: User without Instagram is unaffected
- **WHEN** a user has `has_instagram = 0` or no stored Instagram token
- **THEN** the refresh step SHALL be a no-op for that user

### Requirement: Token expiry persistence and key wiring
The system SHALL persist `instagram_token_expires_at` and `instagram_app_secret_enc` on the `users` table and wire them through the existing encrypted-key plumbing.

#### Scenario: New encrypted field is allow-listed
- **WHEN** `instagram_app_secret_enc` is stored via `storeEncryptedKey()`
- **THEN** the field SHALL be present in the allow-list and persisted on the `users` row

#### Scenario: Expiry available for refresh decisions
- **WHEN** the cron token-refresh step evaluates a user
- **THEN** `instagram_token_expires_at` SHALL be readable for that user to decide whether a refresh is due

#### Scenario: Existing connected users migrated lazily
- **WHEN** a previously-connected user has a NULL `instagram_token_expires_at` after the migration
- **THEN** the cron coordinator's refresh-eligibility selection SHALL treat a NULL/overdue expiry as not-yet-eligible OR backfill on the next successful publish/refresh, so no crash occurs and the value becomes populated once a refresh or reconnect happens

