## MODIFIED Requirements

### Requirement: Repost command and dashboard button
The system SHALL provide a `/repost` command and a "🔄 RePost" button on the home dashboard that enters the repost flow. Instead of showing a static preview, the flow SHALL enter compose mode directly after fetching the tweet.

#### Scenario: User triggers repost via command
- **WHEN** user sends `/repost`
- **THEN** bot sets `awaiting_input` to `repost_url` and displays a prompt: "Send me a tweet URL to create a repost" with a Cancel button

#### Scenario: User triggers repost via dashboard button
- **WHEN** user clicks "🔄 RePost" on the home screen
- **THEN** bot enters the same repost URL input mode as the `/repost` command

### Requirement: Tweet URL parsing
The system SHALL parse tweet URLs to extract the tweet ID and username. Supported formats: `https://x.com/{username}/status/{id}`, `https://twitter.com/{username}/status/{id}`, and bare variants without protocol.

#### Scenario: Valid tweet URL
- **WHEN** user sends a valid tweet URL like `https://x.com/vercel/status/1234567890`
- **THEN** bot extracts username `vercel` and tweet ID `1234567890` and proceeds to fetch the tweet

#### Scenario: Invalid URL format
- **WHEN** user sends text that is not a recognized tweet URL
- **THEN** bot displays an error message with format examples and keeps `awaiting_input` as `repost_url`

### Requirement: Tweet preview with engagement metrics
The system SHALL fetch the tweet via X API and enter compose mode with the source tweet context, including: author name/username, tweet text (as clickable link), engagement metrics, thread indicator if applicable.

#### Scenario: Standalone tweet enters compose
- **WHEN** bot fetches a standalone tweet successfully
- **THEN** bot enters compose mode with `mode: 'repost'` and `sourceTweet` populated from fetched data
- **AND** the compose view SHALL display the source tweet header with author info, linked tweet text, and metrics
- **AND** compose controls (image, AI, instruction, pen down, cancel) SHALL be available

#### Scenario: Thread tweet enters compose with full context
- **WHEN** bot fetches a tweet that is part of a thread (self-reply chain)
- **THEN** bot SHALL fetch the full thread context (up to 10 tweets in the conversation)
- **AND** store the concatenated thread text in `sourceTweet.threadText`
- **AND** the compose header SHALL indicate "Thread (N tweets)"

#### Scenario: Tweet fetch fails
- **WHEN** X API returns an error or the tweet doesn't exist
- **THEN** bot displays "Tweet not found or inaccessible" with a retry prompt

### Requirement: Duplicate detection
The system SHALL check if a repost draft or published post already exists for the given tweet ID before entering compose mode.

#### Scenario: Existing draft found
- **WHEN** user submits a URL for a tweet that already has a repost draft
- **THEN** the compose view SHALL show a duplicate warning banner
- **AND** a [View Existing] button SHALL be included in the compose button row
- **AND** the user MAY still compose and pen down to create a new draft

#### Scenario: No duplicate found
- **WHEN** user submits a URL for a tweet with no existing repost
- **THEN** bot enters compose mode normally without any warning

### Requirement: Dedicated repost content generation prompt
The system SHALL have a dedicated generation prompt in its own file (`ai/repost-prompt.ts`), separate from the existing content generation prompt. It SHALL instruct Gemini to create a quote-tweet response that adds genuine commentary, insight, or value to the original tweet. The prompt SHALL receive: the original tweet text, the account persona overview (if available), language setting, optional user tweets as initial thoughts, and optional instruction.

#### Scenario: Generate with full context
- **WHEN** generation is triggered for a tweet from @vercel with user tweets and instruction
- **THEN** the prompt SHALL include the original tweet, @vercel's persona overview, language setting, user tweets under "MY INITIAL THOUGHTS", and instruction under "WHAT I'M GOING FOR"

#### Scenario: Generate without persona
- **WHEN** generation is triggered and no persona overview exists for the account
- **THEN** the prompt SHALL still generate content using only the tweet text and any user-provided context

#### Scenario: Generate with thread context
- **WHEN** generation is triggered for a tweet that is part of a thread and `threadText` is provided
- **THEN** the prompt SHALL include a "FULL THREAD CONTEXT" section with the ordered thread text

### Requirement: AI generation with context
The system SHALL generate a quote-tweet draft using the repost generation prompt, with context including: the tweet text (full thread if applicable), author profile info, persona overview (from account or persona cache), optional user tweets, and optional instruction.

#### Scenario: Generation for followed account
- **WHEN** pen down triggers generation in repost mode for a followed account
- **THEN** bot uses the stored persona overview and account config, generates content via the quote skill, creates a draft with `source='repost'`, and shows the draft detail

#### Scenario: Generation for unknown account via manual repost
- **WHEN** pen down triggers generation in repost mode for an account not being followed
- **THEN** bot fetches/creates persona via X API profile + Gemini web search, caches it, generates content, and shows draft detail

### Requirement: Repost draft creation
When a repost draft is generated, the system SHALL create a row in the `drafts` table with: `source='repost'`, `pr_number=0`, `pr_title='@username | first-100-chars'`, `commit_sha=original_tweet_id` (for idempotency), `original_tweet_id`, `original_tweet_url`, `content` as JSON DraftContent, and `status='draft'` (or `'approved'` for auto-approve accounts).

#### Scenario: Draft content structure
- **WHEN** a repost draft is created
- **THEN** `content` SHALL be a JSON DraftContent with `format='single'` (typical) or `format='thread'`, and `tweets` array with the generated text

#### Scenario: Auto-approve draft creation
- **WHEN** the account has `autoApprove=true` and the tweet scores above threshold
- **THEN** the draft SHALL be created with `status='approved'` instead of `'draft'`

## REMOVED Requirements

### Requirement: Repost preview with static generate button
**Reason**: Replaced by compose mode entry. The repost flow now enters compose directly instead of showing a static preview with [Generate], [Open Tweet], [Cancel] buttons.
**Migration**: `renderRepostPreview` and `renderRepostGenerating` are deprecated. `rpGenAction` and `rpCancelAction` are deprecated. They remain temporarily for in-flight chat states with `repost_preview` context but SHALL be removed after one deployment cycle.

### Requirement: Follow prompt after generation
**Reason**: The follow prompt is still sent after draft creation from repost compose pen down, but it is no longer tied to the `rpGenAction` handler. The same logic moves to the pen-down handler for repost mode.
**Migration**: Follow prompt logic moves from `rpGenAction` to `handlePenDown` when `mode === 'repost'` and the account is not followed.
