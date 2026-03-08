## ADDED Requirements

### Requirement: Send media group (photo album)
The system SHALL provide a `sendMediaGroup(env, chatId, photoUrls)` function in `integrations/telegram.ts` that sends 2–10 photos as a Telegram album.

#### Scenario: Send album of 3 photos
- **WHEN** `sendMediaGroup()` is called with 3 photo URLs
- **THEN** it SHALL call the Telegram `sendMediaGroup` API with `media` array of `InputMediaPhoto` objects
- **AND** each item SHALL have `type: "photo"` and `media: <url>`
- **AND** no caption SHALL be set on any item
- **AND** the function SHALL return an array of message IDs for the sent messages

#### Scenario: Send album of 2 photos (minimum)
- **WHEN** `sendMediaGroup()` is called with exactly 2 photo URLs
- **THEN** it SHALL send both photos as an album successfully

#### Scenario: Telegram API error
- **WHEN** the Telegram `sendMediaGroup` API returns an error
- **THEN** the function SHALL log the error and throw an exception
- **AND** the caller SHALL handle the error gracefully (e.g., fall back to single photo)
