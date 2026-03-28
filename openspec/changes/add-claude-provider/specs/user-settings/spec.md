## ADDED Requirements

### Requirement: AI provider toggle in Platforms settings sub-page
The Platforms settings sub-page SHALL display the user's current AI text provider and provide a toggle button to switch between Gemini and Claude.

#### Scenario: User views Platforms with Gemini provider
- **WHEN** user opens the Platforms settings sub-page and their `ai_provider` is `'gemini'`
- **THEN** the view SHALL display "🧠 AI Provider → Gemini" with a toggle button
- **AND** the toggle button SHALL show "Switch to Claude" with callback_data `settings:ai_provider:claude`

#### Scenario: User views Platforms with Claude provider
- **WHEN** user opens the Platforms settings sub-page and their `ai_provider` is `'claude'`
- **THEN** the view SHALL display "🧠 AI Provider → Claude" with a toggle button
- **AND** the toggle button SHALL show "Switch to Gemini" with callback_data `settings:ai_provider:gemini`

#### Scenario: User switches to Claude with key present
- **WHEN** user clicks "Switch to Claude" and has a stored Claude API key (`has_claude` = 1)
- **THEN** `ai_provider` SHALL be updated to `'claude'` in the database
- **AND** the Platforms sub-page SHALL re-render showing "AI Provider → Claude"

#### Scenario: User switches to Claude without key
- **WHEN** user clicks "Switch to Claude" and has no Claude API key (`has_claude` = 0)
- **THEN** the system SHALL navigate to the API Keys view
- **AND** a message SHALL indicate the user needs to add a Claude API key first

#### Scenario: User switches back to Gemini
- **WHEN** user clicks "Switch to Gemini"
- **THEN** `ai_provider` SHALL be updated to `'gemini'` in the database
- **AND** the Platforms sub-page SHALL re-render showing "AI Provider → Gemini"

### Requirement: Claude API key in API Keys management
The API Keys view SHALL include Claude as an additional service alongside Gemini, X/Twitter, GitHub, and Instagram.

#### Scenario: User views API Keys with Claude connected
- **WHEN** user opens API Keys and has a stored Claude key (`has_claude` = 1)
- **THEN** the Claude row SHALL show "✅ Claude AI → Connected" with an "Update" button
- **AND** the callback_data SHALL be `settings:update:claude`

#### Scenario: User views API Keys without Claude
- **WHEN** user opens API Keys and has no Claude key (`has_claude` = 0)
- **THEN** the Claude row SHALL show "⬜ Claude AI → Not connected" with a "Connect" button
- **AND** the callback_data SHALL be `settings:update:claude`

#### Scenario: User connects Claude key
- **WHEN** user clicks "Connect" on Claude and sends a valid API key
- **THEN** the key SHALL be encrypted with AES-256-GCM and stored in `claude_key_enc`
- **AND** `has_claude` SHALL be set to `1`
- **AND** `validateClaudeKey()` SHALL be called to verify the key
- **AND** the user's message containing the key SHALL be deleted for security

#### Scenario: User updates Claude key
- **WHEN** user clicks "Update" on Claude and sends a new API key
- **THEN** the new key SHALL be encrypted and replace the old `claude_key_enc`
- **AND** `validateClaudeKey()` SHALL verify the new key
- **AND** if validation fails, the old key SHALL be preserved and an error shown

#### Scenario: Claude key validation fails on connect
- **WHEN** user provides an invalid Claude API key
- **THEN** the system SHALL show an error message indicating the key is invalid
- **AND** `has_claude` SHALL remain `0`
- **AND** the user SHALL be able to retry

### Requirement: AI provider displayed on settings home summary
The settings home view SHALL display the current AI provider in the summary alongside other settings.

#### Scenario: Settings home shows Gemini provider
- **WHEN** user opens settings home and their provider is Gemini
- **THEN** the summary SHALL include a line showing "🧠 AI → Gemini"

#### Scenario: Settings home shows Claude provider
- **WHEN** user opens settings home and their provider is Claude
- **THEN** the summary SHALL include a line showing "🧠 AI → Claude"

## MODIFIED Requirements

### Requirement: Settings view displays current timezone
The settings view SHALL display the user's current timezone, page size, language preference, AI provider, system prompts button (with stale badge when applicable), default publish targets button, repost defaults section, and API key connection status. It SHALL NOT display video settings (those are in Video Studio). It SHALL include an API Keys management section. For admin users, a separate admin prompts button SHALL also appear.

#### Scenario: User views settings
- **WHEN** user opens settings
- **THEN** the view shows language, timezone, page size, AI provider, default publish targets, repost defaults, API Keys section, and a Home button. No video settings button is shown.
- **AND** the language button SHALL display the current language with flag emoji (e.g., `🌐 🇺🇸 English` or `🌐 🇮🇱 עברית`)
- **AND** the default platforms button SHALL display current default targets with emoji badges
- **AND** the repost defaults section SHALL show `[🎨 Fast Image: OFF/ON]` and `[📷 Source Analysis: ON/OFF]` toggles
- **AND** the AI provider line SHALL show the current provider name (e.g., `🧠 AI → Gemini` or `🧠 AI → Claude`)

#### Scenario: User views settings with stale prompts
- **WHEN** user opens settings and has stale custom prompts
- **THEN** the System Prompts button SHALL show a notification badge (e.g., `📝 System Prompts 🔔`)

#### Scenario: User views settings without stale prompts
- **WHEN** user opens settings and has no stale custom prompts
- **THEN** the System Prompts button SHALL appear without a badge

#### Scenario: Admin views settings
- **WHEN** an admin opens settings
- **THEN** an additional "📝 System Prompts (Admin)" button SHALL appear that opens `/app/admin-prompts`
- **AND** the regular "System Prompts" button SHALL also be present (for testing user experience)

#### Scenario: User views API Keys section
- **WHEN** user navigates to API Keys in settings
- **THEN** each service (Gemini, Claude, X/Twitter, GitHub, Instagram) shows connected/disconnected status with Update or Connect buttons

### Requirement: API Keys management in settings
The settings view SHALL include an API Keys section showing connection status for each service (Gemini, Claude, X/Twitter, GitHub, Instagram). Connected services show a checkmark and an "Update" button. Disconnected services show an empty indicator and a "Connect" button.

#### Scenario: User with all keys connected
- **WHEN** user opens API Keys settings and has Gemini, Claude, X, GitHub, and Instagram keys stored
- **THEN** all five services show as connected with "Update" buttons

#### Scenario: User with partial keys
- **WHEN** user opens API Keys settings and has only Gemini and X keys
- **THEN** Gemini and X show as connected, Claude, GitHub and Instagram show as disconnected with "Connect" buttons
