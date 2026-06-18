## Purpose

Covers watched-repository management in the webapp: listing repos with their watch and overview status, adding and deleting repos (including GitHub webhook setup and cleanup), a detail page with inline overview editing, watch-PRs/watch-pushes toggles, pause/resume watching, and bootstrapping or re-bootstrapping the project overview.

## Requirements

### Requirement: Repos list page
The system SHALL display all watched repositories as a list with status indicators.

#### Scenario: Repos list loads
- **WHEN** the user navigates to `/#/repos`
- **THEN** the system SHALL fetch and display all repos with: owner/repo name, watching status (active/paused), watch PRs toggle status, watch pushes toggle status, overview status (bootstrapped/none)

#### Scenario: No repos
- **WHEN** the user has no repositories
- **THEN** the page SHALL display "No repositories added" with an "Add Repository" button

### Requirement: Inline GitHub repo search to add
The Repos screen SHALL provide an inline search that queries the user's accessible GitHub repositories (via a backing search endpoint using `GITHUB_TOKEN`, scoped to `GITHUB_OWNER`) and shows results inline as the user types. Selecting a result SHALL add (save) that repository and immediately open its detail page for configuration.

#### Scenario: Inline results as you type
- **WHEN** the user types a query into the repo search field
- **THEN** the app SHALL show matching accessible repositories inline (full name + brief info), debounced

#### Scenario: Select a result adds and opens detail
- **WHEN** the user taps a search result
- **THEN** the system SHALL add the repository via the existing add endpoint (which validates accessibility) and navigate directly to that repo's detail page

#### Scenario: No matches
- **WHEN** the query matches no accessible repository
- **THEN** the search SHALL show an empty result state without error

### Requirement: Add repository
The system SHALL allow adding a repository through the inline GitHub search (type → inline results → tap to add), replacing the manual `owner/repo` text-entry form.

#### Scenario: Add via search selection
- **WHEN** the user selects a repository from the inline search results
- **THEN** the system SHALL call `POST /api/v1/repos`, show a brief loading state, add the repo, set up the GitHub webhook, and open the repo detail page

#### Scenario: Add fails (inaccessible)
- **WHEN** adding a selected repository fails server-side validation
- **THEN** the app SHALL show an actionable error and remain on the search

### Requirement: Repo detail page
The repo detail page SHALL mirror the bot's repo detail exactly — no more, no less — using native components and chrome. It SHALL show: `owner/repo`, watching status, a watch on/off control, a Watch-PRs toggle, a Watch-Pushes toggle, the branch configuration, and the Project Overview (summary, key-feature count, visual theme) with Edit and Re-bootstrap actions (or Bootstrap when none exists), plus Delete.

#### Scenario: Repo detail loads with the bot's fields
- **WHEN** the user opens a repo's detail page
- **THEN** the page SHALL display owner/repo, watching status, Watch-PRs toggle, Watch-Pushes toggle, branches, and the Project Overview (summary/features/visual theme)

#### Scenario: Inline overview editing
- **WHEN** the user taps "Edit Overview"
- **THEN** the overview text SHALL become editable in a full-size field (no Telegram character limits) with a Save action

#### Scenario: Save overview
- **WHEN** the user edits the overview and taps "Save"
- **THEN** the updated overview SHALL be saved via API

#### Scenario: Bootstrap or re-bootstrap from detail
- **WHEN** the repo has no overview and the user taps "Bootstrap", or has one and taps "Re-bootstrap"
- **THEN** the system SHALL (re)generate the overview via API, showing a loading state, with native confirmation before re-bootstrapping an existing overview

#### Scenario: No fields beyond the bot's
- **WHEN** the repo detail renders
- **THEN** it SHALL NOT introduce configuration beyond what the bot exposes (watch/PRs/pushes/branches/overview/delete)

### Requirement: Repo configuration toggles
The system SHALL allow toggling repo configuration: watch PRs, watch pushes.

#### Scenario: Toggle watch PRs
- **WHEN** the user toggles "Watch PRs"
- **THEN** the change SHALL be saved via API immediately

#### Scenario: Toggle watch pushes
- **WHEN** the user toggles "Watch Pushes"
- **THEN** the change SHALL be saved via API immediately

### Requirement: Repo watch/pause control
The system SHALL allow pausing and resuming watching for a repository.

#### Scenario: Pause watching
- **WHEN** the user taps "Pause Watching" on an active repo
- **THEN** the repo's `is_watching` SHALL be set to 0 via API, and the status indicator SHALL update

#### Scenario: Resume watching
- **WHEN** the user taps "Resume Watching" on a paused repo
- **THEN** the repo's `is_watching` SHALL be set to 1 via API, and the status indicator SHALL update

### Requirement: Bootstrap/re-bootstrap overview
The system SHALL allow bootstrapping or re-bootstrapping the project overview.

#### Scenario: Bootstrap new overview
- **WHEN** the repo has no overview and the user taps "Bootstrap Overview"
- **THEN** the system SHALL call the bootstrap API, show a loading state, and upon completion, display the generated overview

#### Scenario: Re-bootstrap existing overview
- **WHEN** the repo has an existing overview and the user taps "Re-bootstrap"
- **THEN** a confirmation dialog SHALL appear, and on confirm, the overview SHALL be regenerated

### Requirement: Delete repo
The system SHALL allow deleting a repository with confirmation.

#### Scenario: Delete repo
- **WHEN** the user taps "Delete" on a repo
- **THEN** a confirmation dialog SHALL appear. On confirm, the repo SHALL be deleted via API (including webhook cleanup), and the user SHALL be navigated back to the repos list
