## Purpose

Defines how the user prompt editor WebApp detects stale prompts when loading a tab and surfaces a warning banner with View Default, Update to New, and Keep Mine actions, including suppressing the banner once the stale prompt is acknowledged.

## Requirements

### Requirement: In-app per-language skills editor
The system SHALL provide a skills editor inside the React webapp at Settings → Skills (`/#/settings/skills`), replacing the standalone HTML prompt-editor pages. It SHALL support a **language toggle** (English / Hebrew) because each language has its own set of skill prompts, and for the active language it SHALL list the user-editable skills, let the user read and edit each skill's prompt, and reset a skill to its default. Skill resolution SHALL follow the existing precedence (user custom → admin default → code fallback), backed by the existing prompt API.

#### Scenario: Open skills editor
- **WHEN** the user opens Settings → Skills
- **THEN** the app SHALL display the language toggle and the list of user-editable skills for the active language

#### Scenario: Switch skill language
- **WHEN** the user flips the language toggle (e.g. EN → HE)
- **THEN** the editor SHALL load the skill set for that language; edits apply to that language's prompts

#### Scenario: Edit and save a skill
- **WHEN** the user edits a skill's prompt and saves
- **THEN** the custom prompt SHALL be stored for the user in the active language via the prompt API

#### Scenario: Reset a skill to default
- **WHEN** the user resets a skill
- **THEN** the user's custom prompt SHALL be removed and the skill SHALL revert to the resolved default (admin default → code fallback)

### Requirement: Admin global skills editor
For admin users, the system SHALL provide a global skills editor that edits the **default** prompts (including admin-only skills) per language and can push updated defaults to users. This SHALL be gated by the existing `isAdmin` check.

#### Scenario: Admin sees global editor
- **WHEN** an admin opens the skills area
- **THEN** a global skills editor SHALL be available alongside the per-user editor, exposing all skills (including admin-editable ones) per language

#### Scenario: Edit a default prompt
- **WHEN** an admin edits a default skill prompt for a language and saves
- **THEN** the default SHALL be updated via the admin prompt API

#### Scenario: Push default to users
- **WHEN** an admin pushes an updated default
- **THEN** affected users SHALL be flagged so their editor surfaces the stale-prompt warning on next view

#### Scenario: Non-admin cannot access global editor
- **WHEN** a non-admin user navigates to the skills area
- **THEN** only the per-user editor SHALL be available; the global editor SHALL NOT be shown

### Requirement: Prompt editor shows stale warning
The in-app skills editor (Settings → Skills) SHALL detect stale prompts when loading a skill and surface a warning with action options, scoped to the active language.

#### Scenario: Loading stale prompt
- **WHEN** the editor loads a skill where `isStale: true` from the API response
- **THEN** a warning SHALL appear with a "New default available" message and actions: [View Default], [Update to New], [Keep Mine]

#### Scenario: Loading non-stale prompt
- **WHEN** the editor loads a skill where `isStale: false`
- **THEN** no warning SHALL appear

#### Scenario: After acknowledging stale prompt
- **WHEN** the user chooses [Keep Mine] and revisits the skill
- **THEN** the warning SHALL NOT reappear (the acknowledged version is recorded)
