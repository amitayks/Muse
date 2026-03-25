## MODIFIED Requirements

### Requirement: Bootstrap overview via /overview command
The system SHALL provide an `/overview owner/repo` Telegram command that bootstraps a repo overview by fetching the README and recent merged PRs from GitHub API, sending them to Gemini for structured extraction, and storing the result in `repo_overviews`.

#### Scenario: Bootstrap with README and PRs available
- **WHEN** user sends `/overview owner/repo` for a watched repo with a README
- **THEN** the system SHALL fetch the README via `GET /repos/{owner}/{repo}/readme` (base64 decoded)
- **AND** fetch the last 10 merged PRs via `GET /repos/{owner}/{repo}/pulls?state=closed&sort=updated&per_page=10`
- **AND** send the content to Gemini with a structured extraction prompt
- **AND** store the extracted overview in `repo_overviews`
- **AND** send a preview message to the user via Telegram

#### Scenario: Bootstrap for repo without README
- **WHEN** user sends `/overview owner/repo` for a repo with no README
- **THEN** the system SHALL fall back to using only PR titles and commit patterns
- **AND** still produce a usable overview with available information

#### Scenario: Bootstrap for unwatched repo
- **WHEN** user sends `/overview owner/repo` for a repo not in the `repos` table
- **THEN** the system SHALL respond with an error message instructing the user to watch the repo first

#### Scenario: Re-bootstrap existing overview
- **WHEN** user sends `/overview owner/repo` for a repo that already has an overview
- **THEN** the system SHALL overwrite the existing overview with freshly extracted data
- **AND** reset the version counter to 1

#### Scenario: Auto-bootstrap on repo add gated by user setting
- **WHEN** a new repo is added via the add-repo input flow
- **AND** the user's `repo_auto_overview` setting is `1` (ON)
- **THEN** the system SHALL auto-bootstrap the overview in the background (non-blocking)

#### Scenario: No auto-bootstrap when setting is off
- **WHEN** a new repo is added via the add-repo input flow
- **AND** the user's `repo_auto_overview` setting is `0` (OFF, default)
- **THEN** the system SHALL NOT auto-bootstrap the overview
- **AND** the repo detail page SHALL show a "Bootstrap Overview" button for manual triggering
