## ADDED Requirements

### Requirement: Identity analysis from user tweets
The system SHALL provide a `/who-am-i` skill that accepts the user's tweets and produces a comprehensive Identity Document. The skill SHALL instruct Gemini to analyze the tweets **as if they are Gemini's own tweets** — framed in first-person self-reflection ("these are posts I wrote, let me understand my own patterns"). The analysis SHALL cover: writing fingerprint (rhythm, length, structure), vocabulary spectrum (casual/formal ratio, jargon, characteristic phrases), emotional range as a spectrum (not a single tone), grammar patterns to preserve (not replicate), topic interests and perspective angles, humor and sarcasm patterns, engagement patterns (reactions, triggers), and signature moves (openers, closers, recurring structures).

#### Scenario: Identity analysis with sufficient tweets
- **WHEN** Gemini receives 10+ tweets via the `/who-am-i` skill
- **THEN** it SHALL produce a comprehensive Identity Document written in first-person ("I write in short punchy sentences", "I tend to mix Hebrew and English mid-thought")

#### Scenario: Identity analysis with quote tweets weighted
- **WHEN** the tweet set includes both original posts and quote tweets
- **THEN** the analysis SHALL weight quote tweets more heavily for emotional patterns, opinions, and reaction style, as they reveal richer identity signals than self-initiated posts

#### Scenario: Identity analysis with minimal tweets
- **WHEN** Gemini receives fewer than 5 tweets
- **THEN** it SHALL produce a partial Identity Document clearly noting which dimensions lack sufficient data, using hedged language ("based on limited data, I seem to prefer...")

#### Scenario: Identity captures spectrum not single point
- **WHEN** the Identity Document describes emotional range or tone
- **THEN** it SHALL use spectrum language ("I'm usually witty, sometimes earnest, rarely formal") rather than pinning to a single descriptor

### Requirement: Tweet fetching for identity analysis
The system SHALL fetch the user's last 100 tweets via the X API using the user's connected credentials. Pure retweets (no added text) SHALL be filtered out. Quote tweets and replies SHALL be preserved. The fetched tweets SHALL be sent to Gemini with the `/who-am-i` skill for analysis.

#### Scenario: Fetch with connected X credentials
- **WHEN** the identity analysis is triggered for a user with valid X API credentials
- **THEN** the system SHALL call the X API to fetch up to 100 of the user's recent tweets, filter out pure retweets, and pass the remaining tweets to Gemini

#### Scenario: User has fewer than 100 tweets
- **WHEN** the X API returns fewer than 100 tweets (user is new or posts infrequently)
- **THEN** the system SHALL use all available tweets and proceed with analysis

#### Scenario: X API fetch fails
- **WHEN** the X API call fails (rate limit, invalid credentials, network error)
- **THEN** the system SHALL display an error message and offer to retry or use the default identity

### Requirement: Identity Document storage
The Identity Document SHALL be stored in the `user_prompts` table with `prompt_type = 'identity'`. The user can view and edit the Identity Document content (the INFO — who they are). The analysis skill itself (`/who-am-i` prompt instructions) SHALL be admin-only editable, stored in `default_prompts` with `prompt_type = 'who-am-i'`. Note: `'who-am-i'` is the analysis SKILL that produces identity documents; `'identity'` is the resulting document type stored per-user.

#### Scenario: Identity saved after analysis
- **WHEN** Gemini produces an Identity Document for a user
- **THEN** the document SHALL be stored in `user_prompts` with `chat_id`, `prompt_type = 'identity'`, and the user's language

#### Scenario: User edits identity info
- **WHEN** a user modifies their Identity Document via the WebApp
- **THEN** the edited content SHALL be saved to `user_prompts` as a standard user prompt save (same as editing any other skill)

#### Scenario: Admin edits identity analysis skill
- **WHEN** the admin edits the `/who-am-i` skill via the admin WebApp
- **THEN** the admin is editing the instructions in `default_prompts` for `prompt_type = 'who-am-i'` — the skill that PRODUCES identity documents, not the documents themselves

### Requirement: Default skeleton identity
The system SHALL provide a minimal default Identity Document for users who skip identity analysis. The default SHALL be honest about its limitations: "I'm a tech professional who shares my work online. I prefer clear, direct communication. [No specific patterns analyzed yet — using neutral baseline until identity is built.]"

#### Scenario: User selects "Use default" during onboarding
- **WHEN** the user clicks "Use default" instead of "Understand who I am"
- **THEN** the system SHALL NOT store any identity data in `user_prompts` — the user will use the skeleton default via `getPrompt` fallback to `default_prompts('identity', lang)`

#### Scenario: Default identity used in generation
- **WHEN** a user with the default identity triggers content generation
- **THEN** the skill SHALL receive the skeleton identity and produce output with neutral but human tone (not corporate AI tone)

### Requirement: Identity re-analysis trigger
The system SHALL allow users to re-trigger identity analysis at any time from the settings view. This fetches fresh tweets and regenerates the Identity Document, replacing the existing one (after user confirmation).

#### Scenario: User triggers re-analysis from settings
- **WHEN** a user clicks "Re-analyze my identity" in settings
- **THEN** the system SHALL fetch the user's latest 100 tweets, run the `/who-am-i` analysis, and show the new Identity Document for review before saving

#### Scenario: Re-analysis confirmation
- **WHEN** the new Identity Document is generated
- **THEN** the user SHALL be shown a preview and asked to confirm before it replaces the existing identity

### Requirement: Identity injection into Gemini calls
Every identity-attached skill (`/work-progress`, `/refine`, `/quote`, `/video`, `/know-my-project`, `/what-i-like`) SHALL include the user's full Identity Document in the system instruction. The identity SHALL be injected as a distinct section after the skill prompt and before the task protocol, introduced as "this is who I am" (first-person, not "this is the user's profile").

#### Scenario: Content generation with identity
- **WHEN** `generateContent()` is called for a user with an Identity Document
- **THEN** the system instruction sent to Gemini SHALL contain: [skill prompt] + [identity document] + [task protocol]

#### Scenario: Content generation without custom identity
- **WHEN** `generateContent()` is called for a user who has no custom identity (no row in `user_prompts` for `'identity'`)
- **THEN** the system instruction SHALL fall back to the default skeleton identity from `default_prompts('identity', lang)` — identity is always present, never skipped

#### Scenario: Utility skills without identity
- **WHEN** `/persona` or `/image-gen` skill is invoked
- **THEN** the Identity Document SHALL NOT be included in the system instruction

### Requirement: Identity conflict resolution hierarchy
Every identity-attached skill SHALL establish a clear precedence: (1) Identity INFO takes highest priority — WHO I am always wins, (2) Skill prompt — HOW I operate for this task, (3) Runtime context — WHAT I'm working with. If the skill says "be creative" but the identity says "I'm minimal and dry," the output SHALL be minimal and dry creativity.

#### Scenario: Identity overrides skill tone
- **WHEN** a skill suggests enthusiastic output but the user's identity describes a dry, understated voice
- **THEN** the generated output SHALL reflect the user's dry voice applied to the skill's task, not override the identity with the skill's default tone

#### Scenario: Explicit hierarchy in skill text
- **WHEN** any identity-attached skill prompt is examined
- **THEN** it SHALL contain an explicit statement that identity takes precedence over skill instructions when they conflict
