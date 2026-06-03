## Purpose

This capability defines the `commit_events` table and its data layer for storing code-change events (from webhooks and `/generate`) before any AI generation. It specifies the table schema and indexes, a `notified`/`drafted`/`skipped` status lifecycle, CRUD functions (`createCommitEvent`, `getCommitEvent`, `getCommitEventByCommitSha`, `updateCommitEvent`) with deduplication by `chat_id + commit_sha`, and the `drafts.event_id` linkage that replaces the removed `source_data` column on drafts.

## Requirements

### Requirement: commit_events table schema
The database SHALL have a `commit_events` table that stores code change events (from webhooks and `/generate`) before any AI generation occurs.

#### Scenario: Table structure
- **WHEN** the `commit_events` table is created
- **THEN** it SHALL have the following columns:
  - `id TEXT PRIMARY KEY` — unique event identifier (UUID)
  - `repo_id TEXT NOT NULL` — FK to `repos.id`
  - `chat_id TEXT NOT NULL` — owner's Telegram chat ID
  - `event_type TEXT NOT NULL` — `'pr'` or `'push'`
  - `commit_sha TEXT NOT NULL` — head commit SHA (deduplication key)
  - `pr_number INTEGER` — PR number (null for push events)
  - `title TEXT NOT NULL` — PR title or first commit message line
  - `author TEXT NOT NULL` — GitHub username
  - `branch TEXT NOT NULL` — target branch (e.g., `main`)
  - `files_changed INTEGER DEFAULT 0` — number of changed files
  - `additions INTEGER DEFAULT 0` — lines added
  - `deletions INTEGER DEFAULT 0` — lines deleted
  - `commit_count INTEGER DEFAULT 1` — number of commits in event
  - `source_data TEXT NOT NULL` — full JSON `ContentSource` for AI generation
  - `status TEXT DEFAULT 'notified'` — lifecycle status
  - `draft_id TEXT` — FK to `drafts.id` (set after generation)
  - `message_id INTEGER` — Telegram notification message ID for edit-in-place
  - `event_at TEXT` — when the PR was merged or push happened
  - `created_at TEXT DEFAULT (datetime('now'))` — when the event row was created
- **AND** a `UNIQUE(chat_id, commit_sha)` constraint SHALL prevent duplicate events

#### Scenario: Table indexes
- **WHEN** the `commit_events` table is created
- **THEN** indexes SHALL exist on `chat_id`, `repo_id`, `status`, and `commit_sha`

### Requirement: commit_events status lifecycle
Each commit event SHALL progress through a defined status lifecycle.

#### Scenario: Initial status after creation
- **WHEN** a commit event is created (from webhook or `/generate`)
- **THEN** `status` SHALL be `'notified'`

#### Scenario: Status after draft generation
- **WHEN** a user clicks `[⚡ Fast]` or completes compose pen-down for an event
- **THEN** `status` SHALL be updated to `'drafted'`
- **AND** `draft_id` SHALL be set to the created draft's ID

#### Scenario: Status after user skips event
- **WHEN** a user dismisses or ignores an event (future feature)
- **THEN** `status` MAY be updated to `'skipped'`

### Requirement: Create commit event function
The data layer SHALL provide a `createCommitEvent` function for inserting new commit events.

#### Scenario: Create event from webhook
- **WHEN** `createCommitEvent(env, params)` is called
- **THEN** a new row SHALL be inserted into `commit_events` with a generated UUID
- **AND** all provided fields SHALL be stored
- **AND** the function SHALL return the event ID

#### Scenario: Create event with all fields
- **WHEN** `createCommitEvent` is called with PR event data
- **THEN** the params SHALL include: `repoId`, `chatId`, `eventType`, `commitSha`, `prNumber`, `title`, `author`, `branch`, `filesChanged`, `additions`, `deletions`, `commitCount`, `sourceData` (JSON string), `eventAt`
- **AND** `status` SHALL default to `'notified'`

### Requirement: Get commit event by ID function
The data layer SHALL provide a `getCommitEvent` function for loading a single event.

#### Scenario: Load existing event
- **WHEN** `getCommitEvent(env, chatId, eventId)` is called with a valid ID
- **THEN** the full event row SHALL be returned
- **AND** the `chatId` check SHALL ensure the event belongs to the requesting user

#### Scenario: Event not found
- **WHEN** `getCommitEvent` is called with a non-existent ID
- **THEN** `null` SHALL be returned

### Requirement: Duplicate event detection function
The data layer SHALL provide a `getCommitEventByCommitSha` function for deduplication.

#### Scenario: Check for existing event
- **WHEN** `getCommitEventByCommitSha(env, chatId, commitSha)` is called
- **THEN** it SHALL return the existing event row if one exists for that `chatId + commitSha` combination
- **AND** return `null` if no matching event exists

#### Scenario: Deduplication at insert time
- **WHEN** `createCommitEvent` is called with a `commitSha` that already exists for that `chatId`
- **THEN** the insert SHALL fail gracefully (UNIQUE constraint)
- **AND** the existing event SHALL be returned or the caller SHALL handle the conflict

### Requirement: Update commit event function
The data layer SHALL provide an `updateCommitEvent` function for lifecycle transitions.

#### Scenario: Mark event as drafted
- **WHEN** `updateCommitEvent(env, eventId, { status: 'drafted', draftId })` is called
- **THEN** the `status` and `draft_id` columns SHALL be updated

#### Scenario: Store notification message ID
- **WHEN** `updateCommitEvent(env, eventId, { messageId })` is called
- **THEN** the `message_id` column SHALL be updated
- **AND** this enables the notification to be edited in-place later

### Requirement: Drafts table event_id column
The `drafts` table SHALL have an `event_id` column for linking back to the source commit event.

#### Scenario: event_id column definition
- **WHEN** the drafts table is altered
- **THEN** `event_id TEXT` SHALL be added as a nullable column
- **AND** it SHALL reference `commit_events.id`
- **AND** it SHALL be `null` for non-commit drafts (handwrite, repost)

#### Scenario: Draft created from fast generation
- **WHEN** `fastCommitAction` creates a draft
- **THEN** the draft's `event_id` SHALL be set to the source event ID

#### Scenario: Draft created from compose pen-down
- **WHEN** a user completes pen-down in commit compose mode
- **THEN** the draft's `event_id` SHALL be set to the source event ID

### Requirement: source_data column removed from drafts
The `drafts` table SHALL NOT have a `source_data` column. Content source data lives exclusively in `commit_events`.

#### Scenario: Migration removes source_data
- **WHEN** the migration runs
- **THEN** the `source_data` column SHALL NOT be added to the drafts table
- **AND** since the previous migration (012_commit_compose.sql) was never deployed, it SHALL be updated to not include `source_data`

#### Scenario: createDraft no longer accepts source_data
- **WHEN** `createDraft` is called
- **THEN** it SHALL NOT accept a `source_data` parameter
- **AND** it SHALL accept an optional `event_id` parameter instead

#### Scenario: Compose re-entry reads from commit_events
- **WHEN** `editComposeAction` needs to load source data for a draft
- **THEN** it SHALL use the draft's `event_id` to look up the `commit_events` row
- **AND** read `source_data` from the event, not from the draft
