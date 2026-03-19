## ADDED Requirements

### Requirement: Webhook notification buttons include Edit Compose option
GitHub webhook notifications SHALL include an "Edit" button that opens a compose session for the auto-generated draft, alongside existing Approve, View, and Delete buttons.

#### Scenario: PR merged notification button layout
- **WHEN** a PR merge webhook creates an auto-generated draft
- **THEN** the notification SHALL show buttons: `[✅ Approve]` `[✏️ Edit]` on first row, `[👀 View]` `[🗑 Delete]` on second row
- **AND** the Edit button callback_data SHALL be `action:edit_compose:{draftId}`

#### Scenario: Push event notification button layout
- **WHEN** a push webhook creates an auto-generated draft
- **THEN** the notification SHALL show the same button layout as PR notifications
- **AND** the Edit button callback_data SHALL be `action:edit_compose:{draftId}`

### Requirement: Edit Compose action opens compose from auto-generated draft
The `edit_compose` action SHALL load the draft's source data and open a compose session with the source commit pre-loaded.

#### Scenario: Edit compose for commit-sourced draft
- **WHEN** user clicks `[✏️ Edit]` on a webhook notification
- **THEN** the handler SHALL load the draft by ID from callback data
- **AND** read `source_data` from the draft to reconstruct `ComposeSourceCommit`
- **AND** call `enterComposeMode` with `mode: 'commit'`, `sourceCommit` from stored data, `existingDraftId` set to the auto-generated draft ID
- **AND** the compose view SHALL show the source commit header and existing draft warning

#### Scenario: Edit compose with missing source data
- **WHEN** user clicks Edit on a draft that has no `source_data` (legacy draft)
- **THEN** the handler SHALL fall back to using `commit_sha` to re-fetch content source via `getContentSource`
- **AND** if re-fetch fails, the handler SHALL show an error message and keep the current view

#### Scenario: Pen down from edit-compose replaces auto-generated draft
- **WHEN** user completes pen down from an edit-compose session
- **THEN** a new draft SHALL be created (not editing the original)
- **AND** the original auto-generated draft SHALL remain (user can delete it separately)
- **AND** the new draft SHALL have `source: 'commit'` with the same `pr_number`, `pr_title`, `commit_sha`

### Requirement: Draft source_data column for content source persistence
The drafts table SHALL store the serialized `ContentSource` data for commit-sourced drafts, enabling compose re-entry without GitHub API calls.

#### Scenario: Source data stored on draft creation from webhook
- **WHEN** the webhook handler creates a draft from a PR or push event
- **THEN** the `source_data` column SHALL be populated with the JSON-serialized `ContentSource` object
- **AND** the stored data SHALL include `type`, `data` (with commitMessages, fileNames, stats), and `repo`

#### Scenario: Source data stored on draft creation from /generate
- **WHEN** a draft is created via `/generate` compose pen-down
- **THEN** the `source_data` column SHALL be populated with the JSON-serialized `ContentSource` object

#### Scenario: Source data nullable for non-commit drafts
- **WHEN** a draft is created with `source: 'handwrite'` or `source: 'repost'`
- **THEN** `source_data` SHALL be `null`

### Requirement: Webhook auto-generation stores source data
The existing webhook auto-generation flow SHALL be updated to persist `ContentSource` alongside the draft.

#### Scenario: PR webhook stores source data
- **WHEN** a PR merge webhook creates an auto-generated draft
- **THEN** the `ContentSource` (type 'pr', with PRData) SHALL be serialized and stored in `source_data`

#### Scenario: Push webhook stores source data
- **WHEN** a push webhook creates an auto-generated draft
- **THEN** the `ContentSource` (type 'commit', with CommitData) SHALL be serialized and stored in `source_data`
