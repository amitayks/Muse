## MODIFIED Requirements

### Requirement: Dedicated repost content generation prompt
The repost system prompt SHALL be completely rewritten as the `/quote` skill using first-person self-narrative framing. Instead of instructing Gemini to "create a quote-tweet response," the skill SHALL frame the task as self-directed reaction: "This caught my attention, here's what I think." The system SHALL receive the user's full Identity Document (as self) and the account persona overview (as context about the other person, if available). The skill SHALL instruct Gemini to react FROM its identity TO the other person's post.

#### Scenario: Generate with full context and identity
- **WHEN** generation is triggered for a tweet from @vercel with the user's identity attached
- **THEN** the prompt SHALL include the user's identity (as self), the original tweet, and @vercel's persona overview (as other)
- **AND** the framing SHALL be "I want to share my thoughts on this post" not "Generate a quote tweet for this post"

#### Scenario: Generate without persona but with identity
- **WHEN** generation is triggered and no persona overview exists for the quoted author
- **THEN** the prompt SHALL still generate from the user's identity, reacting to the tweet content alone

#### Scenario: Generate without identity
- **WHEN** generation is triggered for a user with no Identity Document
- **THEN** the prompt SHALL use the skill's default self-narrative without identity injection (graceful degradation)

### Requirement: AI generation with context
The system SHALL generate a quote-tweet draft using the `/quote` skill, with the user's full Identity Document injected into the system instruction. If the quoted author is a followed account with an existing persona, the persona SHALL be included. The selected tone SHALL influence HOW the user reacts, not WHO they are — identity always takes precedence over tone setting.

#### Scenario: Generation for followed account with persona
- **WHEN** user clicks Generate for a tweet from a followed account that has a persona overview
- **THEN** bot uses the user's identity (as self) + the stored persona overview (as other), generates content framed as personal reaction, creates a draft with source='repost', and shows the draft detail

#### Scenario: Generation for unknown account
- **WHEN** user clicks Generate for a tweet from an account not being followed
- **THEN** bot generates content using the user's identity + the tweet content ONLY — no persona is fetched or created for the unknown account

### Requirement: No on-demand persona generation for manual reposts
The system SHALL NOT bootstrap or fetch a persona for unknown accounts during manual repost generation. Persona data SHALL only exist for accounts the user has explicitly followed. If no persona exists, the `/quote` skill SHALL work with the user's identity and the raw tweet content alone.

#### Scenario: Manual repost for unfollowed account
- **WHEN** a user submits a tweet URL for an account they don't follow
- **THEN** the system SHALL NOT call the X API to fetch profile data or call Gemini to generate a persona
- **AND** generation SHALL proceed with identity + tweet content only

#### Scenario: Persona only created via follow
- **WHEN** a user clicks "Follow" on an account
- **THEN** the persona bootstrap process SHALL run as part of the follow flow (existing behavior)
- **AND** subsequent reposts for that account SHALL include the persona

### Requirement: No tweet history in quote generation
The `/quote` skill SHALL NOT include the quoted author's recent tweet history as context. The generation context SHALL be limited to: the user's Identity Document, the specific tweet being quoted (with thread context if applicable), and the author's persona overview if the account is followed.

#### Scenario: Quote generation context
- **WHEN** the `/quote` skill assembles the Gemini request
- **THEN** the user prompt SHALL contain only the tweet text being quoted (and thread if applicable)
- **AND** SHALL NOT include the author's last 20-50 stored tweets

### Requirement: Repost generation uses DB-backed system prompt with identity
The repost generation flow SHALL resolve the system instruction via `assembleSystemInstruction(env, chatId, 'repost', lang)` which concatenates: `/quote` skill prompt + user's Identity Document + task protocol. This replaces the previous `getPrompt(env, chatId, 'repost', lang)` single-prompt resolution.

#### Scenario: User with custom quote skill and identity
- **WHEN** a user with a custom `/quote` skill and Identity Document generates a quote-tweet
- **THEN** the system instruction SHALL be: custom quote skill + user's identity + task protocol

#### Scenario: Default quote skill with identity
- **WHEN** a user without a custom `/quote` skill generates a quote-tweet
- **THEN** the system instruction SHALL be: default quote skill + user's identity + task protocol

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
