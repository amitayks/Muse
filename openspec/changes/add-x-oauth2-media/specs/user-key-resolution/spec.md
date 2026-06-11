## ADDED Requirements

### Requirement: Resolve and refresh the X OAuth 2.0 access token

`getUserKeys`/`hydrateEnv` SHALL resolve a usable X OAuth 2.0 access token for the user — decrypting `x_oauth2_access_enc`, and refreshing it (via the stored refresh token) when `x_oauth2_expires_at` is at or near expiry — and expose it on the hydrated env (e.g. `X_OAUTH2_ACCESS_TOKEN`) for `Bearer` auth. It SHALL NOT fall back to Worker secrets, consistent with the existing per-user key policy.

#### Scenario: Hydrate env with a valid bearer

- **WHEN** `hydrateEnv(env, chatId)` runs for a connected user
- **THEN** the hydrated env SHALL carry a non-expired OAuth 2.0 access token (refreshing first if needed), and SHALL persist any rotated refresh token + new expiry

#### Scenario: No token stored

- **WHEN** the user has no `x_oauth2_access_enc`
- **THEN** the hydrated env SHALL carry no X access token, and X calls SHALL surface a reconnect-required signal rather than using legacy OAuth 1.0a credentials
