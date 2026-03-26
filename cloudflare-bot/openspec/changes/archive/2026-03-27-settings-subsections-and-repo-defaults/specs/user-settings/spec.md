## ADDED Requirements

### Requirement: Repo default settings columns
The `users` table SHALL include `repo_auto_overview` (`INTEGER DEFAULT 0`) and `repo_default_watch_pushes` (`INTEGER DEFAULT 1`) columns controlling default behavior when adding new repos.

#### Scenario: Default values for new users
- **WHEN** a new user completes onboarding
- **THEN** `repo_auto_overview` SHALL be `0` (off — overview must be manually triggered)
- **AND** `repo_default_watch_pushes` SHALL be `1` (on — new repos watch pushes by default)

#### Scenario: User toggles repo auto overview
- **WHEN** user toggles "Auto Overview" in repo settings sub-page
- **THEN** `users.repo_auto_overview` SHALL be toggled (0↔1)
- **AND** the sub-page SHALL re-render with updated toggle state

#### Scenario: User toggles repo default watch pushes
- **WHEN** user toggles "Watch Pushes" in repo settings sub-page
- **THEN** `users.repo_default_watch_pushes` SHALL be toggled (0↔1)
- **AND** the sub-page SHALL re-render with updated toggle state

### Requirement: Repo defaults getter/setter
The `user-settings-db.ts` module SHALL provide `getRepoDefaults(env, chatId)` returning `{ autoOverview: boolean; defaultWatchPushes: boolean }` and `setRepoDefault(env, chatId, field, value)` for updating individual fields.

#### Scenario: Read repo defaults
- **WHEN** `getRepoDefaults` is called for a user
- **THEN** it SHALL return `autoOverview` mapped from `repo_auto_overview` column
- **AND** `defaultWatchPushes` mapped from `repo_default_watch_pushes` column

#### Scenario: Set repo default field
- **WHEN** `setRepoDefault` is called with field `'repo_auto_overview'` and value `1`
- **THEN** the `repo_auto_overview` column SHALL be updated to `1` for that user

## MODIFIED Requirements

### Requirement: Settings view displays current timezone
The settings view SHALL display the user's current timezone, page size, language preference, repost defaults, commit defaults, and repo defaults as a text summary. The keyboard SHALL show category navigation buttons (General, Skills, Platforms, Repost, Commits, Repos, API Keys, Home) instead of direct toggle buttons. It SHALL NOT display video settings (those are in Video Studio).

#### Scenario: User views settings
- **WHEN** user opens settings
- **THEN** the text SHALL show language, timezone, page size, repost defaults (fast image, source analysis), commit defaults (fast image, auto refine), and repo defaults (auto overview, watch pushes)
- **AND** the keyboard SHALL show category buttons: General, Skills, Platforms, Repost, Commits, Repos, API Keys, and Home
- **AND** the language button SHALL NOT appear directly (it is inside the General sub-page)
- **AND** the default platforms button SHALL NOT appear directly (it is inside the Platforms sub-page)
- **AND** the repost/commit toggle buttons SHALL NOT appear directly (they are inside their respective sub-pages)

#### Scenario: User views settings with stale prompts
- **WHEN** user opens settings and has stale custom prompts
- **THEN** the Skills category button SHALL show a notification badge (e.g., `🧠 Skills 🔔`)

#### Scenario: User views settings without stale prompts
- **WHEN** user opens settings and has no stale custom prompts
- **THEN** the Skills category button SHALL appear without a badge

#### Scenario: Admin views settings
- **WHEN** an admin opens settings
- **THEN** the settings home page SHALL appear the same (admin-specific buttons are inside the Skills sub-page)
