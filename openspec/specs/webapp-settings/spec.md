## Purpose

Provides a single scrollable settings page covering general preferences (timezone, language, page size), AI provider selection, default publish targets, repost/commit/repo defaults, API key connection status and updates for each service, and links to the prompt editor and identity re-analysis.
## Requirements
### Requirement: Settings page with sections
The system SHALL display all user settings on a single scrollable page organized into sections, replacing the bot's 6 nested sub-menus.

#### Scenario: Settings page loads
- **WHEN** the user navigates to `/#/settings`
- **THEN** the page SHALL display all settings sections with current values loaded from API

### Requirement: General settings section
The system SHALL display general settings: timezone, language, page size.

#### Scenario: Timezone dropdown
- **WHEN** the user taps the timezone selector
- **THEN** a dropdown SHALL appear with common timezone options (UTC-5, UTC, UTC+1, UTC+2, UTC+3, UTC+5:30, etc.) and the current selection highlighted

#### Scenario: Change timezone
- **WHEN** the user selects a new timezone
- **THEN** the change SHALL be saved via API immediately, and all time displays in the app SHALL update

#### Scenario: Language toggle
- **WHEN** the user taps the language toggle
- **THEN** it SHALL switch between English and Hebrew, save via API, and the app SHALL re-render in the new language with RTL layout if Hebrew

#### Scenario: Page size selector
- **WHEN** the user selects a new page size (5, 10, 15, 20)
- **THEN** the change SHALL be saved via API (this affects bot pagination, not webapp which uses infinite scroll)

### Requirement: AI provider setting
The system SHALL allow switching between AI providers: Gemini and Claude.

#### Scenario: AI provider radio buttons
- **WHEN** the platforms section renders
- **THEN** radio buttons SHALL display for Gemini and Claude, with the current provider selected

#### Scenario: Switch AI provider
- **WHEN** the user selects a different AI provider
- **THEN** the change SHALL be saved via API immediately

### Requirement: Default platform targets section
The system SHALL display checkboxes for default publish targets. The LinkedIn checkbox SHALL only be shown when the user has a connected LinkedIn account (`has_linkedin = true`), mirroring the Instagram gating.

#### Scenario: Platform checkboxes
- **WHEN** the platforms section renders
- **THEN** checkboxes SHALL display for: X, Instagram Post, Instagram Story, Instagram Reel, with current defaults checked

#### Scenario: LinkedIn checkbox shown only when connected
- **WHEN** the platforms section renders and `has_linkedin = true`
- **THEN** a LinkedIn checkbox SHALL display alongside the others, reflecting the current `default_publish_targets.linkedin`
- **AND** when `has_linkedin = false` the LinkedIn checkbox SHALL NOT be shown

#### Scenario: Toggle default platform
- **WHEN** the user toggles a default platform checkbox
- **THEN** the change SHALL be saved via API immediately and affect all newly created drafts

### Requirement: Repost defaults section
The system SHALL display repost-specific default settings.

#### Scenario: Repost toggles
- **WHEN** the repost section renders
- **THEN** toggle switches SHALL display for: Fast Image Generation (default ON/OFF), Analyze Source Image (default ON/OFF)

#### Scenario: Toggle repost default
- **WHEN** the user toggles a repost default
- **THEN** the change SHALL be saved via API immediately

### Requirement: Commit defaults section
The system SHALL display commit generation default settings.

#### Scenario: Commit toggles
- **WHEN** the commit section renders
- **THEN** toggle switches SHALL display for: Fast Image (default ON/OFF), Fast AI (default ON/OFF)

#### Scenario: Toggle commit default
- **WHEN** the user toggles a commit default
- **THEN** the change SHALL be saved via API immediately

### Requirement: Repo defaults section
The system SHALL display default settings for new repositories.

#### Scenario: Repo default toggles
- **WHEN** the repo defaults section renders
- **THEN** toggle switches SHALL display for: Auto Overview (ON/OFF), Default Watch Pushes (ON/OFF)

#### Scenario: Toggle repo default
- **WHEN** the user toggles a repo default
- **THEN** the change SHALL be saved via API immediately

### Requirement: API keys management section
The system SHALL display connection status and allow updating API keys for all services.

For X/Twitter specifically (OAuth 2.0 connected), the system SHALL reflect **live** connection health rather than mere presence of a stored token: it SHALL surface a distinct "needs reconnect" state when the stored token has become invalid (driven by `needs_x_reconnect` from the settings API and/or the live `GET /api/v1/x/oauth/status` probe), and it SHALL offer a reconnect/refresh action that re-runs the OAuth 2.0 connect flow **even when the account currently shows connected**, so a user who suspects a problem can re-link without first hitting a failure.

