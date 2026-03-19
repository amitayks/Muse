## ADDED Requirements

### Requirement: Prompt editor WebApp page
The system SHALL serve an HTML page at `/app/prompts` that provides a prompt editing interface inside a Telegram WebApp. The page SHALL use `window.Telegram.WebApp` SDK for theming and user identity.

#### Scenario: Page loads in Telegram WebApp
- **WHEN** a user taps the "System Prompts" button in settings
- **THEN** Telegram SHALL open the WebApp at `/app/prompts`
- **AND** the page SHALL call `Telegram.WebApp.ready()` and `Telegram.WebApp.expand()` on load
- **AND** the page SHALL use Telegram theme CSS variables for native appearance

#### Scenario: Page blocked outside Telegram
- **WHEN** the `/app/prompts` page is opened directly in a browser (not via Telegram)
- **THEN** the page SHALL detect missing `Telegram.WebApp` and show a message: "Please open this from the bot settings in Telegram"

### Requirement: Tabbed prompt type selection
The editor SHALL display 3 tabs for the user-editable prompt types: Content, Edit, and Repost. Selecting a tab SHALL load the corresponding prompt.

#### Scenario: Switch between prompt tabs
- **WHEN** the user taps the "Edit" tab
- **THEN** the textarea SHALL load the user's edit prompt (or the default if no custom exists)
- **AND** the badge SHALL update to show "Custom" or "Default"

#### Scenario: Initial tab on load
- **WHEN** the editor first loads
- **THEN** the "Content" tab SHALL be selected by default
- **AND** the content prompt SHALL be loaded

### Requirement: Prompt editing textarea
The editor SHALL display a textarea for editing the currently selected prompt. The textarea SHALL auto-resize to fit its content.

#### Scenario: Editing prompt text
- **WHEN** the user types in the textarea
- **THEN** the textarea SHALL resize to accommodate the text
- **AND** no character limit SHALL be enforced (prompts can be any reasonable length)

### Requirement: Save prompt from editor
The editor SHALL provide a Save button that persists the edited prompt to the database via the API.

#### Scenario: Successful save
- **WHEN** the user clicks Save
- **THEN** the editor SHALL call POST /api/prompt with the prompt content
- **AND** show a loading state during the request
- **AND** show a "Saved!" confirmation on success
- **AND** the badge SHALL update to "Custom"

#### Scenario: Save failure
- **WHEN** the save request fails (network error, server error)
- **THEN** the editor SHALL show an error message
- **AND** the prompt text SHALL remain in the textarea for retry

### Requirement: Reset prompt to default
The editor SHALL provide a "Reset to Default" button that deletes the user's custom prompt and loads the global default.

#### Scenario: Reset with confirmation
- **WHEN** the user clicks "Reset to Default"
- **THEN** the editor SHALL show a confirmation (e.g., "Reset to default prompt? Your custom version will be deleted.")
- **AND** on confirm, call DELETE /api/prompt
- **AND** load the default prompt text into the textarea
- **AND** the badge SHALL update to "Default"

### Requirement: Custom vs default badge
The editor SHALL display a badge per prompt tab indicating whether the user has a custom prompt or is using the default.

#### Scenario: Custom prompt loaded
- **WHEN** a prompt with `isCustom: true` is loaded
- **THEN** the badge SHALL show "Custom" with a distinguishing style (e.g., green)

#### Scenario: Default prompt loaded
- **WHEN** a prompt with `isCustom: false` is loaded
- **THEN** the badge SHALL show "Default" with a neutral style (e.g., gray)

### Requirement: X-Frame-Options excluded for WebApp routes
All responses from `/app/*` routes SHALL NOT include the `X-Frame-Options: DENY` header. This is required because Telegram opens WebApps in iframes.

#### Scenario: WebApp page served without frame restriction
- **WHEN** a request is made to `/app/prompts`
- **THEN** the response SHALL NOT contain `X-Frame-Options: DENY`
- **AND** the page SHALL load correctly inside Telegram's WebApp iframe
