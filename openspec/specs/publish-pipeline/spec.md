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

#### Scenario: Status update and published record creation order
- **WHEN** at least one platform publish succeeds (`anySuccess = true`)
- **THEN** the system SHALL call `createPublished()` FIRST with the platform results
- **AND** only after `createPublished()` succeeds SHALL it call `updateDraftStatus('published')`
- **AND** if `createPublished()` throws, the draft status SHALL remain unchanged (approved or scheduled)

#### Scenario: createPublished receives platform results
- **WHEN** `publishDraft()` calls `createPublished()` after a successful publish
- **THEN** it SHALL pass: `tweet_ids` (comma-joined string from `results.x.tweet_ids`, or null), `tweet_url` (from `results.x.url`, or null), `instagram_post_id` (from `results.instagram_post.post_id` or `results.instagram_story.post_id` or `results.instagram_reel.post_id`, or null), `instagram_url` (from `results.instagram_post.url` or `results.instagram_reel.url`, or null)

#### Scenario: Instagram-only publish creates valid published record
- **WHEN** `publishDraft()` publishes to Instagram Post only and it succeeds
- **THEN** `createPublished()` SHALL be called with `tweet_ids = null` and `instagram_post_id` set
- **AND** `updateDraftStatus('published')` SHALL be called after
- **AND** the user SHALL see the published draft detail (not an error)

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

### Requirement: gemini.ts renamed from grok.ts contains only AI generation
The file `services/gemini.ts` (renamed from `grok.ts`) SHALL contain only AI-related functions: `generateContent`, `editContent`, `generateImage`, `callGeminiText`, `parseContentResponse`, prompts, and `consolidateImagePrompt`/`buildImagePrompt`. It SHALL NOT contain R2 storage operations.

#### Scenario: generateImage returns buffer data only
- **WHEN** `generateImage()` is called
- **THEN** it returns `{ data: ArrayBuffer; mimeType: string }` or `null` — it does NOT store anything in R2

### Requirement: Image storage consolidated in storage service
The system SHALL provide `services/storage.ts` that handles image persistence. Functions `generateAndStoreImage(env, chatId, draftId, content)` and `ensureImage(env, chatId, draft)` SHALL move from `grok.ts` to `storage.ts`. This service imports `generateImage` from `gemini.ts` and uses `env.IMAGES` (R2) for storage.

#### Scenario: generateAndStoreImage stores in R2
- **WHEN** `generateAndStoreImage()` is called
- **THEN** it calls `generateImage()` from `gemini.ts`, stores the result in R2, updates the draft's `image_url`, and returns the R2 key

#### Scenario: ensureImage checks R2 before generating
- **WHEN** `ensureImage()` is called for a draft that already has an `image_url`
- **THEN** it verifies the image exists in R2 and returns the URL without regenerating

### Requirement: Publish action returns draft detail for inline transition
After publishing a draft via the publish action handler, the system SHALL return `renderDraftDetail()` instead of `renderSuccess()`, so the user sees the published state with the tweet URL inline.

#### Scenario: Manual publish shows result inline
- **WHEN** user clicks "Publish Now" and the publish succeeds
- **THEN** the action SHALL return `renderDraftDetail()` for the published draft
- **AND** the published detail SHALL include the tweet URL

#### Scenario: Manual publish failure shows error inline
- **WHEN** user clicks "Publish Now" and the publish fails
- **THEN** the action SHALL return `renderError()` with a retry suggestion

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

### Requirement: Per-tweet media in publish flow
The `publishDraft()` function SHALL support multiple media attachments per tweet via the `Tweet.media[]` field, uploading each tweet's media individually to X with a maximum of 4 images per tweet.

#### Scenario: Publish thread with multiple images per tweet
- **WHEN** `publishDraft()` processes a thread where a tweet has `media: [{key:'a'}, {key:'b'}, {key:'c'}]`
- **THEN** all 3 media items SHALL be read from R2 and uploaded to X via `uploadMediaFromBuffer`
- **AND** all 3 media IDs SHALL be passed to `postTweet` as `mediaIds: ["id_a", "id_b", "id_c"]`

#### Scenario: Tweet with more than 4 images truncates for X
- **WHEN** a tweet has 6 images in `media[]`
- **THEN** only the first 4 SHALL be uploaded and attached for X publishing
- **AND** the remaining 2 SHALL be silently skipped (no error thrown)

