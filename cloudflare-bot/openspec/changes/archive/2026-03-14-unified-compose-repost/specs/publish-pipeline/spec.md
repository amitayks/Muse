## MODIFIED Requirements

### Requirement: Draft source field
The `drafts` table SHALL have a `source` column (`TEXT DEFAULT 'auto'`) to distinguish draft origin. Values: `'auto'` for webhook/generate-created drafts, `'handwrite'` for user-composed drafts, `'repost'` for Twitter quote-tweet drafts. Repost drafts can now be created from both the compose pen-down flow and the batch fast-generate flow.

#### Scenario: Auto-generated draft has source auto
- **WHEN** a draft is created via webhook or `/generate` command
- **THEN** `source` SHALL default to `'auto'`

#### Scenario: Handwritten draft has source handwrite
- **WHEN** a draft is created via pen-down in compose mode with `mode: 'handwrite'`
- **THEN** `source` SHALL be set to `'handwrite'`

#### Scenario: Repost draft from compose has source repost
- **WHEN** a draft is created via pen-down in compose mode with `mode: 'repost'`
- **THEN** `source` SHALL be set to `'repost'`
- **AND** `original_tweet_id` and `original_tweet_url` SHALL be set from `sourceTweet`

#### Scenario: Repost draft from fast generate has source repost
- **WHEN** a draft is created via batch fast generate
- **THEN** `source` SHALL be set to `'repost'`
- **AND** `original_tweet_id` and `original_tweet_url` SHALL be set from the `twitter_tweets` row

#### Scenario: Query drafts by source
- **WHEN** `getDraftsBySource(env, chatId, source)` is called
- **THEN** it SHALL return only drafts matching the given source value

### Requirement: AI refinement for handwritten content
The system SHALL provide a function to refine handwritten tweets via Gemini, using the refine skill and identity to guide output. The AI is free to determine tweet count and structure. This function is used only in handwrite mode pen down.

#### Scenario: Refine handwritten tweets
- **WHEN** AI refinement is requested for handwritten tweets (compose `mode: 'handwrite'`)
- **THEN** the system SHALL send the tweets to Gemini with the refine skill prompt and identity document
- **AND** the runtime rules SHALL NOT enforce a specific tweet count (no "MUST return EXACTLY N tweets" constraint)
- **AND** the `<= 280 chars per tweet` constraint SHALL remain (platform limit)
- **AND** the user's voice and intent SHALL be preserved per the identity document

#### Scenario: Refine with user instruction
- **WHEN** AI refinement is requested with an `options.instruction` parameter
- **THEN** the user prompt SHALL be framed as: "Here's a draft. I want to change it like this: <instruction>"
- **AND** the AI SHALL follow the instruction while respecting the refine skill and identity

#### Scenario: Refine with empty tweets and instruction
- **WHEN** AI refinement is requested with zero tweets and an `options.instruction` provided
- **THEN** the user prompt SHALL be framed as: "I want to create content like this: <instruction>"
- **AND** the AI SHALL generate tweets from scratch based on the instruction, skill, and identity

#### Scenario: Refine generates image prompt alongside
- **WHEN** both AI refinement and image generation are requested
- **THEN** Gemini SHALL return both refined tweets and a structured `ImagePromptData` in a single API call

#### Scenario: Refine with multimodal image input
- **WHEN** AI refinement is requested with `inline_data` image parts in the user prompt
- **THEN** the system SHALL pass the multipart prompt (text + image parts) to `callGeminiText`
- **AND** Gemini SHALL use the images for context when refining text
