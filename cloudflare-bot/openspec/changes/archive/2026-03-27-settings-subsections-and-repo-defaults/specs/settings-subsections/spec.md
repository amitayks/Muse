## ADDED Requirements

### Requirement: Settings home shows category navigation
The settings home page SHALL display a text summary of all current setting values and a keyboard with category buttons: General, Skills, Platforms, Repost, Commits, Repos, API Keys, and Home.

#### Scenario: User opens settings
- **WHEN** user opens the settings page
- **THEN** the message text SHALL show current timezone, page size, language, repost defaults, commit defaults, and repo defaults values
- **AND** the keyboard SHALL show category buttons `[⚙️ General] [🧠 Skills] [📱 Platforms]`, `[🔄 Repost] [📝 Commits] [📦 Repos]`, `[🔑 API Keys] [🏠 Home]`
- **AND** the keyboard SHALL NOT show direct toggle buttons for individual settings

### Requirement: General sub-page
The General sub-page SHALL display current timezone, language, and page size values with descriptions, and provide buttons to modify each.

#### Scenario: User navigates to General settings
- **WHEN** user clicks the "General" category button
- **THEN** the bot SHALL display a sub-page titled "General Settings"
- **AND** SHALL show current timezone value with description: controls scheduled post times and time display
- **AND** SHALL show current language value with description: controls bot interface language
- **AND** SHALL show current page size value with description: number of items per page in lists
- **AND** SHALL provide buttons for Timezone, Language toggle, Page Size, and Back

### Requirement: Skills sub-page
The Skills sub-page SHALL display system prompts access, admin prompts (if admin), and identity re-analysis.

#### Scenario: User navigates to Skills settings
- **WHEN** user clicks the "Skills" category button
- **THEN** the bot SHALL display a sub-page titled "Skills & Identity"
- **AND** SHALL show a System Prompts button (with stale badge if applicable) with description: customize AI writing style and tone
- **AND** SHALL show a Re-analyze Identity button with description: re-scan your X profile to update AI persona
- **AND** SHALL provide a Back button

#### Scenario: Admin views Skills sub-page
- **WHEN** an admin clicks the "Skills" category button
- **THEN** the Admin System Prompts button SHALL also appear

### Requirement: Platforms sub-page
The Platforms sub-page SHALL display default publish targets and API keys access.

#### Scenario: User navigates to Platforms settings
- **WHEN** user clicks the "Platforms" category button
- **THEN** the bot SHALL display a sub-page titled "Platforms"
- **AND** SHALL show current default publish targets with platform badges and description: which platforms new drafts target by default
- **AND** SHALL show an API Keys button with description: manage connected service credentials
- **AND** SHALL provide a Back button

### Requirement: Repost sub-page
The Repost sub-page SHALL display repost-related defaults with toggle buttons and descriptions.

#### Scenario: User navigates to Repost settings
- **WHEN** user clicks the "Repost" category button
- **THEN** the bot SHALL display a sub-page titled "Repost Settings"
- **AND** SHALL show Fast Image toggle with current value and description: generate an AI image when creating repost drafts via Fast Generate
- **AND** SHALL show Source Analysis toggle with current value and description: send the original tweet's image to AI for context during repost generation
- **AND** SHALL provide toggle buttons and a Back button

### Requirement: Commits sub-page
The Commits sub-page SHALL display commit-related defaults with toggle buttons and descriptions.

#### Scenario: User navigates to Commits settings
- **WHEN** user clicks the "Commits" category button
- **THEN** the bot SHALL display a sub-page titled "Commit Settings"
- **AND** SHALL show Fast Image toggle with current value and description: generate an AI image when creating drafts from GitHub commits
- **AND** SHALL show Auto Refine toggle with current value and description: automatically refine commit content with AI before creating the draft
- **AND** SHALL provide toggle buttons and a Back button

### Requirement: Repos sub-page
The Repos sub-page SHALL display repo-related defaults with toggle buttons and descriptions.

#### Scenario: User navigates to Repos settings
- **WHEN** user clicks the "Repos" category button
- **THEN** the bot SHALL display a sub-page titled "Repo Defaults"
- **AND** SHALL show Auto Overview toggle with current value and description: automatically bootstrap project overview when adding a new repo
- **AND** SHALL show Watch Pushes toggle with current value and description: watch push events by default on newly added repos
- **AND** SHALL provide toggle buttons and a Back button

### Requirement: Sub-page back navigation
Every sub-page SHALL include a Back button that returns to the settings home page.

#### Scenario: User clicks Back on any sub-page
- **WHEN** user clicks the Back button on any settings sub-page
- **THEN** the bot SHALL return to the settings home page with updated summary text

### Requirement: Sub-page routing
The settings action handler SHALL route `settings:sub:<category>` callbacks to the appropriate sub-page render function.

#### Scenario: Category callback routing
- **WHEN** a callback `settings:sub:general` is received
- **THEN** the handler SHALL render and return the General sub-page
- **AND** the same pattern SHALL apply for `skills`, `platforms`, `repost`, `commits`, `repos`
