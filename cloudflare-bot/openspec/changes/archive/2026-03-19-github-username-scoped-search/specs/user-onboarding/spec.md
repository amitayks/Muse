## MODIFIED Requirements

### Requirement: GitHub token storage captures username
When a user provides their GitHub token during onboarding or via settings, the system SHALL extract the `login` field from the `GET /user` validation response and store it as `github_username` on the user record.

#### Scenario: GitHub token set during onboarding
- **WHEN** user provides a valid GitHub token in the onboarding flow
- **THEN** the system stores `github_token_enc`, sets `has_github=1`, AND stores `github_username` from the API response

#### Scenario: GitHub token updated via settings
- **WHEN** user updates their GitHub token via Settings > API Keys
- **THEN** the system stores the new `github_token_enc`, sets `has_github=1`, AND updates `github_username` from the API response