#### Scenario: Keys status display
- **WHEN** the API keys section renders
- **THEN** each service SHALL display: service name (Gemini, Claude, X/Twitter, GitHub, Instagram), connection status badge (Connected ✓ / Not Connected ✗), [Update] button

#### Scenario: Update API key
- **WHEN** the user taps "Update" on a service
- **THEN** a secure input modal SHALL appear for entering the new key/token. The input SHALL be of type "password" to mask the value.

#### Scenario: Save API key
- **WHEN** the user enters a key and taps "Save"
- **THEN** the key SHALL be sent via `PUT /api/v1/settings/keys/:service`, the connection status SHALL update, and the key input SHALL be cleared

#### Scenario: Multi-field keys (X/Twitter)
- **WHEN** the user updates X/Twitter legacy credentials
- **THEN** the modal SHALL display 4 fields: API Key, API Secret, Access Token, Access Secret

#### Scenario: X shows needs-reconnect when the token is dead
- **WHEN** the settings load and the X OAuth 2.0 token has been invalidated (`needs_x_reconnect` is true)
- **THEN** the X control SHALL display a prominent "Reconnect X" state instead of a healthy "Connected" badge, with an action that starts the OAuth 2.0 connect flow

#### Scenario: Reconnect available even when connected
- **WHEN** the X account currently shows connected and healthy
- **THEN** the X control SHALL still expose a reconnect/refresh action so the user can re-link at any time

#### Scenario: Live connection check
- **WHEN** the X connection status is verified via `GET /api/v1/x/oauth/status`
- **THEN** the control SHALL reflect the live `{ connected, needsReconnect }` result, and a dead token discovered by the probe SHALL switch the control into the needs-reconnect state

### Requirement: Skills and identity section
The system SHALL provide links to prompt editing and identity re-analysis.

#### Scenario: Prompt editor link
- **WHEN** the skills section renders
- **THEN** a "System Prompts" button SHALL navigate to `/#/settings/prompts` (the prompt editor page, replacing the old `/app/prompts`)

#### Scenario: Admin prompt editor link
- **WHEN** the current user is an admin
- **THEN** an additional "Admin Prompts" button SHALL appear, navigating to the admin prompt editor

#### Scenario: Re-analyze identity button
- **WHEN** the user taps "Re-analyze Identity"
- **THEN** the system SHALL call the re-analyze API, show a loading state, and upon completion, display a success message

### Requirement: LinkedIn OAuth connection control
The settings API-keys section SHALL include a LinkedIn entry that, like X, reflects **live** connection health rather than mere token presence: it SHALL surface a distinct "needs reconnect" state when the stored token is invalid (driven by `needs_linkedin_reconnect` from the settings API and/or a live `GET /api/v1/linkedin/oauth/status` probe), and it SHALL offer a Connect action (when not connected) and a reconnect/refresh action (even when currently connected) that runs the LinkedIn OAuth flow via `GET /api/v1/linkedin/oauth/start`. Because LinkedIn uses OAuth, it SHALL NOT present a manual key-paste modal.

#### Scenario: Not connected shows Connect
- **WHEN** the settings load and `has_linkedin` is false
- **THEN** the LinkedIn control SHALL show a "Connect LinkedIn" action that calls `startLinkedInOAuth()` and redirects the browser to the returned authorize URL

#### Scenario: Connected shows healthy status with reconnect available
- **WHEN** the settings load and LinkedIn is connected and healthy
- **THEN** the LinkedIn control SHALL show a "Connected" badge AND still expose a reconnect/refresh action so the user can re-link at any time

#### Scenario: Needs-reconnect state
- **WHEN** the settings load and `needs_linkedin_reconnect` is true (or the live probe returns `needsReconnect: true`)
- **THEN** the LinkedIn control SHALL show a prominent "Reconnect LinkedIn" state instead of a healthy badge, with an action that starts the OAuth flow

#### Scenario: Return from OAuth shows result
- **WHEN** the webapp loads with `?linkedin_connected=1` or `?linkedin_connected=0` after the OAuth redirect
- **THEN** it SHALL show a success or failure toast respectively and refresh the LinkedIn connection status

#### Scenario: Settings API exposes LinkedIn status
- **WHEN** `GET /api/v1/settings` is called
- **THEN** the response SHALL include `has_linkedin` and `needs_linkedin_reconnect` so the control can render without a separate probe on first paint

