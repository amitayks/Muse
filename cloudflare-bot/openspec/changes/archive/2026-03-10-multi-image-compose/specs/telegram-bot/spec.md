## MODIFIED Requirements

### Requirement: TelegramMessage type includes media_group_id
The `TelegramMessage` interface SHALL include an optional `media_group_id?: string` field to identify photos that belong to the same Telegram media group.

#### Scenario: Photo message in a media group
- **WHEN** a Telegram update contains a photo message with `media_group_id`
- **THEN** the `TelegramMessage` object SHALL have `media_group_id` set to the group identifier string

#### Scenario: Single photo message without group
- **WHEN** a Telegram update contains a single photo (not part of a group)
- **THEN** the `TelegramMessage` object SHALL have `media_group_id` as `undefined`

#### Scenario: Text message
- **WHEN** a Telegram update contains a text-only message
- **THEN** the `TelegramMessage` object SHALL have `media_group_id` as `undefined`

### Requirement: Message handler passes media_group_id to compose input
The message handler SHALL pass `media_group_id` from the incoming Telegram message through to the handwrite input handler context.

#### Scenario: Handwrite input receives media_group_id
- **WHEN** a photo message with `media_group_id` arrives during compose mode
- **THEN** the handwrite input handler SHALL receive `message.media_group_id` in its context
- **AND** the handler SHALL use this value to determine whether to create a new tweet or append to an existing one
