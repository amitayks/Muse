### Requirement: Fast commit generation action handler
The system SHALL provide a `fastCommitAction` handler for `action:fast_commit:EVENT_ID` that generates content from a stored commit event using the user's default settings.

#### Scenario: Fast generate from commit event
- **WHEN** user clicks `[⚡ Fast]` on a commit event notification
- **THEN** the router SHALL dispatch `action:fast_commit:{eventId}` to `fastCommitAction`
- **AND** the handler SHALL load the commit event by ID from `commit_events`
- **AND** the handler SHALL verify the event belongs to the requesting user (`chatId` match)

#### Scenario: Event not found
- **WHEN** `fastCommitAction` receives an invalid or non-existent event ID
- **THEN** an error message SHALL be shown to the user

#### Scenario: Event already drafted
- **WHEN** `fastCommitAction` receives an event ID where `status === 'drafted'` and `draft_id` is set
- **THEN** an error message SHALL be shown: "A draft has already been generated for this event."

### Requirement: Fast generation reads user commit defaults
The `fastCommitAction` SHALL read the user's commit default settings to control generation behavior.

#### Scenario: Read commit defaults
- **WHEN** `fastCommitAction` processes an event
- **THEN** it SHALL call `getCommitDefaults(env, chatId)` to get `commitFastImage` and `commitFastAi` values

#### Scenario: commitFastImage controls image prompt generation
- **WHEN** `commitFastImage` is `false` (user disabled auto image)
- **THEN** `generateContent` SHALL be called with `{ generateImagePrompt: false }`
- **AND** the resulting draft SHALL NOT contain an `imagePrompt`

#### Scenario: commitFastImage is true (default)
- **WHEN** `commitFastImage` is `true`
- **THEN** `generateContent` SHALL be called with `{ generateImagePrompt: true }` (or without the option, defaulting to true)
- **AND** the resulting draft SHALL contain an `imagePrompt`

### Requirement: Fast generation creates draft from event source data
The `fastCommitAction` SHALL generate content using the event's stored `source_data` and create a draft.

#### Scenario: Generate content from source data
- **WHEN** `fastCommitAction` processes an event
- **THEN** it SHALL parse `event.source_data` as `ContentSource`
- **AND** call `generateContent(env, contentSource, repoId, userLang, chatId, options)`
- **AND** the `repoId` SHALL come from `event.repo_id` for overview context

#### Scenario: Draft creation with event linkage
- **WHEN** content is generated successfully
- **THEN** `createDraft` SHALL be called with:
  - `pr_number` from the event (`event.pr_number` or `0` for push)
  - `pr_title` as `"{repoShort} | {event.title}"`
  - `commit_sha` from `event.commit_sha`
  - `content` as the JSON-serialized generated content
  - `event_id` set to the event's ID
  - `publish_targets` from the user's default publish targets

#### Scenario: Overview patches applied
- **WHEN** `generateContent` returns `overviewUpdates`
- **THEN** `fastCommitAction` SHALL call `applyOverviewPatches(env, repoId, overviewUpdates)`
- **AND** patch failures SHALL be non-blocking (logged, not thrown)

### Requirement: Fast generation updates event status
After creating a draft, the event SHALL be updated to reflect the drafted state.

#### Scenario: Event status updated to drafted
- **WHEN** a draft is created successfully
- **THEN** `updateCommitEvent(env, eventId, { status: 'drafted', draftId })` SHALL be called

### Requirement: Fast generation edits notification in-place
After creating a draft, the original notification message SHALL be edited to reflect the generated state.

#### Scenario: Notification edited after generation
- **WHEN** a draft is created and `event.message_id` is set
- **THEN** the Telegram message SHALL be edited in-place
- **AND** the buttons SHALL change from `[⚡ Fast] [✏️ Edit]` to `[✅ Generated] [👀 View]`
- **AND** the `[✅ Generated]` button callback_data SHALL be `draft:{draftId}`
- **AND** the `[👀 View]` button callback_data SHALL be `draft:{draftId}`

#### Scenario: Notification edit failure is non-blocking
- **WHEN** editing the notification message fails (e.g., message too old)
- **THEN** the error SHALL be logged
- **AND** draft creation SHALL NOT be rolled back

### Requirement: Fast generation with lazy image generation
When the user has image generation enabled, the image SHALL be generated lazily after the draft is created.

#### Scenario: Image generation when enabled
- **WHEN** `commitFastImage` is `true` and the generated content has `imagePrompt`
- **THEN** `ensureImage(env, chatId, draft)` SHALL be called after draft creation
- **AND** image generation failure SHALL be non-blocking (logged, not thrown)

#### Scenario: Image generation when disabled
- **WHEN** `commitFastImage` is `false`
- **THEN** `ensureImage` SHALL NOT be called
- **AND** no `imagePrompt` SHALL exist on the draft content

### Requirement: Fast generation sends "ready" notification
After successful generation, a separate notification SHALL inform the user the draft is ready.

#### Scenario: Draft ready notification
- **WHEN** draft is created successfully
- **THEN** a new Telegram message SHALL be sent with draft preview text
- **AND** a `[👀 View Draft]` button SHALL link to the draft view

### Requirement: fast_commit action registered in router
The `fast_commit` action SHALL be registered in the router's `actionSubHandlers`.

#### Scenario: Router registration
- **WHEN** a callback with `action:fast_commit:{eventId}` is received
- **THEN** the router SHALL dispatch to `fastCommitAction`
