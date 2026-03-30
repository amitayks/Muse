## ADDED Requirements

### Requirement: Download user-sent photos from Telegram
The system SHALL provide a `getFileUrl(env, fileId)` function in `services/telegram.ts` that calls the Telegram `getFile` API and returns a download URL.

#### Scenario: Get file URL for a photo
- **WHEN** `getFileUrl(env, fileId)` is called with a valid Telegram file ID
- **THEN** it SHALL call `https://api.telegram.org/bot{token}/getFile` with `file_id` parameter
- **AND** return the full download URL `https://api.telegram.org/file/bot{token}/{file_path}`

### Requirement: Store user media in R2
The system SHALL provide a `storeUserMedia(env, chatId, messageId, fileId)` function in `services/storage.ts` that downloads a photo from Telegram and stores it in R2.

#### Scenario: Store photo from Telegram to R2
- **WHEN** `storeUserMedia()` is called during compose mode
- **THEN** it SHALL call `getFileUrl()` to get the download URL
- **AND** download the file content
- **AND** store it in R2 at key `handwrite/{chatId}/{messageId}.jpg`
- **AND** return the R2 key

#### Scenario: Download fails gracefully
- **WHEN** the Telegram file download fails
- **THEN** `storeUserMedia()` SHALL return `null`
- **AND** the tweet SHALL be buffered without media (text-only)

### Requirement: Per-tweet media in DraftContent
The `Tweet` type SHALL support an optional `media` array field (`TweetMedia[]`) for per-tweet R2 media references.

#### Scenario: Tweet with media key
- **WHEN** a `DraftContent` contains tweets with `media` entries
- **THEN** each media entry's `key` SHALL reference an R2 object containing the image for that specific tweet

#### Scenario: Draft created from handwrite buffer
- **WHEN** pen-down creates a draft from buffered tweets
- **THEN** tweets with `media` in the buffer SHALL have their `media` array copied to the `DraftContent.tweets[].media` field

### Requirement: Publish pipeline supports per-tweet media
The publish pipeline SHALL attach media to individual tweets based on their `mediaKey` field, not just the first tweet.

#### Scenario: Thread with per-tweet images
- **WHEN** `publishDraft()` publishes a thread where individual tweets have `mediaKey` values
- **THEN** each tweet's media SHALL be read from R2 and uploaded to X separately
- **AND** each uploaded media ID SHALL be attached to its corresponding tweet in the thread

#### Scenario: Thread with mixed media and text-only tweets
- **WHEN** a thread has some tweets with media and some without
- **THEN** only tweets with `mediaKey` SHALL have media uploaded and attached
- **AND** tweets without `mediaKey` SHALL be posted as text-only

#### Scenario: Auto-generated draft with first-tweet image
- **WHEN** `publishDraft()` publishes an auto-generated draft (no per-tweet media)
- **THEN** the existing behavior SHALL be preserved: draft-level `image_url` is attached to the first tweet

### Requirement: Draft detail view displays per-tweet media images
The `draftDetailAction` SHALL extract and display images from `content.tweets[].media[]` when viewing any draft that has per-tweet media attached.

#### Scenario: Draft with single per-tweet image
- **WHEN** `draftDetailAction` renders a draft that has one tweet with one media entry (type `photo`)
- **THEN** it SHALL build the image URL as `{WORKER_URL}/media/{media.key}`
- **AND** send the draft detail as a photo message with caption and action buttons (existing `sendPhoto` flow)

#### Scenario: Draft with multiple per-tweet images
- **WHEN** `draftDetailAction` renders a draft that has multiple images across tweets (total N images, N >= 2)
- **THEN** it SHALL collect all photo media keys from all tweets
- **AND** send images 2 through N as a Telegram media group (album) first, with no caption and no keyboard
- **AND** then send image 1 with the draft detail caption and action buttons via `sendPhoto`
- **AND** return `void` (handler manages its own messaging)

#### Scenario: Draft with per-tweet media takes priority over draft.image_url
- **WHEN** `draftDetailAction` renders a draft that has both `content.tweets[].media[]` entries AND `draft.image_url`
- **THEN** the per-tweet media SHALL take priority
- **AND** `draft.image_url` and `ensureImage()` SHALL NOT be used

#### Scenario: Draft without per-tweet media falls back to existing behavior
- **WHEN** `draftDetailAction` renders a draft with no per-tweet media entries
- **THEN** the existing flow SHALL apply: check `draft.image_url`, call `ensureImage()` if applicable

#### Scenario: Media group limited to 10 images
- **WHEN** a draft has more than 10 per-tweet images
- **THEN** only the first 10 images SHALL be displayed (Telegram album limit)

#### Scenario: Callback handler preserves photo for actions on multi-image drafts
- **WHEN** user clicks an action button (approve, publish, platform toggle) on a draft displayed with a photo
- **THEN** the callback handler SHALL update the caption in place (existing `editMessageCaption` behavior)
- **AND** the album messages (if any) SHALL remain as-is (they cannot be edited)
