## ADDED Requirements

### Requirement: Repo selector for generation
The system SHALL display a dropdown of the user's watched repositories for selecting the source of commit generation.

#### Scenario: Repos loaded in dropdown
- **WHEN** the generate page loads
- **THEN** the system SHALL fetch the user's watched repos and display them in a dropdown selector

#### Scenario: No repos configured
- **WHEN** the user has no watched repositories
- **THEN** the page SHALL display "No repos configured" with a link to `/#/repos` to add one

### Requirement: Commit SHA input
The system SHALL allow the user to input a commit SHA for tweet generation.

#### Scenario: Paste commit SHA
- **WHEN** the user pastes a commit SHA into the input field and taps "Generate"
- **THEN** the system SHALL call `POST /api/v1/generate` with the repo and SHA, show a loading state, and upon completion, navigate to the draft editor for the newly created draft

#### Scenario: Invalid SHA format
- **WHEN** the user enters a string that is not a valid hex SHA (7-40 characters)
- **THEN** the input SHALL show a validation error "Invalid commit SHA format"

### Requirement: Recent PRs browser
The system SHALL display a list of recent PRs/commits from the selected repository for easy generation.

#### Scenario: Recent PRs list
- **WHEN** the user selects a repository from the dropdown
- **THEN** the system SHALL display a list of recent merged PRs (up to 10) with: PR number, title, commit SHA (abbreviated), author, and time ago

#### Scenario: Generate from PR
- **WHEN** the user taps the "Generate" button on a PR in the list
- **THEN** the system SHALL generate a tweet from that PR's head commit SHA, show a loading state, and navigate to the draft editor upon completion

### Requirement: Generation options
The system SHALL provide toggles for generation options: Fast Image and Fast AI.

#### Scenario: Toggle defaults from settings
- **WHEN** the generate page loads
- **THEN** the Fast Image and Fast AI toggles SHALL reflect the user's default settings (`commit_fast_image`, `commit_fast_ai`)

#### Scenario: Override toggle for single generation
- **WHEN** the user changes a toggle before generating
- **THEN** the generation SHALL use the overridden value for this generation only (does not change settings)

### Requirement: Generation loading state
The system SHALL show a detailed loading state during content generation.

#### Scenario: Loading with progress
- **WHEN** a generation is in progress
- **THEN** the page SHALL show a loading indicator with text "Finding PR...", "Generating content...", "Generating image..." as the process progresses
