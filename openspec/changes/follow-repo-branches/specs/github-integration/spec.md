## ADDED Requirements

### Requirement: Branch existence verification
The system SHALL provide a `validateBranch(env, owner, repo, branch)` helper that verifies a branch exists on a GitHub repository before it is followed, authenticating with the `GITHUB_TOKEN` carried on the provided `env` (the user's token, populated by `hydrateEnv`; there is no worker-level token). It SHALL return the branch's canonical name on success and a not-found signal otherwise, without exposing the token.

#### Scenario: Branch exists
- **WHEN** `validateBranch` is called for a branch that exists on the repository
- **THEN** it SHALL call `GET /repos/{owner}/{repo}/branches/{branch}` and, on HTTP 200, return the canonical branch name exactly as reported by GitHub (case-preserving)

#### Scenario: Branch does not exist
- **WHEN** the GitHub API returns HTTP 404 for the branch
- **THEN** `validateBranch` SHALL return a not-found result (e.g. `null`)
- **AND** the calling add-branch endpoint SHALL reject the request without persisting the branch

#### Scenario: Branch name with slashes
- **WHEN** the branch name contains `/` (e.g. `release/1.0`)
- **THEN** `validateBranch` SHALL query GitHub such that the full branch name is matched (the `/` is not treated as a path break) and verify it correctly

#### Scenario: Token never exposed on error
- **WHEN** the branch existence check fails with a non-404 error
- **THEN** the error SHALL be handled gracefully, the `GITHUB_TOKEN` SHALL NOT appear in any response or log, and a generic error SHALL surface to the caller

### Requirement: Repository validation returns default branch
The `validateRepo(env, owner, repo)` helper SHALL return the repository's GitHub default branch alongside its canonical owner and name, so callers can seed the initial watched branch correctly instead of assuming `main`.

#### Scenario: Accessible repo returns default branch
- **WHEN** `validateRepo` succeeds for an accessible repository
- **THEN** it SHALL return `{ owner, name, default_branch }` taken from the GitHub repository object's `default_branch` field

#### Scenario: Add paths seed the default branch
- **WHEN** a repository is followed via either the webapp `POST /api/v1/repos` or the Telegram add-repo flow
- **THEN** the new repo's `config.branches` SHALL be seeded with the `default_branch` returned by `validateRepo`
- **AND** the literal `'main'` SHALL be used only as a last-resort fallback when no default branch is available

#### Scenario: Inaccessible repo
- **WHEN** `validateRepo` is called for a repository that is not found or not accessible
- **THEN** it SHALL return null and no default branch SHALL be reported

### Requirement: GitHub helpers authenticate with the per-user token
GitHub API helpers (`validateRepo`, `validateBranch`, `createWebhook`, `searchOwnerRepos`) SHALL authenticate using the `GITHUB_TOKEN` present on the `env` they are given. There SHALL be no worker-level `GITHUB_TOKEN`; the token and `GITHUB_OWNER` are per-user values decrypted from D1 by `hydrateEnv(env, chatId)`. Any request handler that calls these helpers SHALL pass a hydrated env.

#### Scenario: Webapp endpoint hydrates before calling GitHub
- **WHEN** a webapp endpoint (`POST /api/v1/repos`, `POST /api/v1/repos/:id/branches`, or `GET /api/v1/repos/search`) needs to call GitHub
- **THEN** it SHALL first call `hydrateEnv(env, chatId)` and pass the hydrated env to the GitHub helper
- **AND** it SHALL NOT pass the raw request env (whose `GITHUB_TOKEN` is undefined)

#### Scenario: Missing user token surfaces a clear message
- **WHEN** the authenticated user has no stored GitHub token (`hydrateEnv` yields no `GITHUB_TOKEN`)
- **THEN** the endpoint SHALL return an actionable error telling the user to connect their GitHub account
- **AND** it SHALL NOT issue an unauthenticated GitHub request that would 401
