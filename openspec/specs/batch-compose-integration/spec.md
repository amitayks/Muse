## Purpose

This capability adds one-tap repost generation to scored-tweet batch notifications. Each undrafted tweet gets a "Fast Generate" button that fetches the cached tweet, applies the user's image/source-analysis settings, calls `generateRepostContent`, creates a repost draft, and rebuilds the batch message inline to show a "Generated" link. It also defines the batch page layout—truncated plain-text tweet previews with an "Open" URL button—and the per-tweet button rows for drafted versus undrafted tweets.

## Requirements

### Requirement: Fast Generate button in batch notifications
Each scored tweet in the batch notification SHALL have a "Fast Generate" button that immediately generates a repost draft using default settings.

#### Scenario: Fast Generate button rendered
- **WHEN** `buildBatchPage` renders a scored tweet that has not been drafted
- **THEN** the tweet's button row SHALL include `[⚡ Generate @{username}]` with callback_data `action:fast_gen:TWEET_ID`

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

#### Scenario: Fast Generate fails
- **WHEN** AI generation fails during fast generate
- **THEN** the batch message SHALL NOT be modified
- **AND** the user SHALL receive an error notification with a retry option

### Requirement: Batch tweet text display
The tweet text preview in batch notifications SHALL be shown as plain text (truncated to 80 characters) with a clickable hyperlink. A separate `[🔗 Open]` URL button links to the original tweet.

#### Scenario: Tweet text rendered with link
- **WHEN** `buildBatchPage` renders a scored tweet
- **THEN** the tweet text preview SHALL be shown as truncated plain text (80 chars)
- **AND** a separate `[🔗 Open]` URL button SHALL link to the original tweet URL

### Requirement: Batch page button layout
The per-tweet button row in batch pages SHALL include a generate button and an open link button.

#### Scenario: Undrafted tweet buttons
- **WHEN** a scored tweet has not been drafted
- **THEN** the button row SHALL be: `[⚡ Generate @{username}]` `[🔗 Open]`

#### Scenario: Already drafted tweet button
- **WHEN** a scored tweet has been drafted
- **THEN** the button row SHALL be: `[✅ Generated]` linking to `draft:DRAFT_ID`
