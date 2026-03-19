## MODIFIED Requirements

### Requirement: Commit search scoping
The system SHALL scope commit SHA searches to the authenticated user's GitHub repos by using the user's stored GitHub username as a search qualifier. The system SHALL NOT fall back to unscoped search.

#### Scenario: Scoped search with stored username
- **WHEN** a user searches for a commit SHA and their `github_username` is populated
- **THEN** the system searches using `author:{username}` and `user:{username}` qualifiers only

#### Scenario: No GitHub token configured
- **WHEN** a user searches for a commit SHA and their `GITHUB_TOKEN` is not set
- **THEN** the system SHALL throw `GitHubTokenMissingError` and display the `error.githubTokenMissing` message

#### Scenario: No GitHub username stored
- **WHEN** a user has a GitHub token but no stored `github_username`
- **THEN** the system SHALL return null (commit not found) rather than performing an unscoped search

#### Scenario: Commit not found in user's repos
- **WHEN** the scoped search returns no results
- **THEN** the system SHALL display the `error.commitFetchFailed` message suggesting the commit may not be pushed
