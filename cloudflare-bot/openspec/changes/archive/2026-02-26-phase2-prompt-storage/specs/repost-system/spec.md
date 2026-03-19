## MODIFIED Requirements

### Requirement: Repost generation uses DB-backed system prompt
The repost generation flow SHALL resolve the system prompt from the database via `getPrompt(env, chatId, 'repost', lang)` instead of using the hardcoded `REPOST_SYSTEM_PROMPT` constant.

#### Scenario: User with custom repost prompt
- **WHEN** a user with a custom repost prompt generates a quote-tweet
- **THEN** the custom repost prompt SHALL be used as the system instruction for Gemini

#### Scenario: Default repost prompt
- **WHEN** a user without a custom repost prompt generates a quote-tweet
- **THEN** the global default repost prompt SHALL be used (identical to current hardcoded behavior)
