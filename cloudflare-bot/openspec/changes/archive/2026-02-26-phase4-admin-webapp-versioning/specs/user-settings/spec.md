## MODIFIED Requirements

### Requirement: Settings view displays current timezone
The settings view SHALL display the user's current timezone, page size, language preference, system prompts button (with stale badge when applicable), and API key connection status. For admin users, a separate admin prompts button SHALL also appear.

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
