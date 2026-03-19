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
