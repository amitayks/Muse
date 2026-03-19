## ADDED Requirements

### Requirement: System Prompts button in settings
The settings view SHALL include a "System Prompts" button that opens the WebApp prompt editor. The button SHALL use the `web_app` type with URL pointing to `/app/prompts`.

#### Scenario: User taps System Prompts button
- **WHEN** the user taps "📝 System Prompts" in settings
- **THEN** Telegram SHALL open the WebApp at the configured URL
- **AND** the WebApp SHALL load the prompt editor interface

#### Scenario: Button position in settings
- **WHEN** the settings view is rendered
- **THEN** the System Prompts button SHALL appear after the Language button and before the Timezone button
