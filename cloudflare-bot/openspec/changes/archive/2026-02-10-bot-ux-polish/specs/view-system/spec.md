## MODIFIED Requirements

### Requirement: Views split into domain-specific files
The monolithic `views/index.ts` SHALL be split into domain-specific modules: `views/home.ts` for general views, `views/drafts.ts` for draft-related views, and `views/repos.ts` for repository-related views.

#### Scenario: Home views in home.ts
- **WHEN** `renderHome()`, `renderHelp()`, `renderError()`, `renderSuccess()`, `renderGenerating()`, or `renderPublishing()` is needed
- **THEN** it is imported from `views/home.ts`
- **AND** `renderHome()` SHALL accept `env` and `chatId` parameters (async)

#### Scenario: Draft views in drafts.ts
- **WHEN** `renderDraftCategories()`, `renderDraftsList()`, `renderDraftDetail()`, `renderGeneratePrompt()`, `renderSchedulePrompt()`, or `renderDeletePrompt()` is needed
- **THEN** it is imported from `views/drafts.ts`

#### Scenario: Repo views in repos.ts
- **WHEN** `renderReposList()`, `renderRepoDetail()`, `renderAddRepo()`, or `renderDeleteRepoConfirm()` is needed
- **THEN** it is imported from `views/repos.ts`
- **AND** `renderRepoConfig()` SHALL be removed (merged into `renderRepoDetail()`)

## ADDED Requirements

### Requirement: Draft categories navigation view
The system SHALL provide a `renderDraftCategories(env, chatId)` view that shows draft category buttons with counts: Auto-generated, Approved (ready to publish), and Scheduled.

#### Scenario: Categories with drafts
- **WHEN** `renderDraftCategories()` is called and drafts exist
- **THEN** it SHALL show buttons for each category with their count in parentheses
- **AND** buttons SHALL be stacked vertically (one per row)

#### Scenario: Empty state
- **WHEN** `renderDraftCategories()` is called and no drafts exist
- **THEN** it SHALL show a message encouraging content generation with a Generate button

### Requirement: Draft list vertical stacking with 10 per page
The draft list SHALL display buttons stacked vertically (one button per row) with up to 10 items per page. Button text SHALL include status emoji, PR number, and title truncated to 40 characters.

#### Scenario: Draft list layout
- **WHEN** `renderDraftsList()` renders a page of drafts
- **THEN** each draft SHALL be a single button on its own row
- **AND** the page SHALL show up to 10 drafts
- **AND** button text SHALL show status emoji, PR number, and truncated title

#### Scenario: Draft list pagination with type
- **WHEN** the user navigates pages in a filtered draft list
- **THEN** pagination callbacks SHALL include the list type (e.g., `page:auto:1`, `page:approved:0`)
- **AND** the correct filtered results SHALL be returned

### Requirement: Draft list accepts status filter
The `renderDraftsList()` function SHALL accept an optional status filter parameter to show only drafts matching specific statuses.

#### Scenario: Auto-generated filter
- **WHEN** `renderDraftsList()` is called with filter `auto`
- **THEN** it SHALL show drafts with status `draft` or `rejected`

#### Scenario: Approved filter
- **WHEN** `renderDraftsList()` is called with filter `approved`
- **THEN** it SHALL show only drafts with status `approved`

#### Scenario: Scheduled filter
- **WHEN** `renderDraftsList()` is called with filter `scheduled`
- **THEN** it SHALL show only drafts with status `scheduled` ordered by `scheduled_at ASC`

### Requirement: Repo list vertical stacking with pagination
The repo list SHALL display buttons stacked vertically (one button per row) with up to 10 items per page.

#### Scenario: Repo list layout
- **WHEN** `renderReposList()` renders repos
- **THEN** each repo SHALL be a single button on its own row
- **AND** pages SHALL show up to 10 repos

#### Scenario: Repo pagination
- **WHEN** the user has more than 10 repos
- **THEN** pagination buttons SHALL appear with callbacks like `page:repos:1`

### Requirement: Merged repo detail and config view
The `renderRepoDetail()` view SHALL include all configuration toggle buttons inline, replacing the separate `renderRepoConfig()` screen.

#### Scenario: Repo detail shows config toggles
- **WHEN** a user views a specific repo
- **THEN** they SHALL see config toggles (language, hashtags, PRs, pushes, thread image, single image probability) as inline buttons
- **AND** they SHALL see action buttons (stop/start watching, delete)
- **AND** there SHALL be no separate "Edit" button

#### Scenario: Config toggle updates merged view
- **WHEN** a user taps a config toggle button
- **THEN** the config SHALL update and the merged repo detail view SHALL re-render

### Requirement: Approve action returns draft detail
The approve action SHALL update the draft status and return `renderDraftDetail()` so the user stays on the same screen with updated buttons.

#### Scenario: Approve draft inline transition
- **WHEN** user clicks "Approve" on a draft detail screen
- **THEN** the draft status SHALL change to `approved`
- **AND** the screen SHALL re-render as draft detail with approved-state buttons (Publish Now, Schedule, Cancel)

### Requirement: Publish action returns draft detail with URL
The publish action SHALL publish the draft and return `renderDraftDetail()` which shows published state with a "View on X" URL button.

#### Scenario: Publish draft inline transition
- **WHEN** user clicks "Publish Now" on an approved draft
- **THEN** the draft SHALL be published to X
- **AND** the screen SHALL re-render as draft detail in published state
- **AND** a "View on X" button with the tweet URL SHALL be shown

### Requirement: Draft detail shows published state with URL button
The `renderDraftDetail()` view SHALL handle published status by showing the tweet content and a URL button to view the post on X.

#### Scenario: Published draft detail view
- **WHEN** `renderDraftDetail()` is called for a published draft
- **THEN** it SHALL show the tweet content
- **AND** it SHALL include a "View on X" button using Telegram's URL button feature
- **AND** no action buttons (approve, edit, reject) SHALL be shown

### Requirement: InlineButton type supports URL buttons
The `InlineButton` type SHALL support an optional `url` field for Telegram URL buttons alongside the existing `callback_data` field.

#### Scenario: URL button in keyboard
- **WHEN** a ViewResult keyboard includes a button with `url` field
- **THEN** the Telegram API call SHALL send it as a URL button (not callback)
