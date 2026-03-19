### Requirement: Stale prompt count function
The system SHALL provide a `countStalePrompts(env, chatId)` function that returns the number of user custom prompts that are based on an older default version.

#### Scenario: User has 2 stale prompts
- **WHEN** a user has custom content prompt based on v2 (default is v5) and custom repost prompt based on v1 (default is v3)
- **THEN** `countStalePrompts()` SHALL return 2

#### Scenario: User has no stale prompts
- **WHEN** a user has custom prompts all based on the current default versions
- **THEN** `countStalePrompts()` SHALL return 0

#### Scenario: User has no custom prompts
- **WHEN** a user has never customized any prompts
- **THEN** `countStalePrompts()` SHALL return 0

### Requirement: Settings badge for stale prompts
The Settings view SHALL show a notification indicator on the "System Prompts" button when the user has stale custom prompts.

#### Scenario: User has stale prompts
- **WHEN** `countStalePrompts()` returns > 0 for the current user
- **THEN** the System Prompts button label SHALL include a notification indicator (e.g., `📝 System Prompts 🔔`)

#### Scenario: User has no stale prompts
- **WHEN** `countStalePrompts()` returns 0
- **THEN** the System Prompts button label SHALL be normal (e.g., `📝 System Prompts`)

### Requirement: Stale prompt warning in user editor
When a user opens a prompt tab in the editor and that prompt is stale, the editor SHALL display a warning banner with options to view, update, or keep.

#### Scenario: Stale prompt banner displayed
- **WHEN** a user opens the editor and selects a tab with a stale prompt
- **THEN** a banner SHALL appear: "New default available" with version info
- **AND** three action buttons SHALL be available: [View Default], [Update to New], [Keep Mine]

#### Scenario: View Default action
- **WHEN** the user clicks [View Default]
- **THEN** the current global default prompt text SHALL be displayed in a read-only overlay or section
- **AND** the user's custom text SHALL remain in the textarea below

#### Scenario: Update to New action
- **WHEN** the user clicks [Update to New]
- **THEN** the textarea SHALL be replaced with the current global default text
- **AND** the prompt SHALL be auto-saved with `based_on_version` set to the current default version
- **AND** the badge SHALL change to "Default" (since content now matches)

#### Scenario: Keep Mine action
- **WHEN** the user clicks [Keep Mine]
- **THEN** the user's custom text SHALL remain unchanged
- **AND** `based_on_version` SHALL be updated to the current default version (suppresses future warnings for this update)
- **AND** the banner SHALL dismiss
- **AND** the badge SHALL remain "Custom"

### Requirement: Acknowledge stale prompt API
The system SHALL provide a `POST /api/prompt/acknowledge` endpoint that updates `based_on_version` for a user's custom prompt to the current default version without changing the prompt content.

#### Scenario: Acknowledge stale prompt
- **WHEN** `POST /api/prompt/acknowledge { type: 'content', lang: 'en' }` is called
- **THEN** `user_prompts.based_on_version` SHALL be updated to the current `default_prompts.version`
- **AND** `user_prompts.content` SHALL remain unchanged

### Requirement: Stale count API endpoint
The system SHALL provide a `GET /api/prompt/stale-count` endpoint that returns the number of stale custom prompts for the authenticated user.

#### Scenario: Stale count response
- **WHEN** `GET /api/prompt/stale-count` is called for a user with 2 stale prompts
- **THEN** the response SHALL be `{ count: 2 }`
