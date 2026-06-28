## Purpose

This capability secures and processes GitHub webhooks and API access: it verifies webhook signatures with timing-safe comparison, validates event types, repos, branches, and payloads, and protects the API token and error responses. On valid events it creates a `commit_events` row (rather than auto-generating content) and sends an event-summary notification with Fast/Edit buttons, deduplicating retries. It also scopes commit-SHA searches to the authenticated user's GitHub repos.
## Requirements
### Requirement: Webhook Signature Verification
All GitHub webhook requests SHALL be cryptographically verified.

#### Scenario: Valid signature accepted
- **WHEN** a GitHub webhook request arrives with valid `X-Hub-Signature-256` header
- **THEN** the signature SHALL be verified against `GITHUB_WEBHOOK_SECRET`
- **AND** the request SHALL be processed

#### Scenario: Invalid signature rejected
- **WHEN** a GitHub webhook request arrives with invalid signature
- **THEN** the request SHALL be rejected with 401 Unauthorized
- **AND** no webhook processing SHALL occur
- **AND** no data SHALL be created or modified

#### Scenario: Missing signature rejected
- **WHEN** a GitHub webhook request arrives without `X-Hub-Signature-256` header
- **THEN** the request SHALL be rejected with 401 Unauthorized
- **AND** no webhook processing SHALL occur

#### Scenario: Timing-safe signature comparison
- **WHEN** a webhook signature is verified
- **THEN** `crypto.subtle.timingSafeEqual` SHALL be used for comparison
- **AND** timing attacks SHALL NOT be possible
- **AND** comparison time SHALL NOT vary based on input

### Requirement: Webhook Event Validation
GitHub webhook events SHALL be validated before processing.

#### Scenario: Event type validated
- **WHEN** a GitHub webhook event is received
- **THEN** the `X-GitHub-Event` header SHALL be checked
- **AND** only expected event types SHALL be processed (`pull_request`, `push`)
- **AND** unexpected event types SHALL be ignored safely

#### Scenario: Repository validation
- **WHEN** a GitHub webhook event is processed
- **THEN** the repository SHALL be checked against watched repos
- **AND** events from unwatched repos SHALL be ignored
- **AND** no data SHALL be created for unwatched repos

#### Scenario: Payload structure validated
- **WHEN** a GitHub webhook payload is parsed
- **THEN** required fields SHALL be validated
- **AND** malformed payloads SHALL be rejected gracefully
- **AND** missing fields SHALL NOT cause unhandled errors

#### Scenario: Branch validation for PR events
- **WHEN** a PR merge webhook is received
- **THEN** the target branch (`pull_request.base.ref`) SHALL be checked against the repo's watched branches
- **AND** PRs merged to non-watched branches SHALL be ignored

#### Scenario: Branch validation for push events
- **WHEN** a push webhook is received
- **THEN** the branch SHALL be parsed from `ref` (e.g., `refs/heads/main` -> `main`)
- **AND** pushes to non-watched branches SHALL be ignored

### Requirement: GitHub API Token Security
The GitHub API token SHALL be used securely.

#### Scenario: Token not exposed in responses
- **WHEN** GitHub API calls are made
- **THEN** the `GITHUB_TOKEN` SHALL NOT appear in any user-facing response
- **AND** the token SHALL NOT be logged
- **AND** API errors SHALL NOT reveal the token

#### Scenario: Token has minimal permissions
- **WHEN** the GitHub token is configured
- **THEN** it SHOULD have only required scopes (`repo`, `admin:repo_hook`)
- **AND** excessive permissions SHOULD be avoided

#### Scenario: Token used over HTTPS only
- **WHEN** GitHub API calls are made
- **THEN** all requests SHALL use HTTPS
- **AND** the token SHALL NOT be sent over unencrypted connections

### Requirement: GitHub API Error Handling
GitHub API errors SHALL be handled securely.

#### Scenario: API rate limit handled
- **WHEN** GitHub API returns 403 rate limit exceeded
- **THEN** the error SHALL be handled gracefully
- **AND** the user SHALL be notified appropriately
- **AND** no sensitive information SHALL be revealed

#### Scenario: API authentication errors handled
- **WHEN** GitHub API returns 401 Unauthorized
- **THEN** the error SHALL NOT reveal the token
- **AND** a generic error message SHALL be returned
- **AND** the issue SHALL be logged for debugging

#### Scenario: API not found errors handled
- **WHEN** GitHub API returns 404 Not Found
- **THEN** the user SHALL receive a helpful message
- **AND** internal API paths SHALL NOT be revealed

### Requirement: Webhook URL Security
GitHub webhook configuration SHALL be secure.

#### Scenario: Webhook URL uses HTTPS
- **WHEN** a webhook is created on GitHub
- **THEN** the callback URL SHALL use HTTPS
- **AND** HTTP URLs SHALL NOT be used

#### Scenario: Webhook secret is strong
- **WHEN** a webhook is configured
- **THEN** `GITHUB_WEBHOOK_SECRET` SHALL be cryptographically random
- **AND** the secret SHALL be at least 32 characters
- **AND** the secret SHALL NOT be a common or guessable value

