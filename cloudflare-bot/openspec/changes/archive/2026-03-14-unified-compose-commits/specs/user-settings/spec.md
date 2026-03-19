## MODIFIED Requirements

### Requirement: Commit default settings on users table
The `users` table SHALL have columns for controlling commit compose and webhook auto-generation defaults.

#### Scenario: commit_fast_image column
- **WHEN** the users table is queried
- **THEN** `commit_fast_image` SHALL be an INTEGER column with DEFAULT 1
- **AND** value 1 means webhook auto-generated drafts include imagePrompt (current behavior)
- **AND** value 0 means webhook auto-generated drafts skip imagePrompt for faster generation

#### Scenario: commit_fast_ai column
- **WHEN** the users table is queried
- **THEN** `commit_fast_ai` SHALL be an INTEGER column with DEFAULT 1
- **AND** value 1 means commit compose defaults `aiRefine` to true
- **AND** value 0 means commit compose defaults `aiRefine` to false

### Requirement: Commit defaults section in settings view
The settings view SHALL include a "Commit Defaults" section with toggle buttons.

#### Scenario: Settings view renders commit defaults
- **WHEN** `renderSettings` is called
- **THEN** the settings message SHALL include a "💻 Commit Defaults" section
- **AND** the section SHALL show: `[🎨 Auto Image: ON/OFF]` `[🤖 Auto AI: ON/OFF]`
- **AND** the toggle buttons SHALL use callback_data `settings:commit:fast_image` and `settings:commit:fast_ai`

#### Scenario: Toggle commit fast image setting
- **WHEN** user clicks the `[🎨 Auto Image]` toggle
- **THEN** `commit_fast_image` SHALL be toggled (0↔1) in the users table
- **AND** the settings view SHALL re-render with updated toggle state

#### Scenario: Toggle commit fast AI setting
- **WHEN** user clicks the `[🤖 Auto AI]` toggle
- **THEN** `commit_fast_ai` SHALL be toggled (0↔1) in the users table
- **AND** the settings view SHALL re-render with updated toggle state

### Requirement: Commit defaults applied to compose entry and webhook generation
The commit default settings SHALL affect both compose mode entry and webhook auto-generation behavior.

#### Scenario: Compose entry respects commit_fast_ai
- **WHEN** user enters commit compose mode via `/generate`
- **THEN** `ComposeState.aiRefine` SHALL be initialized from the user's `commit_fast_ai` setting

#### Scenario: Compose entry respects commit_fast_image
- **WHEN** user enters commit compose mode via `/generate`
- **THEN** `ComposeState.imageGen` SHALL be initialized from the user's `commit_fast_image` setting

#### Scenario: Webhook respects commit_fast_image
- **WHEN** webhook auto-generates a draft
- **THEN** if `commit_fast_image` is 0, the draft SHALL be created without imagePrompt generation
- **AND** the `generateContent` call SHALL set `skipImagePrompt: true` (or equivalent) to avoid unnecessary AI computation
