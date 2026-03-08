## MODIFIED Requirements

### Requirement: Shared publish pipeline function
The system SHALL provide a single `publishDraft(env, chatId, draft)` function in `core/publish.ts` that executes the full multi-platform publish flow: parse content → determine targets → prepare media per platform → publish to each target independently → collect results → update DB status → store publish results on draft.

#### Scenario: Publish draft to X only (backward-compatible default)
- **WHEN** `publishDraft()` is called and the draft has `publish_targets = { x: true }`
- **THEN** it SHALL follow the existing X publish flow (get/generate image → upload media → post thread/quote tweet → update status)
- **AND** store results in `draft.publish_results` as `{ x: { tweet_ids: [...], url: "..." } }`

#### Scenario: Publish draft to X and Instagram Post
- **WHEN** `publishDraft()` is called with `publish_targets = { x: true, instagram_post: true }`
- **THEN** it SHALL publish to X first, then to Instagram Post
- **AND** each platform's success/failure SHALL be independent
- **AND** results SHALL be stored as `{ x: {...}, instagram_post: {...} }` or with `errors` for failures

#### Scenario: Publish draft to Instagram Post without existing image
- **WHEN** `publishDraft()` is called with Instagram Post target and the draft has no image
- **THEN** it SHALL render tweet card images via the tweet card renderer
- **AND** store the cards in R2
- **AND** use the cards as the images for the Instagram Post

#### Scenario: Publish draft to Instagram Story
- **WHEN** `publishDraft()` is called with Instagram Story target
- **THEN** it SHALL prepare a 9:16 story image (blurred background treatment if image exists, or first tweet card)
- **AND** publish to Instagram via the story API

#### Scenario: Publish draft to Instagram Reel
- **WHEN** `publishDraft()` is called with Instagram Reel target and `has_video = 1`
- **THEN** it SHALL publish the video to Instagram as a Reel via the existing reel publish function

#### Scenario: Partial platform failure — X succeeds, Instagram fails
- **WHEN** X publishing succeeds but Instagram Post fails
- **THEN** `publish_results` SHALL contain `{ x: { tweet_ids, url }, errors: { instagram_post: "error message" } }`
- **AND** the draft status SHALL be updated to `published`

#### Scenario: All platforms fail
- **WHEN** all selected platforms fail
- **THEN** `publish_results` SHALL contain only `errors`
- **AND** the draft status SHALL remain `approved` (not changed to published)
- **AND** if the draft was scheduled, it SHALL move to `approved` status

#### Scenario: Publish draft handles failure
- **WHEN** all platform publishing fails
- **THEN** `publishDraft()` SHALL return `{ success: false, results: PublishResults }` instead of throwing
- **AND** callers SHALL handle the failure UI based on the results

#### Scenario: Publish draft returns result
- **WHEN** `publishDraft()` completes with at least one platform succeeding
- **THEN** it SHALL return `{ success: true, results: PublishResults }`

### Requirement: All publish flows use the shared pipeline
The publish action, publish-all-approved action, cron scheduled publish, and /approve command SHALL all use `publishDraft()` instead of duplicating the publish logic.

#### Scenario: Callback publish action uses pipeline
- **WHEN** user clicks the Publish button on a draft
- **THEN** the action handler calls `publishDraft()` and renders the result with per-platform status

#### Scenario: Cron publish uses pipeline
- **WHEN** the cron handler publishes scheduled drafts
- **THEN** it calls `publishDraft()` for each due draft
- **AND** sends a notification showing which platforms succeeded/failed

#### Scenario: Publish all approved uses pipeline
- **WHEN** user triggers publish-all-approved (via button or /approve command)
- **THEN** it loops through approved drafts calling `publishDraft()` for each

### Requirement: Multi-tweet text combining for Instagram captions
The system SHALL combine text from multiple tweets in a thread into a single Instagram caption by joining them with double newlines.

#### Scenario: Thread with 3 tweets
- **WHEN** a thread of 3 tweets is published to Instagram
- **THEN** the caption SHALL be `tweet1.text + "\n\n" + tweet2.text + "\n\n" + tweet3.text`
- **AND** the combined text SHALL be trimmed to 2200 characters

#### Scenario: Single tweet
- **WHEN** a single tweet is published to Instagram
- **THEN** the caption SHALL be the tweet text as-is (trimmed to 2200 chars if needed)

### Requirement: Media preparation shared across platforms
The publish pipeline SHALL prepare media (images, tweet cards) once and reuse across all target platforms to avoid duplicate work.

#### Scenario: Image used for both X and Instagram
- **WHEN** a draft has an image and targets both X and Instagram Post
- **THEN** the image SHALL be read from R2 once
- **AND** uploaded to X's media API for X publishing
- **AND** served via the public `/media/` route URL for Instagram publishing

#### Scenario: Tweet cards generated once for multiple Instagram targets
- **WHEN** a draft with no image targets both Instagram Post and Instagram Story
- **THEN** the tweet cards SHALL be rendered once
- **AND** the Post SHALL use all cards (as carousel)
- **AND** the Story SHALL use only the first card (with blurred 9:16 treatment)

### Requirement: Published record simplified
The `createPublished()` function SHALL create a record in the `published` table with only: `id`, `chat_id`, `draft_id`, `pr_number`, `published_at`. The per-platform result data (tweet URLs, Instagram post IDs, etc.) SHALL be stored in `draft.publish_results` instead.

#### Scenario: Published record created on multi-platform publish
- **WHEN** a draft is published to X and Instagram
- **THEN** one `published` record SHALL be created with `id`, `chat_id`, `draft_id`, `pr_number`, `published_at`
- **AND** the detailed results SHALL be in `draft.publish_results`

### Requirement: Repost draft publish flow extended
The `publishDraft()` function SHALL detect repost drafts by `source='repost'` and handle multi-platform publishing. For X, it SHALL post as a quote tweet. For Instagram, it SHALL use the same image/tweet-card flow as regular drafts.

#### Scenario: Publish repost to X and Instagram Post
- **WHEN** `publishDraft()` processes a repost draft targeting X and Instagram Post
- **THEN** X SHALL receive a quote tweet (with `quote_tweet_id`)
- **AND** Instagram Post SHALL receive the draft's image or a rendered tweet card of the quote tweet
- **AND** the Instagram caption SHALL be the user's commentary text

#### Scenario: Publish repost to Instagram Story
- **WHEN** a repost draft targets Instagram Story
- **THEN** the system SHALL render a quote-tweet card (user's text + embedded original tweet card) and apply the blurred 9:16 treatment

### Requirement: PublishResult interface updated
The `PublishResult` interface SHALL change from `{ success: true, url: string, tweetIds: string[] }` to `{ success: boolean, results: PublishResults }` where `PublishResults` contains per-platform result objects.

#### Scenario: Callers updated to new interface
- **WHEN** `publishDraft()` returns
- **THEN** callers SHALL read `result.success` to determine overall outcome
- **AND** read `result.results` for per-platform details (URLs, IDs, errors)
