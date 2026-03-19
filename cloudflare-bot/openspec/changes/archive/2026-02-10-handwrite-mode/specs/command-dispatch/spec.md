## ADDED Requirements

### Requirement: /handwrite command registered and dispatched
The `/handwrite` command SHALL be registered in the command dispatch table and in the Telegram command menu via `setMyCommands`.

#### Scenario: /handwrite command dispatched
- **WHEN** user sends `/handwrite`
- **THEN** the router SHALL look up `handwrite` in `commandHandlers` and invoke `commands/handwrite.ts`

### Requirement: edited_message update type routed
The worker entry point SHALL handle `edited_message` updates from Telegram and route them to the message handler with an `isEdit` flag.

#### Scenario: edited_message received during compose
- **WHEN** Telegram sends an update with `edited_message` field
- **THEN** the worker SHALL extract the message and route it to the message handler
- **AND** the handler SHALL check if compose mode is active and update the buffer

#### Scenario: edited_message received outside compose
- **WHEN** Telegram sends an `edited_message` update and the chat is not in compose mode
- **THEN** the update SHALL be silently ignored (no error, no response)

### Requirement: Compose-aware message routing
The message handler SHALL check for compose mode (`awaiting_input === 'handwrite'`) before checking for slash commands, with special handling for recognized commands.

#### Scenario: Text message during compose
- **WHEN** a text message arrives and `awaiting_input === 'handwrite'`
- **AND** the text does NOT start with a recognized slash command
- **THEN** the message SHALL be routed to the `handwrite` input handler for buffering

#### Scenario: Recognized command during compose cancels session
- **WHEN** a text message arrives and `awaiting_input === 'handwrite'`
- **AND** the text starts with a recognized slash command (e.g., `/drafts`, `/help`)
- **THEN** the compose session SHALL be cancelled (buffer discarded)
- **AND** the command SHALL be dispatched normally

### Requirement: Compose action callbacks
The system SHALL handle callback prefixes for compose mode actions: `compose:pendown`, `compose:toggle_image`, `compose:toggle_ai`, `compose:cancel`.

#### Scenario: Pen down callback
- **WHEN** user clicks button with `callback_data: "compose:pendown"`
- **THEN** the router SHALL invoke the pen-down action handler

#### Scenario: Toggle callback
- **WHEN** user clicks button with `callback_data: "compose:toggle_image"` or `"compose:toggle_ai"`
- **THEN** the router SHALL invoke the compose toggle handler

#### Scenario: Cancel callback
- **WHEN** user clicks button with `callback_data: "compose:cancel"`
- **THEN** the router SHALL invoke the compose cancel handler

## MODIFIED Requirements

### Requirement: Telegram command menu registration
The setup endpoint SHALL call the Telegram `setMyCommands` API to register all slash commands with descriptions, enabling native `/` autocomplete in Telegram.

#### Scenario: Setup registers commands
- **WHEN** the `/setup` endpoint is called
- **THEN** it SHALL call `setMyCommands` with all available commands and their descriptions
- **AND** this SHALL happen after `setWebhook` succeeds

#### Scenario: Command list content
- **WHEN** `setMyCommands` is called
- **THEN** it SHALL register: start, generate, approve, drafts, repos, schedule, delete, help, watch, handwrite
- **AND** each command SHALL have a short description
- **AND** handwrite SHALL have description "Write your own tweet or thread"
