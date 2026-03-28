## MODIFIED Requirements

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

## ADDED Requirements

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
