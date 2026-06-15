## Purpose

Resolves per-user API credentials by decrypting stored keys (including the Claude key, with no fallback to Worker secrets) into an `Env`-shaped object via `getUserKeys`, and hydrates `env.AI_PROVIDER` from the user's stored provider preference, with `CLAUDE_API_KEY` and `AI_PROVIDER` added to the `Env` type.
## Requirements
### Requirement: getUserKeys resolves per-user decrypted keys
The system SHALL provide a `getUserKeys(env, chatId)` function that reads the user's encrypted keys from D1, decrypts them, and returns an object matching the shape of API key fields on `Env`. This now includes `CLAUDE_API_KEY` decrypted from `claude_key_enc`.

#### Scenario: User has all keys
- **WHEN** `getUserKeys` is called for a user with all encrypted keys stored
- **THEN** it returns an object with `GOOGLE_API_KEY`, `X_API_KEY`, `X_API_SECRET`, `X_ACCESS_TOKEN`, `X_ACCESS_SECRET`, `GITHUB_TOKEN`, `HEYGEN_API_KEY`, `CLAUDE_API_KEY` all decrypted

#### Scenario: User has partial keys
- **WHEN** `getUserKeys` is called for a user with only Gemini and X keys stored
- **THEN** it returns those keys decrypted, with `GITHUB_TOKEN`, `HEYGEN_API_KEY`, and `CLAUDE_API_KEY` as undefined

#### Scenario: User has no keys
- **WHEN** `getUserKeys` is called for a user with no encrypted keys in their row
- **THEN** the function throws an error indicating the user must complete onboarding

#### Scenario: User does not exist
- **WHEN** `getUserKeys` is called for a chat_id with no `users` row
- **THEN** the function throws an error

#### Scenario: User has Claude key but no Gemini key
- **WHEN** `getUserKeys` is called for a user with `claude_key_enc` set but `gemini_key_enc` null
- **THEN** it returns `CLAUDE_API_KEY` decrypted and `GOOGLE_API_KEY` as undefined

### Requirement: Env hydration includes AI provider
The `hydrateEnv` function SHALL populate `env.AI_PROVIDER` from the user's stored `ai_provider` field. This makes the provider preference available to all downstream consumers via the standard env object.

#### Scenario: User has ai_provider set to claude
- **WHEN** env is hydrated for a user with `ai_provider` = `'claude'`
- **THEN** `env.AI_PROVIDER` SHALL be set to `'claude'`

#### Scenario: User has default ai_provider
- **WHEN** env is hydrated for a user with `ai_provider` = `'gemini'` (or null/default)
- **THEN** `env.AI_PROVIDER` SHALL be set to `'gemini'`

### Requirement: CLAUDE_API_KEY initialized to undefined in key resolution
The `getUserKeys` function SHALL explicitly set `CLAUDE_API_KEY` to `undefined` in the initial result object (alongside existing keys), preventing any fallback to Worker secrets.

#### Scenario: Claude key explicitly undefined when not stored
- **WHEN** `getUserKeys` is called for a user without `claude_key_enc`
- **THEN** the result SHALL include `CLAUDE_API_KEY: undefined` explicitly
- **AND** this SHALL NOT fall back to any Worker-level Claude key

### Requirement: CLAUDE_API_KEY and AI_PROVIDER on Env type
The `Env` interface in `types.ts` SHALL include `CLAUDE_API_KEY` (optional string) and `AI_PROVIDER` (optional string) fields.

#### Scenario: Env type includes new fields
- **WHEN** TypeScript compiles the project
- **THEN** `env.CLAUDE_API_KEY` and `env.AI_PROVIDER` SHALL be valid property accesses on the `Env` type

### Requirement: Resolve and refresh the X OAuth 2.0 access token

