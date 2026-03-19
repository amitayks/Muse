## MODIFIED Requirements

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
- **THEN** the branch SHALL be parsed from `ref` (e.g., `refs/heads/main` → `main`)
- **AND** pushes to non-watched branches SHALL be ignored

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