#### Scenario: Webhook URL not hardcoded
- **WHEN** webhook URLs are configured
- **THEN** the worker URL SHOULD be derived from environment or request
- **AND** hardcoded URLs SHOULD be avoided for flexibility

### Requirement: Repository Data Handling
Repository data from GitHub SHALL be handled securely.

#### Scenario: Sensitive repo data protected
- **WHEN** repository information is processed
- **THEN** private repo content SHALL be treated as confidential
- **AND** repo data SHALL only be visible to authorized users
- **AND** repo data SHALL be associated with correct `chat_id`

#### Scenario: Commit data sanitized
- **WHEN** commit messages and diffs are processed
- **THEN** the data SHALL be sanitized before storage
- **AND** excessively large diffs SHALL be truncated
- **AND** binary content SHALL be handled appropriately

#### Scenario: User attribution preserved
- **WHEN** PR or commit data is processed
- **THEN** author information SHALL be preserved accurately
- **AND** author data SHALL NOT be modified or spoofed

### Requirement: Webhook handler creates commit event instead of auto-generating
The webhook handler SHALL NOT call `generateContent` or `createDraft`. Instead, it SHALL create a `commit_events` row and send a notification with action buttons.

#### Scenario: PR merged webhook creates commit event
- **WHEN** a PR merge webhook is received for a watched branch
- **THEN** the handler SHALL call `getPR(env, repoFullName, pr.number)` to fetch full PR data (commits, files)
- **AND** build a `ContentSource` of type `'pr'` with the full `PRData`
- **AND** call `createCommitEvent` with: `repoId` (matched repo ID), `chatId`, `eventType: 'pr'`, `commitSha: pr.head.sha`, `prNumber: pr.number`, `title: pr.title`, `author: pr.user.login`, `branch: pr.base.ref`, `filesChanged: prData.files_changed`, `additions: prData.additions`, `deletions: prData.deletions`, `commitCount: prData.commitMessages.length`, `sourceData: JSON.stringify(contentSource)`, `eventAt: pr.merged_at`
- **AND** the handler SHALL NOT call `generateContent`
- **AND** the handler SHALL NOT call `createDraft`

#### Scenario: Push webhook creates commit event
- **WHEN** a push webhook is received for a watched branch with a head commit
- **THEN** the handler SHALL build a `ContentSource` of type `'commit'` from the payload
- **AND** call `createCommitEvent` with: `repoId`, `chatId`, `eventType: 'push'`, `commitSha: headCommit.id`, `title: headCommit.message` (first line), `author: headCommit.author.username || headCommit.author.name`, `branch` (parsed from `ref`), `filesChanged` (deduplicated file count from all commits), `additions: 0`, `deletions: 0`, `commitCount: event.commits.length`, `sourceData: JSON.stringify(contentSource)`, `eventAt: headCommit.timestamp`
- **AND** the handler SHALL NOT call `generateContent`
- **AND** the handler SHALL NOT call `createDraft`

#### Scenario: Duplicate commit event detection
- **WHEN** a webhook event arrives for a `commitSha` that already has a `commit_events` row for this `chatId`
- **THEN** the handler SHALL skip processing
- **AND** return `{ processed: true, message: 'Event already exists for commit ...' }`

### Requirement: Webhook notification format shows event summary
The webhook notification SHALL show commit/PR metadata without generated content preview, since no content is generated at notification time.

#### Scenario: PR event notification message
- **WHEN** a PR merge event is created
- **THEN** the notification message SHALL show:
  - Event type emoji (`🔀`)
  - PR label (e.g., "PR Merged #42")
  - Repo name as code block
  - Title
  - Author
  - Stats line (files changed, additions, deletions)
- **AND** SHALL NOT show any generated tweet content or preview

#### Scenario: Push event notification message
- **WHEN** a push event is created
- **THEN** the notification message SHALL show:
  - Event type emoji (`📤`)
  - Push label (e.g., "3 commits pushed")
  - Repo name as code block
  - Title (head commit message)
  - Author
  - Stats line (files changed, commit count)
- **AND** SHALL NOT show any generated tweet content or preview

#### Scenario: Notification button layout before generation
- **WHEN** a commit event notification is sent
- **THEN** the buttons SHALL be: `[⚡ Fast] [✏️ Edit]` on a single row
- **AND** the Fast button callback_data SHALL be `action:fast_commit:{eventId}`
- **AND** the Edit button callback_data SHALL be `action:edit_compose:{eventId}`

#### Scenario: Notification message ID stored on event
- **WHEN** the notification is sent successfully
- **THEN** the returned `message_id` SHALL be stored on the commit event via `updateCommitEvent(env, eventId, { messageId })`
- **AND** this enables the notification to be edited in-place when the user clicks Fast

### Requirement: Duplicate event handling
GitHub webhooks SHALL be protected against creating duplicate events.

#### Scenario: Duplicate PR event
- **WHEN** the same PR merge webhook is received twice (GitHub retry)
- **THEN** the second invocation SHALL detect the existing `commit_events` row via `getCommitEventByCommitSha`
- **AND** no duplicate event SHALL be created
- **AND** no duplicate notification SHALL be sent

#### Scenario: Duplicate push event
- **WHEN** the same push webhook is received twice
- **THEN** the second invocation SHALL detect the existing `commit_events` row
- **AND** no duplicate event SHALL be created

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

