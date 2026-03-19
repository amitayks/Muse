## MODIFIED Requirements

### Requirement: Repost uses user-level language
The `buildRepostUserPrompt()` function SHALL use the user's global language setting (`user.language`) instead of the account-level `config.language` to determine the language instruction sent to Gemini.

#### Scenario: Hebrew user generates repost
- **WHEN** a user with `language='he'` generates a repost
- **THEN** the prompt sent to Gemini SHALL include `- Language: Hebrew`
- **AND** the language SHALL come from `user.language`, not from the account's config

#### Scenario: English user generates repost
- **WHEN** a user with `language='en'` generates a repost
- **THEN** the prompt sent to Gemini SHALL include `- Language: English`

### Requirement: Content generation uses user language
The `generateContent()` function in `gemini.ts` SHALL accept a `language` parameter and include a language instruction in the user prompt sent to Gemini. This ensures PR/commit-based tweet generation respects the user's language preference.

#### Scenario: Hebrew user gets Hebrew tweets
- **WHEN** `generateContent(env, source, repoId, 'he')` is called
- **THEN** the user prompt SHALL include a language instruction telling Gemini to write in Hebrew

#### Scenario: English user gets English tweets (default)
- **WHEN** `generateContent(env, source, repoId, 'en')` is called
- **THEN** the user prompt SHALL include a language instruction telling Gemini to write in English
