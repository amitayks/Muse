## MODIFIED Requirements

### Requirement: Multi-message tweet accumulation
While in compose mode (`awaiting_input === 'handwrite'`), each text message the user sends SHALL be buffered as a separate tweet in chronological order. Photo messages SHALL be grouped by `media_group_id` — photos in the same group are appended to a single tweet.

#### Scenario: Text message becomes tweet
- **WHEN** user sends a text message while in compose mode
- **THEN** the message text SHALL be appended to `HandwriteState.tweets[]` with the Telegram `message_id` stored
- **AND** the bot's status message SHALL be edited to update the tweet count

#### Scenario: Status message counter update
- **WHEN** a new tweet is buffered
- **THEN** the bot SHALL edit its status message to show "✍️ Composing... (N tweets)" where N is the current buffer size
- **AND** if any tweet exceeds 280 characters, the status SHALL include "⚠️ Tweet K over 280 chars"

#### Scenario: Single photo message becomes tweet with media
- **WHEN** user sends a single photo message (no `media_group_id`, with optional caption) while in compose mode
- **THEN** the photo SHALL be downloaded from Telegram and stored in R2
- **AND** a tweet SHALL be buffered with the caption as text (or empty string if no caption) and the R2 key in `media[]`
- **AND** the status message counter SHALL update

#### Scenario: Multi-photo message groups into single tweet
- **WHEN** user sends a multi-photo message (Telegram delivers as separate updates sharing `media_group_id`)
- **THEN** all photos in the group SHALL be stored in R2 individually
- **AND** all photos SHALL be appended to the same tweet's `media[]` array
- **AND** only one tweet SHALL be created for the entire group
- **AND** the caption from the first photo SHALL be used as the tweet text

### Requirement: Compose preview shows image counts and platform warnings
The compose preview SHALL display per-image indicators and platform-aware limit warnings.

#### Scenario: Tweet with multiple images shows camera emojis
- **WHEN** a tweet in the compose preview has N images (1 ≤ N ≤ 4)
- **THEN** the preview SHALL show N camera emoji characters (📷📷📷📷)

#### Scenario: Tweet with 5+ images shows count notation
- **WHEN** a tweet has N images where N > 4
- **THEN** the preview SHALL show `📷×N` notation

#### Scenario: X per-tweet limit warning
- **WHEN** a tweet has more than 4 images
- **THEN** the preview SHALL show `⚠️ 𝕏: N/4 — only first 4 will post`

#### Scenario: Instagram total image limit warning
- **WHEN** the total image count across all tweets exceeds 10
- **THEN** the preview SHALL show `⚠️ IG: N/10 — only first 10 will post` with strikethrough styling

#### Scenario: All images within limits
- **WHEN** all tweets have ≤ 4 images and total is ≤ 10
- **THEN** no platform warnings SHALL be shown

### Requirement: ComposeTweet type extended with media count
The `ComposeTweet` interface SHALL replace `hasMedia?: boolean` with `mediaCount: number` to support multi-image display in the compose preview.

#### Scenario: ComposeTweet with multiple images
- **WHEN** a tweet has 3 images attached
- **THEN** `ComposeTweet.mediaCount` SHALL be `3`

#### Scenario: ComposeTweet with no images
- **WHEN** a tweet has no images
- **THEN** `ComposeTweet.mediaCount` SHALL be `0`
