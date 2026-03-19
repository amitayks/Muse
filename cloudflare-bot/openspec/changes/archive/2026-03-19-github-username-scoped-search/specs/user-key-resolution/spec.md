## MODIFIED Requirements

### Requirement: Env hydration includes GitHub username
The `hydrateEnv` function SHALL populate `env.GITHUB_OWNER` from the user's stored `github_username` field. This makes the GitHub username available to all downstream consumers via the standard env object.

#### Scenario: User has github_username stored
- **WHEN** env is hydrated for a user with `github_username` = "octocat"
- **THEN** `env.GITHUB_OWNER` SHALL be set to "octocat"

#### Scenario: User has no github_username
- **WHEN** env is hydrated for a user with `github_username` = null
- **THEN** `env.GITHUB_OWNER` SHALL remain undefined
