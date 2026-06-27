## ADDED Requirements

### Requirement: Manage watched branches
The repo detail page SHALL let the user add and remove the branches a repository is watched on. Each watched branch SHALL render as a removable chip; an add control SHALL accept a branch name by inline text entry and persist it only after server-side existence verification. Removing the last branch SHALL be allowed.

#### Scenario: Branches render as removable chips
- **WHEN** the repo detail page loads
- **THEN** each entry in `config.branches` SHALL render as a chip showing the branch name with a remove (`×`) affordance
- **AND** an add (`+`) affordance SHALL be shown alongside the chips

#### Scenario: Reveal the add input
- **WHEN** the user taps the add (`+`) affordance
- **THEN** an inline text input SHALL appear for typing a branch name, with a confirm (Add) action

#### Scenario: Add an existing branch
- **WHEN** the user enters a branch name that exists on the repository and confirms
- **THEN** the app SHALL call `POST /api/v1/repos/:id/branches`, show a `verifying…` state, and on success add the branch chip and refresh the cached repo config from the response

#### Scenario: Add a non-existent branch
- **WHEN** the user enters a branch name that does not exist on the repository and confirms
- **THEN** the request SHALL fail verification and the app SHALL show a "branch not found" message
- **AND** no chip SHALL be added and `config.branches` SHALL be unchanged

#### Scenario: Add a duplicate branch
- **WHEN** the user adds a branch already present in `config.branches`
- **THEN** the set SHALL remain unchanged (idempotent) and the app MAY indicate the branch is already followed

#### Scenario: Remove a branch
- **WHEN** the user taps the remove (`×`) on a branch chip
- **THEN** the app SHALL call `DELETE /api/v1/repos/:id/branches?branch=<name>`, remove the chip, and refresh the cached repo config from the response

#### Scenario: Remove the last branch
- **WHEN** the user removes the only remaining branch
- **THEN** the removal SHALL succeed leaving `config.branches` empty
- **AND** the page SHALL indicate that no branches are being watched (push/PR events will not be detected until a branch is added)

## MODIFIED Requirements

### Requirement: Repo detail page
The repo detail page SHALL mirror the bot's repo detail using native components and chrome, with the branch configuration made editable. It SHALL show: `owner/repo`, watching status, a watch on/off control, a Watch-PRs toggle, a Watch-Pushes toggle, the watched-branches configuration (as add/removable chips), and the Project Overview (summary, key-feature count, visual theme) with Edit and Re-bootstrap actions (or Bootstrap when none exists), plus Delete.

#### Scenario: Repo detail loads with the bot's fields
- **WHEN** the user opens a repo's detail page
- **THEN** the page SHALL display owner/repo, watching status, Watch-PRs toggle, Watch-Pushes toggle, the watched-branches (as chips), and the Project Overview (summary/features/visual theme)

#### Scenario: Inline overview editing
- **WHEN** the user taps "Edit Overview"
- **THEN** the overview text SHALL become editable in a full-size field (no Telegram character limits) with a Save action

#### Scenario: Save overview
- **WHEN** the user edits the overview and taps "Save"
- **THEN** the updated overview SHALL be saved via API

#### Scenario: Bootstrap or re-bootstrap from detail
- **WHEN** the repo has no overview and the user taps "Bootstrap", or has one and taps "Re-bootstrap"
- **THEN** the system SHALL (re)generate the overview via API, showing a loading state, with native confirmation before re-bootstrapping an existing overview

#### Scenario: Branch editing beyond the bot
- **WHEN** the repo detail renders
- **THEN** it MAY expose add/remove branch management even though the bot's detail does not, while introducing no other configuration beyond the bot's (watch/PRs/pushes/branches/overview/delete)

### Requirement: Add repository
The system SHALL allow adding a repository through the inline GitHub search (type → inline results → tap to add), replacing the manual `owner/repo` text-entry form. On add, the system SHALL seed the repository's actual default branch (as reported by GitHub) as the initial watched branch rather than assuming `main`.

#### Scenario: Add via search selection
- **WHEN** the user selects a repository from the inline search results
- **THEN** the system SHALL call `POST /api/v1/repos`, show a brief loading state, validate accessibility, add the repo seeded with its GitHub default branch, set up the GitHub webhook, and open the repo detail page

#### Scenario: Default branch is not "main"
- **WHEN** the added repository's default branch is not `main` (e.g. `master`, `trunk`, `develop`)
- **THEN** the repo's initial `config.branches` SHALL contain that actual default branch
- **AND** events on that branch SHALL be detected without the user having to fix the branch manually

#### Scenario: Add fails (inaccessible)
- **WHEN** adding a selected repository fails server-side validation
- **THEN** the app SHALL show an actionable error and remain on the search