`getUserKeys`/`hydrateEnv` SHALL resolve a usable X OAuth 2.0 access token for the user — decrypting `x_oauth2_access_enc`, and refreshing it (via the stored refresh token) when `x_oauth2_expires_at` is at or near expiry — and expose it on the hydrated env (e.g. `X_OAUTH2_ACCESS_TOKEN`) for `Bearer` auth. It SHALL NOT fall back to Worker secrets, consistent with the existing per-user key policy.

#### Scenario: Hydrate env with a valid bearer

- **WHEN** `hydrateEnv(env, chatId)` runs for a connected user
- **THEN** the hydrated env SHALL carry a non-expired OAuth 2.0 access token (refreshing first if needed), and SHALL persist any rotated refresh token + new expiry

#### Scenario: No token stored

- **WHEN** the user has no `x_oauth2_access_enc`
- **THEN** the hydrated env SHALL carry no X access token, and X calls SHALL surface a reconnect-required signal rather than using legacy OAuth 1.0a credentials

### Requirement: LinkedIn access token resolved with no Worker-secret fallback
The `getUserKeys(env, chatId)` function SHALL explicitly initialize `LINKEDIN_ACCESS_TOKEN` to `undefined` in its result object (alongside the existing per-user key fields), preventing any fallback to Worker secrets. The decrypted/refreshed LinkedIn bearer is supplied during env hydration (see below), not from `getUserKeys` directly.

#### Scenario: LinkedIn token explicitly undefined when not connected
- **WHEN** `getUserKeys` is called for a user without LinkedIn credentials
- **THEN** the result SHALL include `LINKEDIN_ACCESS_TOKEN: undefined` explicitly
- **AND** this SHALL NOT fall back to any Worker-level LinkedIn token

### Requirement: hydrateEnv resolves the LinkedIn bearer and person URN
The `hydrateEnv` function SHALL populate `env.LINKEDIN_ACCESS_TOKEN` by resolving a usable bearer via `getValidLinkedInAccessToken(env, chatId)` (proactively refreshed; `undefined` when not connected), and SHALL populate `env.LINKEDIN_PERSON_URN` from the user's stored `linkedin_person_urn`. These make the LinkedIn publish integration usable through the standard hydrated `env` object.

#### Scenario: Connected user gets a usable bearer
- **WHEN** env is hydrated for a user with a valid (or refreshable) LinkedIn connection
- **THEN** `env.LINKEDIN_ACCESS_TOKEN` SHALL be set to the resolved access token
- **AND** `env.LINKEDIN_PERSON_URN` SHALL be set to the stored `urn:li:person:...`

#### Scenario: Unconnected user has undefined LinkedIn env
- **WHEN** env is hydrated for a user with no LinkedIn connection (`has_linkedin = 0` or no stored token)
- **THEN** `env.LINKEDIN_ACCESS_TOKEN` SHALL be `undefined`
- **AND** `env.LINKEDIN_PERSON_URN` SHALL be `undefined`

#### Scenario: Dead token yields undefined bearer
- **WHEN** env is hydrated for a user whose LinkedIn refresh fails definitively (token resolution returns null)
- **THEN** `env.LINKEDIN_ACCESS_TOKEN` SHALL be `undefined` so the publish branch fails fast with a reconnect-able auth error

### Requirement: LINKEDIN env fields on the Env type
The `Env` interface in `types.ts` SHALL include `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`, `LINKEDIN_REDIRECT_URI` (app-level config) and `LINKEDIN_ACCESS_TOKEN`, `LINKEDIN_PERSON_URN` (per-request hydrated values), all optional strings.

#### Scenario: Env type includes new LinkedIn fields
- **WHEN** TypeScript compiles the project
- **THEN** `env.LINKEDIN_CLIENT_ID`, `env.LINKEDIN_CLIENT_SECRET`, `env.LINKEDIN_REDIRECT_URI`, `env.LINKEDIN_ACCESS_TOKEN`, and `env.LINKEDIN_PERSON_URN` SHALL be valid property accesses on the `Env` type

