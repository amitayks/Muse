## MODIFIED Requirements

### Requirement: Webhook notification buttons updated with Edit Compose
The webhook notification message SHALL include an "Edit" button that opens compose mode, replacing the previous button layout.

#### Scenario: PR merged notification buttons
- **WHEN** `sendNotification` is called for a PR event
- **THEN** the keyboard SHALL have: first row `[✅ Approve]` `[✏️ Edit]`, second row `[👀 View]` `[🗑 Delete]`
- **AND** the Edit button `callback_data` SHALL be `action:edit_compose:{draftId}`

#### Scenario: Push notification buttons
- **WHEN** `sendNotification` is called for a push event
- **THEN** the keyboard SHALL have the same layout as PR notifications

### Requirement: Webhook handler stores ContentSource on draft
The webhook handler SHALL persist the `ContentSource` JSON in the draft's `source_data` column when creating auto-generated drafts.

#### Scenario: PR webhook stores ContentSource
- **WHEN** `handlePullRequestEvent` creates a draft
- **THEN** `createDraft` SHALL be called with `source_data` containing the JSON-serialized `ContentSource` of type `'pr'` with the full `PRData`

#### Scenario: Push webhook stores ContentSource
- **WHEN** `handlePushEvent` creates a draft
- **THEN** `createDraft` SHALL be called with `source_data` containing the JSON-serialized `ContentSource` of type `'commit'` with the full `CommitData`

### Requirement: edit_compose action handler registered in router
A new `edit_compose` action handler SHALL be registered in `actionSubHandlers` to handle the Edit button from webhook notifications.

#### Scenario: Router registration
- **WHEN** a callback with `action:edit_compose:{draftId}` is received
- **THEN** the router SHALL dispatch to `editComposeAction`
- **AND** the handler SHALL load the draft, read `source_data`, and enter compose mode
