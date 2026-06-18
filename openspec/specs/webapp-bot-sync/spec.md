## Purpose

Keeps the Telegram bot message in sync with webapp changes by re-rendering shared view functions and calling editMessageText via fire-and-forget ctx.waitUntil(), updating the user's navigation context, and wiring the bot's Edit and Open App buttons to launch the webapp when WEBAPP_URL is set.
## Requirements
### Requirement: Bot message update on draft save
The system SHALL update the corresponding Telegram bot message whenever a draft is modified via the webapp API. The update SHALL be **media-aware**: when the draft is image-bearing (it has per-tweet photo media, or a `draft.image_url`), the bot message is a Telegram **photo** message and SHALL be updated with `editMessageCaption`; otherwise it is a text message and SHALL be updated with `editMessageText`. When the in-place edit fails because the stored message is the wrong type or no longer exists (e.g. "message to edit not found", "there is no text in the message to edit", "there is no caption in the message to edit"), the sync SHALL delete the stale message (best-effort) and **resend** the correct message type (photo via `sendPhoto`, or text via `sendMessage`), then persist the new `message_id`. The destructive resend SHALL only run when the bot's current view is this draft.

#### Scenario: Text draft content save updates in place
- **WHEN** a `PUT /api/v1/drafts/:id` succeeds for a draft with no image
- **THEN** the Worker SHALL load `users.message_id`, re-render via `renderDraftDetail()`, and call `editMessageText` with the new text and keyboard (via `ctx.waitUntil()`)

#### Scenario: Image draft content save updates the photo caption
- **WHEN** a `PUT /api/v1/drafts/:id` succeeds for a draft that has an image
- **THEN** the Worker SHALL update the bot message with `editMessageCaption` (truncated caption + keyboard), NOT `editMessageText`, so the photo message reflects the edit

#### Scenario: Stale or wrong-type message triggers resend
- **WHEN** the in-place edit fails because the stored `message_id` points to a deleted message or a message of the wrong type (text vs photo)
- **THEN** the sync SHALL delete that message (best-effort), resend the correct type (`sendPhoto` for an image draft, `sendMessage` for a text draft), and persist the resulting new `message_id` to the users row

#### Scenario: Resend is guarded to the current draft view
- **WHEN** the sync would need to delete-and-resend but the bot's current view is not this draft
- **THEN** the sync SHALL skip rather than delete an unrelated message (the in-place edit attempt is non-destructive and may still run)

#### Scenario: Status change triggers bot update
- **WHEN** an action changes a draft's status (approve, publish, schedule, unschedule, delete)
- **THEN** the Worker SHALL update the bot message to reflect the new status, re-rendering the appropriate view (draft detail or home if the draft was deleted), media-aware as above

#### Scenario: No message_id available
- **WHEN** the user's `message_id` is null (user hasn't interacted with the bot recently)
- **THEN** the sync SHALL be silently skipped — the webapp save still succeeds

#### Scenario: Sync failure never surfaces to the webapp
- **WHEN** the Telegram API calls fail (message too old, rate limited, network)
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

### Requirement: Stored message_id stays consistent when the bot message is resent
Whenever the bot's draft message is resent as a new Telegram message — whether by the webapp sync (type mismatch / stale id) or by the bot's own draft view transitioning text→photo — the system SHALL persist the new message id to `users.message_id`, so that subsequent edits (from the bot or the webapp) target the live message instead of a deleted one. A shared helper SHALL perform the media-aware edit-or-resend and return the resulting message id so both call sites persist it consistently.

#### Scenario: Bot draft view persists the resent photo id
- **WHEN** the bot's `draftDetailAction` transitions a text message to a photo message via `deleteMessage` + `sendPhoto`
- **THEN** it SHALL persist the new photo message's id to `users.message_id` (so a later webapp sync edits that photo in place rather than a deleted text message)

#### Scenario: Webapp sync persists the resent id
- **WHEN** the webapp sync resends the bot message (photo or text) because the prior message was stale or wrong-type
- **THEN** it SHALL persist the new message id to `users.message_id`

#### Scenario: Subsequent edit is in place
- **WHEN** a sync resent and persisted a new `message_id`, and another draft edit follows
- **THEN** that next edit SHALL succeed in place (no further resend) because the stored id now points to the live message

### Requirement: v2 webapp mutations preserve bot sync
The v2 webapp SHALL perform **all** draft persistence exclusively through the existing draft endpoints that already trigger bot sync (`POST /api/v1/compose`, `POST /api/v1/generate`, `PUT /api/v1/drafts/:id`, `/approve`, `/schedule`, `DELETE /schedule`, `/targets`, `/refine`, `DELETE /api/v1/drafts/:id`). No v2 code path SHALL mutate draft state outside these endpoints. Any new draft content shape introduced by v2 (e.g. per-tweet media variants) SHALL be representable by `DraftContent` and renderable by the bot's `renderDraftDetail`, so the synced bot message stays correct.

#### Scenario: Composer-created draft syncs the bot
- **WHEN** the v2 Composer creates a draft (Save or Generate) via the compose/generate endpoint
- **THEN** the backend SHALL drive the existing bot-message sync so the bot reflects the new/updated draft

#### Scenario: Every v2 edit routes through a syncing endpoint
- **WHEN** the v2 Composer/Draft-viewer changes a draft's content, targets, status, or schedule
- **THEN** the change SHALL go through the corresponding existing endpoint that calls `syncBotMessage`/`syncBotHome` — never a side channel

#### Scenario: New content shape remains bot-renderable
- **WHEN** v2 introduces a new draft content shape (e.g. additional per-tweet media)
- **THEN** the bot's `renderDraftDetail` SHALL be updated in the same change so the synced message renders it correctly (verified by editing such a draft in the webapp and observing the bot message update)

#### Scenario: Live sync still works for media drafts
- **WHEN** the user edits an image/video-bearing draft in the v2 webapp
- **THEN** the bot's photo message caption (or resent message) SHALL update per the existing media-aware sync, with no regression

