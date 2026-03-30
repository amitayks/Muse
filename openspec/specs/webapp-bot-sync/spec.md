## ADDED Requirements

### Requirement: Bot message update on draft save
The system SHALL update the corresponding Telegram bot message whenever a draft is modified via the webapp API.

#### Scenario: Content save triggers bot update
- **WHEN** a `PUT /api/v1/drafts/:id` request successfully updates draft content
- **THEN** the Worker SHALL: load the user's stored `message_id` from the users table, re-render the draft detail view using the existing `renderDraftDetail()` function, call Telegram's `editMessageText` API with the re-rendered text and keyboard, using `ctx.waitUntil()` to not block the API response

#### Scenario: Status change triggers bot update
- **WHEN** an action changes a draft's status (approve, publish, schedule, unschedule, delete)
- **THEN** the Worker SHALL update the bot message to reflect the new status, re-rendering the appropriate view (draft detail or home if draft was deleted)

#### Scenario: No message_id available
- **WHEN** the user's `message_id` is null (user hasn't interacted with bot recently)
- **THEN** the sync SHALL be silently skipped — the webapp save still succeeds

#### Scenario: editMessageText fails
- **WHEN** the Telegram API call to `editMessageText` fails (message too old, already deleted, rate limited)
- **THEN** the error SHALL be logged but the webapp API response SHALL still return success — sync failure MUST NOT cause a user-visible error

### Requirement: Fire-and-forget sync via waitUntil
The bot sync SHALL be executed asynchronously using `ctx.waitUntil()` so it does not block the API response to the webapp.

#### Scenario: Sync latency
- **WHEN** a webapp save triggers bot sync
- **THEN** the API response SHALL be returned immediately after the D1 write, and the Telegram API call SHALL execute in the background via `ctx.waitUntil()`

### Requirement: View re-rendering for sync
The sync handler SHALL reuse existing view functions to ensure the bot message matches what the bot would show natively.

#### Scenario: Draft detail sync uses renderDraftDetail
- **WHEN** a draft is updated from the webapp
- **THEN** the sync handler SHALL call `renderDraftDetail(env, chatId, draftId, timezone, lang)` — the same function used by the bot's `draft:ID` callback handler — to generate the text and keyboard for `editMessageText`

#### Scenario: Home view sync on delete
- **WHEN** a draft is deleted from the webapp
- **THEN** the sync handler SHALL call `renderHome(env, chatId, lang)` to update the bot message to the home view (since the draft no longer exists)

### Requirement: User context update from webapp
The system SHALL update the user's `current_view` and `context` when the webapp makes changes, so that bot navigation remains consistent.

#### Scenario: Webapp opens draft editor
- **WHEN** the webapp navigates to `/#/draft/:id` and makes an API call
- **THEN** the API handler SHALL update the user's context to `{ current_view: 'draft_detail', context: { selected_draft_id: id } }` so the bot knows the user's current state

#### Scenario: Webapp returns to home
- **WHEN** the webapp navigates to the home page and triggers an API call (e.g., dashboard fetch)
- **THEN** the user's context SHALL be updated to `{ current_view: 'home' }`

### Requirement: Bot "Edit" button opens webapp
The bot's draft detail view SHALL replace the current "Edit" callback button with a `web_app` button that opens the draft editor in the webapp.

#### Scenario: Edit button as web_app
- **WHEN** the bot renders a draft detail view for a draft with status "draft" and `WEBAPP_URL` environment variable is set
- **THEN** the "Edit" button SHALL be `{ text: "✏️ Edit", web_app: { url: "${WEBAPP_URL}/#/draft/${draftId}" } }` instead of `{ text: "✏️ Edit", callback_data: "action:edit:${draftId}" }`

#### Scenario: Fallback when WEBAPP_URL not set
- **WHEN** the `WEBAPP_URL` environment variable is not configured
- **THEN** the "Edit" button SHALL remain as the original `callback_data: "action:edit:${draftId}"` (AI instruction mode)

### Requirement: Bot home "Open App" button
The bot's home view SHALL include a button to open the webapp.

#### Scenario: Open App button on home
- **WHEN** the bot renders the home view and `WEBAPP_URL` environment variable is set
- **THEN** the keyboard SHALL include a row with `{ text: "📱 Open App", web_app: { url: WEBAPP_URL } }` button

#### Scenario: No Open App button when WEBAPP_URL not set
- **WHEN** the `WEBAPP_URL` environment variable is not configured
- **THEN** the "Open App" button SHALL NOT appear on the home view
