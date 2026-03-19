## ADDED Requirements

### Requirement: Fast Generate button in batch notifications
Each scored tweet in the batch notification SHALL have a "Fast Generate" button that immediately generates a repost draft using default settings.

#### Scenario: Fast Generate button rendered
- **WHEN** `buildBatchPage` renders a scored tweet that has not been drafted
- **THEN** the tweet's button row SHALL include `[⚡ Fast]` with callback_data `action:fast_gen:TWEET_ID`

#### Scenario: Fast Generate clicked
- **WHEN** user clicks `[⚡ Fast]` for a tweet
- **THEN** the system SHALL fetch the tweet from `twitter_tweets` (no X API call)
- **AND** read the user's `fast_generate_image` and `analyze_source_image` settings
- **AND** call `generateRepostContent` with AI on, no user tweets, no instruction
- **AND** if `analyze_source_image` is on and `media_url` exists: pass image to Gemini
- **AND** create a draft with `source: 'repost'`, `original_tweet_id`, `original_tweet_url`
- **AND** update `twitter_tweets` row: `status = 'drafted'`, `draft_id` set

#### Scenario: Fast Generate with image setting on
- **WHEN** user clicks `[⚡ Fast]` and `fast_generate_image` is `1`
- **THEN** after draft creation, the system SHALL call `ensureImage` to generate an image
- **AND** the image generation SHALL NOT block the batch message update (can happen after)

#### Scenario: Fast Generate with image setting off
- **WHEN** user clicks `[⚡ Fast]` and `fast_generate_image` is `0`
- **THEN** image generation SHALL be skipped (image generated lazily when viewing draft)

#### Scenario: Fast Generate updates batch message inline
- **WHEN** fast generate completes successfully
- **THEN** the batch message SHALL be rebuilt via `rebuildBatchMessage`
- **AND** the tweet's row SHALL show `[✅ Generated]` with callback_data `draft:DRAFT_ID`
- **AND** a separate "draft ready" notification SHALL be sent with `[View Draft]` button

#### Scenario: Fast Generate fails
- **WHEN** AI generation fails during fast generate
- **THEN** the batch message SHALL NOT be modified
- **AND** the user SHALL receive an error notification with a retry option

### Requirement: Edit Repost button in batch notifications
Each scored tweet in the batch notification SHALL have an "Edit Repost" button that opens a full compose session for that tweet.

#### Scenario: Edit Repost button rendered
- **WHEN** `buildBatchPage` renders a scored tweet that has not been drafted
- **THEN** the tweet's button row SHALL include `[✏️ Edit]` with callback_data `action:edit_rp:TWEET_ID`

#### Scenario: Edit Repost clicked
- **WHEN** user clicks `[✏️ Edit]` for a tweet
- **THEN** the system SHALL fetch the tweet from `twitter_tweets`
- **AND** build `ComposeState` with `mode: 'repost'`, `sourceTweet` from DB data, `batchTweetId` set, `aiRefine: true`, `imageGen: false`
- **AND** if the tweet has `is_thread: 1`: query sibling tweets by `conversation_id` for thread context
- **AND** send a NEW compose message (the batch message SHALL NOT be modified)
- **AND** set `awaiting_input: 'handwrite'`

#### Scenario: Edit Repost for already drafted tweet
- **WHEN** user clicks an action button for a tweet that has already been drafted
- **THEN** the button SHALL show `[✅ Generated]` linking to the draft (no edit option)

#### Scenario: Edit Repost compose completed via pen down
- **WHEN** user completes a compose session that was started from Edit Repost (has `batchTweetId`)
- **THEN** the `twitter_tweets` row matching `batchTweetId` SHALL be updated with `status: 'drafted'` and `draft_id`

### Requirement: Batch tweet text as embedded link
The tweet text preview in batch notifications SHALL be rendered as a hyperlink to the original tweet URL, replacing the separate "Open Tweet" button.

#### Scenario: Tweet text rendered as link
- **WHEN** `buildBatchPage` renders a scored tweet
- **THEN** the tweet text preview SHALL be wrapped in `<a href="https://x.com/username/status/TWEET_ID">text...</a>`
- **AND** no separate `[🔗 Open]` URL button SHALL be rendered

#### Scenario: Link opens original tweet
- **WHEN** user clicks the linked tweet text in the batch notification
- **THEN** it SHALL open the original tweet URL in the browser

### Requirement: Batch page button layout updated
The per-tweet button row in batch pages SHALL change from the current layout to the new two-button layout.

#### Scenario: Undrafted tweet buttons
- **WHEN** a scored tweet has not been drafted
- **THEN** the button row SHALL be: `[⚡ Fast]` `[✏️ Edit]`

#### Scenario: Already drafted tweet button
- **WHEN** a scored tweet has been drafted
- **THEN** the button row SHALL be: `[✅ Generated]` linking to `draft:DRAFT_ID`

#### Scenario: Auto-approved tweet button
- **WHEN** a tweet was auto-approved (draft already created by poller)
- **THEN** the button row SHALL be: `[✅ Generated]` linking to `draft:DRAFT_ID`
