## ADDED Requirements

### Requirement: Repo branches API
The system SHALL provide endpoints to add and remove a repository's watched branches, scoped to the authenticated user's `chat_id`. Adding SHALL verify the branch exists on GitHub before persisting. Both endpoints SHALL be server-authoritative and return the repository's full, updated `config` so the client can refresh its cache without a stale-config race against the toggle `PUT`.

#### Scenario: POST /api/v1/repos/:id/branches (add, exists)
- **WHEN** a POST request is made to `/api/v1/repos/:id/branches` with body `{ branch }` and the branch exists on the repository
- **THEN** the system SHALL append the branch's canonical name to `config.branches` (idempotent — no duplicate), persist it, and respond with `{ success: true, config }`

#### Scenario: POST /api/v1/repos/:id/branches (add, not found)
- **WHEN** a POST request is made with a branch that does not exist on the repository
- **THEN** the system SHALL NOT modify `config.branches`
- **AND** SHALL respond with HTTP 422 and `{ error }` indicating the branch was not found

#### Scenario: POST /api/v1/repos/:id/branches (missing branch)
- **WHEN** a POST request is made with an empty or missing `branch`
- **THEN** the system SHALL respond with HTTP 400 and `{ error }`

#### Scenario: DELETE /api/v1/repos/:id/branches (remove)
- **WHEN** a DELETE request is made to `/api/v1/repos/:id/branches?branch=<urlencoded>`
- **THEN** the system SHALL remove that branch from `config.branches` (if present), persist it, and respond with `{ success: true, config }` — including when the resulting set is empty

#### Scenario: Ownership enforced
- **WHEN** a branches request targets a repo not owned by the authenticated `chat_id`
- **THEN** the system SHALL respond with HTTP 404 and make no change

#### Scenario: GitHub auth uses the user's token
- **WHEN** the add-branch endpoint verifies a branch
- **THEN** it SHALL call `hydrateEnv(env, chatId)` and verify with the user's GitHub token (not the raw request env)
- **AND** if the user has no GitHub token, it SHALL return an actionable "connect your GitHub account" error rather than issuing a request that 401s

## MODIFIED Requirements

### Requirement: Repo search API
The system SHALL provide an endpoint backing the inline repo search that queries the user's accessible GitHub repositories using the user's GitHub token and username, both obtained via `hydrateEnv(env, chatId)` (decrypted from D1). There is no worker-level `GITHUB_TOKEN`/`GITHUB_OWNER`.

#### Scenario: GET /api/v1/repos/search
- **WHEN** a GET request is made to `/api/v1/repos/search?q=<query>`
- **THEN** the system SHALL hydrate the user's env and return `{ results: Array<{ full_name, description, private }> }` of repositories accessible to the user's token, scoped to the user's GitHub username, matching the query

#### Scenario: Empty query
- **WHEN** the query is empty or whitespace
- **THEN** the endpoint SHALL return an empty result set without a GitHub call

#### Scenario: No GitHub token
- **WHEN** the authenticated user has no stored GitHub token
- **THEN** the endpoint SHALL return an empty result set (or an actionable error) and SHALL NOT issue an unauthenticated GitHub request

### Requirement: Repos CRUD API
The system SHALL provide full CRUD operations for watched repositories. Creating a repository SHALL validate its accessibility, seed the repository's actual GitHub default branch as the initial watched branch, and create the GitHub webhook.

#### Scenario: GET /api/v1/repos
- **WHEN** a GET request is made to `/api/v1/repos`
- **THEN** the response SHALL include all repos for the authenticated user with their config and overview status

#### Scenario: POST /api/v1/repos
- **WHEN** a POST request is made with `{ owner, repo }` body
- **THEN** the system SHALL validate the repository is accessible, determine its default branch, create a new repo entry with `config.branches` seeded to that default branch, and set up the GitHub webhook

#### Scenario: POST /api/v1/repos (inaccessible repo)
- **WHEN** a POST request references a repository that is not accessible
- **THEN** the system SHALL respond with an error and SHALL NOT create a repo entry or webhook

#### Scenario: PUT /api/v1/repos/:id
- **WHEN** a PUT request is made with config updates
- **THEN** the repo config SHALL be updated in D1

#### Scenario: DELETE /api/v1/repos/:id
- **WHEN** a DELETE request is made
- **THEN** the repo SHALL be deleted along with its webhook