#### Scenario: Thread with mixed media counts
- **WHEN** a thread has tweet 1 with 3 images, tweet 2 with no images, tweet 3 with 1 image
- **THEN** tweet 1 SHALL have 3 media IDs attached, tweet 2 SHALL have none, tweet 3 SHALL have 1

#### Scenario: Fallback to draft-level image for auto drafts
- **WHEN** `publishDraft()` processes a draft with no per-tweet media but with a draft-level `image_url`
- **THEN** the existing behavior SHALL apply: the draft-level image is attached to the first tweet only

#### Scenario: Instagram collects all images across tweets
- **WHEN** `publishToIGPost()` processes a thread with multi-image tweets
- **THEN** ALL images across all tweets SHALL be collected for the carousel (up to Instagram's 10-image limit)

### Requirement: postThread accepts multi-media per tweet
The `postThread()` function in `x.ts` SHALL accept `perTweetMediaIds` as `(string[] | null)[]` — an array of media ID arrays per tweet — instead of the current `(string | null)[]`.

#### Scenario: Post tweet with multiple media IDs
- **WHEN** `postThread()` is called with `perTweetMediaIds[0] = ["id1", "id2", "id3"]`
- **THEN** the first tweet SHALL be posted with `media: { media_ids: ["id1", "id2", "id3"] }`

#### Scenario: Post tweet with null media entry
- **WHEN** `postThread()` is called with `perTweetMediaIds[1] = null`
- **THEN** the second tweet SHALL be posted without media

#### Scenario: Backward compatibility with single legacy mediaId
- **WHEN** `postThread()` is called with a single `mediaId` (for auto-generated drafts)
- **THEN** the first tweet SHALL have `media: { media_ids: [mediaId] }` (existing behavior preserved)

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

### Requirement: Cron publish notifications use record's chat_id
The cron handler SHALL send publish notifications (success, failure, stale video alerts) to the `chat_id` from each record (`draft.chat_id`, `video_draft.chat_id`), NOT to `env.TELEGRAM_CHAT_ID`.

#### Scenario: Scheduled draft published via cron
- **WHEN** cron publishes a scheduled draft belonging to user A
- **THEN** the success notification is sent to user A's `chat_id`, not to the admin's `env.TELEGRAM_CHAT_ID`

#### Scenario: Stale video generation detected
- **WHEN** cron detects a stale video generation for user B
- **THEN** the alert is sent to user B's `chat_id`

#### Scenario: Cron error for specific draft
- **WHEN** cron fails to publish a scheduled draft for user C
- **THEN** the error notification is sent to user C's `chat_id`

### Requirement: Quote tweet publishing via quote_tweet_id
The `postTweet()` function SHALL accept an optional `quoteTweetId` in its options parameter. When provided, the X API v2 request body SHALL include `quote_tweet_id` as a top-level field.

#### Scenario: Post quote tweet
- **WHEN** `postTweet(env, "Great release!", { quoteTweetId: "123456" })` is called
- **THEN** the request body SHALL be `{ text: "Great release!", quote_tweet_id: "123456" }`

#### Scenario: Post without quote (backwards compatible)
- **WHEN** `postTweet(env, "Hello world")` is called without quoteTweetId
- **THEN** the request body SHALL NOT include `quote_tweet_id`

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

### Requirement: PublishResult interface updated
The `PublishResult` interface SHALL change from `{ success: true, url: string, tweetIds: string[] }` to `{ success: boolean, results: PublishResults }` where `PublishResults` contains per-platform result objects.

#### Scenario: Callers updated to new interface
- **WHEN** `publishDraft()` returns
- **THEN** callers SHALL read `result.success` to determine overall outcome
- **AND** read `result.results` for per-platform details (URLs, IDs, errors)

### Requirement: Image handling for repost drafts
Repost draft publishing SHALL follow the same image handling as existing drafts: check for R2 image, upload to X if present, generate if needed and configured. The account's image config (from the linked twitter_account) SHALL control whether images are generated.

#### Scenario: Repost with image
- **WHEN** a repost draft has an `image_url` in R2
- **THEN** the image SHALL be uploaded to X and attached to the quote tweet

#### Scenario: Repost without image
- **WHEN** a repost draft has no image and account config has `alwaysGenerateImage=false`
- **THEN** the quote tweet SHALL be posted without media
