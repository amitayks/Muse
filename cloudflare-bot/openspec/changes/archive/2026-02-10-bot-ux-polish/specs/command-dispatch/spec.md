## ADDED Requirements

### Requirement: Telegram command menu registration
The setup endpoint SHALL call the Telegram `setMyCommands` API to register all slash commands with descriptions, enabling native `/` autocomplete in Telegram.

#### Scenario: Setup registers commands
- **WHEN** the `/setup` endpoint is called
- **THEN** it SHALL call `setMyCommands` with all available commands and their descriptions
- **AND** this SHALL happen after `setWebhook` succeeds

#### Scenario: Command list content
- **WHEN** `setMyCommands` is called
- **THEN** it SHALL register: start, generate, approve, drafts, repos, schedule, delete, help, watch
- **AND** each command SHALL have a short description

## MODIFIED Requirements

### Requirement: Router dispatches callback actions via lookup table
The system SHALL route callback queries (button clicks) through dispatch tables based on the callback data prefix (`view:`, `action:`, `draft:`, `page:`, `repo:`, `config:`). Each prefix SHALL map to a handler function.

#### Scenario: View callback dispatched
- **WHEN** user clicks a button with `callback_data: "view:drafts"`
- **THEN** the router parses prefix `view` and value `drafts`, then invokes the view-change handler

#### Scenario: Action callback dispatched with entity ID
- **WHEN** user clicks a button with `callback_data: "action:publish:abc123"`
- **THEN** the router parses prefix `action`, action `publish`, and entity ID `abc123`, then invokes the publish action handler

#### Scenario: Pagination callback dispatched with list type
- **WHEN** user clicks a button with `callback_data: "page:auto:2"`
- **THEN** the router parses prefix `page`, list type `auto`, and page number `2`, then invokes the pagination handler with type awareness

#### Scenario: Legacy pagination callback handled gracefully
- **WHEN** user clicks a cached button with `callback_data: "page:2"` (old format)
- **THEN** the pagination handler SHALL treat it as auto-generated drafts page 2
