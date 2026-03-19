## ADDED Requirements

### Requirement: Draft source field
The `drafts` table SHALL have a `source` column (`TEXT DEFAULT 'auto'`) to distinguish draft origin. Values: `'auto'` for webhook/generate-created drafts, `'handwrite'` for user-composed drafts.

#### Scenario: Auto-generated draft has source auto
- **WHEN** a draft is created via webhook or `/generate` command
- **THEN** `source` SHALL default to `'auto'`

#### Scenario: Handwritten draft has source handwrite
- **WHEN** a draft is created via pen-down in compose mode
- **THEN** `source` SHALL be set to `'handwrite'`

#### Scenario: Query drafts by source
- **WHEN** `getDraftsBySource(env, chatId, source)` is called
- **THEN** it SHALL return only drafts matching the given source value

### Requirement: Per-tweet media in publish flow
The `publishDraft()` function SHALL support per-tweet media attachments via the `Tweet.mediaKey` field, uploading each tweet's media individually to X.

#### Scenario: Publish thread with per-tweet media
- **WHEN** `publishDraft()` processes a thread where individual tweets have `mediaKey`
- **THEN** for each tweet with a `mediaKey`, it SHALL read the media from R2, upload to X via `uploadMediaFromBuffer`, and attach the media ID to that specific tweet
- **AND** tweets without `mediaKey` SHALL be posted without media

#### Scenario: Fallback to draft-level image for auto drafts
- **WHEN** `publishDraft()` processes a draft with no per-tweet media but with a draft-level `image_url`
- **THEN** the existing behavior SHALL apply: the draft-level image is attached to the first tweet only

### Requirement: AI refinement for handwritten content
The system SHALL provide a function to refine handwritten tweets via Gemini, preserving tweet count, order, and authorial voice.

#### Scenario: Refine handwritten tweets
- **WHEN** AI refinement is requested for handwritten tweets
- **THEN** the system SHALL send the tweets to Gemini with instructions to polish grammar, clarity, and engagement impact
- **AND** the response SHALL contain the same number of tweets in the same order
- **AND** the user's voice and intent SHALL be preserved

#### Scenario: Refine generates image prompt alongside
- **WHEN** both AI refinement and image generation are requested
- **THEN** Gemini SHALL return both refined tweets and a structured `ImagePromptData` in a single API call
