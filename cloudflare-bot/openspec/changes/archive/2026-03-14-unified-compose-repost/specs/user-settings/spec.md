## MODIFIED Requirements

### Requirement: Settings view displays current timezone
The settings view SHALL display the user's current timezone, page size, language preference, system prompts button (with stale badge when applicable), default publish targets button, repost defaults section, and API key connection status. It SHALL NOT display video settings (those are in Video Studio). It SHALL include an API Keys management section. For admin users, a separate admin prompts button SHALL also appear.

#### Scenario: User views settings
- **WHEN** user opens settings
- **THEN** the view shows language, timezone, page size, default publish targets, repost defaults, API Keys section, and a Home button. No video settings button is shown.
- **AND** the language button SHALL display the current language with flag emoji (e.g., `🌐 🇺🇸 English` or `🌐 🇮🇱 עברית`)
- **AND** the default platforms button SHALL display current default targets with emoji badges
- **AND** the repost defaults section SHALL show `[🎨 Fast Image: OFF/ON]` and `[📷 Source Analysis: ON/OFF]` toggles

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
- **THEN** each service (Gemini, X/Twitter, GitHub, Instagram) shows connected/disconnected status with Update or Connect buttons
