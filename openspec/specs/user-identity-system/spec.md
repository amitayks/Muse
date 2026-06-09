## Purpose

Builds and applies a per-user first-person Identity Document by fetching the user's tweets and running the `/who-am-i` analysis skill, stores it in `user_prompts` (with a skeleton default fallback), supports re-analysis, and injects the identity into identity-attached generation skills with a defined precedence where identity overrides conflicting skill instructions.
## Requirements
### Requirement: Identity analysis from user tweets
The system SHALL provide a `/who-am-i` skill that accepts the user's tweets and produces a comprehensive Identity Document. The skill SHALL instruct Gemini to analyze the tweets **as if they are Gemini's own tweets** — framed in first-person self-reflection ("these are posts I wrote, let me understand my own patterns"). The analysis SHALL cover: writing fingerprint (rhythm, length, structure), vocabulary spectrum (casual/formal ratio, jargon, characteristic phrases), emotional range as a spectrum (not a single tone), grammar patterns to preserve (not replicate), topic interests and perspective angles, humor and sarcasm patterns, engagement patterns (reactions, triggers), and signature moves (openers, closers, recurring structures). When reply and quote entries include the referenced tweet's text and author, the skill SHALL use that context to interpret the user's reactions, opinions, and conversational stance (i.e. read the reply/quote against what it is responding to, not in isolation).

#### Scenario: Identity analysis with sufficient tweets
- **WHEN** Gemini receives 10+ tweets via the `/who-am-i` skill
- **THEN** it SHALL produce a comprehensive Identity Document written in first-person ("I write in short punchy sentences", "I tend to mix Hebrew and English mid-thought")

#### Scenario: Identity analysis with quote tweets weighted
- **WHEN** the tweet set includes both original posts and quote tweets
- **THEN** the analysis SHALL weight quote tweets more heavily for emotional patterns, opinions, and reaction style, as they reveal richer identity signals than self-initiated posts

#### Scenario: Identity analysis reads replies and quotes against their referenced context
- **WHEN** a reply or quote entry includes the referenced tweet's text and author handle
- **THEN** the analysis SHALL interpret the user's reaction relative to that referenced content (e.g. what they agree/disagree with and how they engage), rather than treating the reply/quote text as a standalone statement

#### Scenario: Identity analysis with minimal tweets
- **WHEN** Gemini receives fewer than 5 tweets
- **THEN** it SHALL produce a partial Identity Document clearly noting which dimensions lack sufficient data, using hedged language ("based on limited data, I seem to prefer...")

#### Scenario: Identity captures spectrum not single point
- **WHEN** the Identity Document describes emotional range or tone
- **THEN** it SHALL use spectrum language ("I'm usually witty, sometimes earnest, rarely formal") rather than pinning to a single descriptor

### Requirement: Tweet fetching for identity analysis
The system SHALL fetch up to the user's configured number of recent posts (presets 100/200/400, default 200; see the `identity-tweet-depth` capability) via the X API using the user's connected credentials. Because the X v2 timeline endpoint returns at most 100 results per request, the system SHALL paginate using the `next_token` pagination cursor, accumulating posts across pages until the configured depth is reached or the timeline is exhausted, bounded by a defensive page cap. Pure retweets (no added text) SHALL be filtered out via the API `exclude=retweets` parameter. Quote tweets and replies SHALL be preserved. For replies and quote tweets, the system SHALL also resolve the referenced (parent / quoted) tweet's text and author handle from the **same** API response via the `referenced_tweets.id` and `referenced_tweets.id.author_id` expansions (no additional API calls), attaching that context to each post when available. The fetched, context-enriched tweets SHALL be sent to Gemini with the `/who-am-i` skill for analysis.

#### Scenario: Fetch with connected X credentials at configured depth
- **WHEN** the identity analysis is triggered for a user with valid X API credentials and a configured depth of N (100, 200, or 400)
- **THEN** the system SHALL call the X API, paginating as needed, to collect up to N of the user's recent posts with `exclude=retweets`, and pass the remaining posts to Gemini

#### Scenario: Pagination across multiple pages
- **WHEN** the configured depth exceeds 100 (e.g. 200 or 400)
- **THEN** the system SHALL request additional pages using the `next_token` cursor until it has collected the configured number of posts or the API returns no further `next_token`

#### Scenario: User has fewer posts than the configured depth
- **WHEN** the X API runs out of posts (no further `next_token`) before reaching the configured depth (user is new, posts infrequently, or hits the timeline history ceiling)
- **THEN** the system SHALL use all available posts and proceed with analysis as a valid partial result

#### Scenario: Reply and quote entries carry referenced context
- **WHEN** a fetched post is a reply or quote tweet and its referenced tweet is present in the API response expansions
- **THEN** the post passed to Gemini SHALL include the referenced tweet's (truncated) text and the referenced author's handle, in addition to the user's own text

#### Scenario: Referenced tweet unavailable
- **WHEN** a reply or quote references a tweet that is not present in the response expansions (deleted, protected, or otherwise unavailable)
- **THEN** the system SHALL fall back to the bare reply/quote text without referenced context and SHALL NOT fail the analysis

#### Scenario: X API fetch fails
- **WHEN** the X API call fails (rate limit, invalid credentials, network error)
- **THEN** the system SHALL display an error message and offer to retry or use the default identity
- **AND** if a failure occurs partway through pagination, the system MAY proceed with the posts already collected rather than discarding them

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
The system SHALL allow users to re-trigger identity analysis at any time from the settings view. This fetches fresh tweets — up to the user's configured depth (presets 100/200/400, default 200) — and regenerates the Identity Document, replacing the existing one (after user confirmation).

#### Scenario: User triggers re-analysis from settings
- **WHEN** a user clicks "Re-analyze my identity" in settings
- **THEN** the system SHALL fetch up to the user's configured number of latest posts, run the `/who-am-i` analysis, and show the new Identity Document for review before saving

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

