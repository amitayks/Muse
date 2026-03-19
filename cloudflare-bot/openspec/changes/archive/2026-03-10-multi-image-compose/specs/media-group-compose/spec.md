## ADDED Requirements

### Requirement: Telegram media group detection during compose
The handwrite input handler SHALL detect `media_group_id` on incoming photo messages and group photos from the same Telegram media group into a single tweet's `media[]` array.

#### Scenario: First photo in a media group creates new tweet
- **WHEN** a photo message arrives during compose mode with `media_group_id: "X1"` and caption "Check this out"
- **THEN** a new `HandwriteTweet` SHALL be created with `text: "Check this out"`, `media: [{key, type:'photo'}]`, and `mediaGroupId: "X1"`

#### Scenario: Subsequent photo in same group appends to existing tweet
- **WHEN** a photo message arrives with `media_group_id: "X1"` and the last tweet in the buffer has `mediaGroupId: "X1"`
- **THEN** the photo SHALL be appended to the last tweet's `media[]` array
- **AND** no new tweet SHALL be created
- **AND** the tweet's text SHALL NOT be overwritten (caption only appears on first message)

#### Scenario: Photo in different group creates new tweet
- **WHEN** a photo message arrives with `media_group_id: "Y2"` and the last tweet has `mediaGroupId: "X1"`
- **THEN** a new tweet SHALL be created with `mediaGroupId: "Y2"`

#### Scenario: Single photo without media_group_id creates new tweet
- **WHEN** a photo message arrives without `media_group_id` (single photo, not a group)
- **THEN** a new tweet SHALL be created as before (existing behavior preserved)

#### Scenario: Text message after media group creates new tweet
- **WHEN** a text message (no photo) arrives after a media group
- **THEN** a new tweet SHALL be created with the text (existing behavior preserved)

### Requirement: HandwriteTweet mediaGroupId tracking
The `HandwriteTweet` interface SHALL include an optional `mediaGroupId?: string` field to track which Telegram media group a tweet's photos belong to.

#### Scenario: HandwriteTweet with mediaGroupId
- **WHEN** a tweet is created from a media group photo
- **THEN** `HandwriteTweet.mediaGroupId` SHALL be set to the Telegram `media_group_id` value

#### Scenario: HandwriteTweet without mediaGroupId
- **WHEN** a tweet is created from a single photo or text message
- **THEN** `HandwriteTweet.mediaGroupId` SHALL be `undefined`

### Requirement: Media group caption handling
Only the first photo in a Telegram media group carries the caption. The system SHALL use this caption as the tweet text and SHALL NOT overwrite it when appending subsequent photos.

#### Scenario: First photo in group has caption
- **WHEN** the first photo in a media group arrives with caption "Hello world"
- **THEN** the tweet's `text` SHALL be "Hello world"

#### Scenario: Subsequent photo in group has no caption
- **WHEN** a subsequent photo in the same group arrives without a caption
- **THEN** the tweet's `text` SHALL remain unchanged from the first photo's caption

#### Scenario: Media group with no caption
- **WHEN** the first photo in a media group arrives without a caption
- **THEN** the tweet's `text` SHALL be an empty string
