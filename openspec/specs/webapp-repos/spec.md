## ADDED Requirements

### Requirement: Repos list page
The system SHALL display all watched repositories as a list with status indicators.

#### Scenario: Repos list loads
- **WHEN** the user navigates to `/#/repos`
- **THEN** the system SHALL fetch and display all repos with: owner/repo name, watching status (active/paused), watch PRs toggle status, watch pushes toggle status, overview status (bootstrapped/none)

#### Scenario: No repos
- **WHEN** the user has no repositories
- **THEN** the page SHALL display "No repositories added" with an "Add Repository" button

### Requirement: Add repository
The system SHALL allow adding a new repository via owner/repo input.

#### Scenario: Add repo form
- **WHEN** the user taps "Add Repository"
- **THEN** a form SHALL appear with a text input for `owner/repo` format (e.g., `facebook/react`)

#### Scenario: Submit add repo
- **WHEN** the user enters a valid owner/repo and taps "Add"
- **THEN** the system SHALL call `POST /api/v1/repos`, show a loading state, and upon success, add the new repo to the list and set up the GitHub webhook

#### Scenario: Invalid format
- **WHEN** the user enters text that doesn't match `owner/repo` format
- **THEN** the input SHALL show a validation error

### Requirement: Repo detail page
The system SHALL display full repo configuration on a detail page.

#### Scenario: Repo detail loads
- **WHEN** the user navigates to `/#/repo/:id`
- **THEN** the page SHALL display: repo name, watching status, watch PRs toggle, watch pushes toggle, branch configuration, overview text (if bootstrapped)

#### Scenario: Inline overview editing
- **WHEN** the user taps "Edit Overview" on the repo detail page
- **THEN** the overview text SHALL become editable in a full-size textarea (no Telegram message character limits), with a "Save" button

#### Scenario: Save overview
- **WHEN** the user edits the overview and taps "Save"
- **THEN** the updated overview SHALL be saved via API

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
