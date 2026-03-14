## Requirements

### Requirement: Edit Compose action opens compose from commit event
The `edit_compose` action SHALL load the commit event's source data and open a compose session with the source commit pre-loaded. It reads from `commit_events` by event ID (not from `drafts.source_data`).

#### Scenario: Edit compose for commit event
- **WHEN** user clicks `[✏️ Edit]` on a commit event notification
- **THEN** the handler SHALL receive `action:edit_compose:{eventId}`
- **AND** load the commit event by ID from `commit_events`
- **AND** parse `source_data` from the event to build `ComposeSourceCommit`
- **AND** call `enterComposeMode` with `mode: 'commit'`, `sourceCommit` from event data, `eventId` set for draft linkage
- **AND** the compose view SHALL show the source commit header

#### Scenario: Edit compose with existing draft
- **WHEN** user clicks `[✏️ Edit]` on an event that already has `draft_id` set
- **THEN** the handler SHALL still enter compose mode
- **AND** `existingDraftId` SHALL be set to `event.draft_id`
- **AND** the compose view SHALL show the existing draft warning

#### Scenario: Event not found
- **WHEN** `editComposeAction` receives a non-existent event ID
- **THEN** an error message SHALL be shown to the user

#### Scenario: Build ComposeSourceCommit from event
- **WHEN** the handler builds `ComposeSourceCommit` from a commit event
- **THEN** it SHALL map fields: `type` from `event.event_type` mapped to `'pr' | 'commit'`, `repo` from looking up `repos.owner/repos.repo` by `event.repo_id`, `repoShort` as the repo name, `repoId` as `event.repo_id`, `title` from `event.title`, `prNumber` from `event.pr_number`, `commitSha` from `event.commit_sha`, `commitMessages` from `source_data.data.commitMessages`, `fileNames` from `source_data.data.fileNames`, `filesChanged` from `event.files_changed`, `additions` from `event.additions`, `deletions` from `event.deletions`, `author` from `event.author`

### Requirement: Pen down from edit-compose links draft to event
When a user completes pen down from a compose session that was entered via `[✏️ Edit]` on a commit event, the draft SHALL be linked back to the source event.

#### Scenario: Draft creation from compose pen-down
- **WHEN** user completes pen down from an edit-compose session (commit mode with `eventId`)
- **THEN** a new draft SHALL be created with `event_id` set to the source event ID
- **AND** the commit event SHALL be updated: `status -> 'drafted'`, `draft_id -> newDraftId`

#### Scenario: Pen down with existing draft on event
- **WHEN** user completes pen down and the event already has a `draft_id` (from a previous Fast generation)
- **THEN** a new draft SHALL still be created
- **AND** the event's `draft_id` SHALL be updated to the NEW draft ID
- **AND** the original draft SHALL remain in the system (user can delete it separately)

<!-- Note: The following requirements were removed in the deferred-commit-generation change:

- "Draft source_data column for content source persistence" — Content source data is now stored in commit_events.source_data. Drafts link to their source event via event_id.
- "Webhook auto-generation stores source data" — Webhooks no longer auto-generate. Source data storage moved to createCommitEvent in the webhook handler.
- "Webhook notification buttons include Edit Compose option" — Button layout changed from [Approve] [Edit] / [View] [Delete] to [Fast] [Edit]. No draft exists at notification time. -->
