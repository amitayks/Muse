## MODIFIED Requirements

### Requirement: Per-tweet media in DraftContent
The `Tweet` type SHALL support an optional `media` array field (`TweetMedia[]`) for per-tweet R2 media references.

#### Scenario: Tweet with media key
- **WHEN** a `DraftContent` contains tweets with `media` entries
- **THEN** each media entry's `key` SHALL reference an R2 object containing the image for that specific tweet

#### Scenario: Draft created from handwrite buffer
- **WHEN** pen-down creates a draft from buffered tweets
- **THEN** tweets with `media` in the buffer SHALL have their `media` array copied to the `DraftContent.tweets[].media` field

## ADDED Requirements

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
