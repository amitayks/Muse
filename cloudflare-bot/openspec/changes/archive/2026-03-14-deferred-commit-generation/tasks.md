## 1. Database Migration

- [x] 1.1 Create migration file for `commit_events` table: `id TEXT PRIMARY KEY`, `repo_id TEXT NOT NULL`, `chat_id TEXT NOT NULL`, `event_type TEXT NOT NULL` ('pr'|'push'), `commit_sha TEXT NOT NULL`, `pr_number INTEGER`, `title TEXT NOT NULL`, `author TEXT NOT NULL`, `branch TEXT NOT NULL`, `files_changed INTEGER DEFAULT 0`, `additions INTEGER DEFAULT 0`, `deletions INTEGER DEFAULT 0`, `commit_count INTEGER DEFAULT 1`, `source_data TEXT NOT NULL`, `status TEXT DEFAULT 'notified'`, `draft_id TEXT`, `message_id INTEGER`, `event_at TEXT`, `created_at TEXT DEFAULT (datetime('now'))`, with `UNIQUE(chat_id, commit_sha)`
- [x] 1.2 Add indexes to `commit_events` table: `idx_commit_events_chat` on `(chat_id)`, `idx_commit_events_repo` on `(repo_id)`, `idx_commit_events_status` on `(status)`, `idx_commit_events_sha` on `(chat_id, commit_sha)`
- [x] 1.3 Add `event_id TEXT` column to `drafts` table (nullable, FK to `commit_events.id`)
- [x] 1.4 Update migration `012_commit_compose.sql` to NOT add `source_data` column to drafts (since it was never deployed, remove that ALTER statement)

## 2. Commit Events Data Layer

- [x] 2.1 Create `data/commit-events-db.ts` module with `CommitEvent` interface matching the table schema (all columns typed)
- [x] 2.2 Implement `createCommitEvent(env, params)` function: generates UUID, inserts row, returns event ID. Params include: `repoId`, `chatId`, `eventType`, `commitSha`, `prNumber`, `title`, `author`, `branch`, `filesChanged`, `additions`, `deletions`, `commitCount`, `sourceData` (JSON string), `eventAt`
- [x] 2.3 Implement `getCommitEvent(env, chatId, eventId)` function: returns full event row or null, verifies `chatId` ownership
- [x] 2.4 Implement `getCommitEventByCommitSha(env, chatId, commitSha)` function: returns existing event or null for deduplication
- [x] 2.5 Implement `updateCommitEvent(env, eventId, updates)` function: accepts partial updates for `status`, `draftId`, `messageId`. Updates the specified columns only.

## 3. Drafts Data Layer Update

- [x] 3.1 Update `createDraft` in `data/draft-db.ts`: remove `source_data` parameter, add optional `event_id` parameter. Store `event_id` in the new column when provided.
- [x] 3.2 Remove all `source_data` references from `createDraft` callers: update `handleCommitPenDown` in `actions/compose.ts` to pass `event_id` instead of `source_data`
- [x] 3.3 Update webhook handler callers: since webhook no longer calls `createDraft`, remove the `source_data` parameter from the old `createDraft` calls in `handlers/github-webhook.ts` (these calls will be removed entirely in task group 5)

## 4. Types Update

- [x] 4.1 Add `eventId?: string` to `ComposeState` interface in `types.ts` — carries the commit event ID through the compose session for draft linkage
- [x] 4.2 Add `EnterComposeOptions.eventId?: string` field in `actions/compose-init.ts` — passed when entering compose from a commit event
- [x] 4.3 Ensure `ComposeSourceCommit` type is unchanged (already has all needed fields)

## 5. Webhook Handler Refactor

- [x] 5.1 Import `createCommitEvent`, `getCommitEventByCommitSha`, `updateCommitEvent` from `data/commit-events-db` in `handlers/github-webhook.ts`
- [x] 5.2 Refactor `handlePullRequestEvent`: remove `generateContent` call, remove `createDraft` call, remove `applyOverviewPatches` call. Instead: call `getPR()` for enrichment, build `ContentSource`, check for duplicate via `getCommitEventByCommitSha`, call `createCommitEvent`, call `sendEventNotification`, call `updateCommitEvent` to store `messageId`
- [x] 5.3 Refactor `handlePushEvent`: remove `generateContent` call, remove `createDraft` call, remove `applyOverviewPatches` call. Instead: build `ContentSource` from payload, check for duplicate via `getCommitEventByCommitSha`, call `createCommitEvent`, call `sendEventNotification`, call `updateCommitEvent` to store `messageId`
- [x] 5.4 Rename `sendNotification` to `sendEventNotification` and rewrite: remove content preview (no draft exists). Show event summary: event type emoji, PR/push label, repo as code block, title, author, stats line. Buttons: `[⚡ Fast] [✏️ Edit]` with `action:fast_commit:{eventId}` and `action:edit_compose:{eventId}`. Return `message_id` for edit-in-place tracking.
- [x] 5.5 Remove unused imports from `handlers/github-webhook.ts`: `generateContent`, `createDraft`, `getDraftByCommitSha`, `applyOverviewPatches`, `getUser`

## 6. I18n Strings

- [x] 6.1 Add event notification strings to `en.ts`: `notifications.eventTitle` (format with emoji and label), `notifications.eventRepo`, `notifications.eventAuthor`, `notifications.eventStats` (files, additions, deletions), `notifications.eventCommitCount`, `notifications.btnFastCommit` ("⚡ Fast"), `notifications.btnEditCommit` ("✏️ Edit"), `notifications.btnGenerated` ("✅ Generated")
- [x] 6.2 Add event summary strings to `en.ts`: `notifications.prMergedLabel` (e.g., "PR Merged #{number}"), `notifications.pushLabel` (e.g., "{count} commit(s) pushed")
- [x] 6.3 Add Hebrew equivalents for all new strings in `he.ts`

## 7. Fast Commit Action

- [x] 7.1 Create `actions/fast-commit.ts` with `fastCommitAction` handler: load commit event by ID from `commit_events`, verify `chatId` ownership, check event isn't already drafted
- [x] 7.2 Read user defaults: call `getCommitDefaults(env, chatId)` to get `commitFastImage` and `commitFastAi`
- [x] 7.3 Parse `event.source_data` as `ContentSource`, call `generateContent(env, contentSource, event.repo_id, userLang, chatId, { generateImagePrompt: commitDefaults.commitFastImage })`
- [x] 7.4 Handle overview patches: if `result.overviewUpdates` is present, call `applyOverviewPatches(env, event.repo_id, result.overviewUpdates)` (non-blocking)
- [x] 7.5 Create draft: call `createDraft` with `pr_number` from event, `pr_title` as `"{repoShort} | {event.title}"`, `commit_sha` from event, `content`, `event_id`, `publish_targets` from user defaults
- [x] 7.6 Update event: call `updateCommitEvent(env, eventId, { status: 'drafted', draftId })`
- [x] 7.7 Edit notification in-place: if `event.message_id` is set, edit the Telegram message buttons to `[✅ Generated] [👀 View]` with `draft:{draftId}` callback_data. Handle edit failure as non-blocking.
- [x] 7.8 Lazy image generation: if `commitDefaults.commitFastImage` is true and `content.imagePrompt` exists, call `ensureImage(env, chatId, draft)`. Handle failure as non-blocking.
- [x] 7.9 Send "draft ready" notification: send a new message with draft preview and `[👀 View Draft]` button

## 8. Edit Compose Action Refactor

- [x] 8.1 Refactor `editComposeAction` in `actions/edit-compose.ts`: change from loading draft by ID to loading commit event by ID from `commit_events`. Parse `source_data` from event instead of draft.
- [x] 8.2 Build `ComposeSourceCommit` from event data: map `event.event_type` → `type`, look up repo by `event.repo_id` for `repo`/`repoShort`, use denormalized fields for `title`, `author`, `branch`, stats. Parse `source_data` for `commitMessages`, `fileNames`.
- [x] 8.3 Read user commit defaults: call `getCommitDefaults(env, chatId)` for compose toggle defaults
- [x] 8.4 Call `enterComposeMode` with `mode: 'commit'`, `sourceCommit`, `eventId: event.id`, `existingDraftId: event.draft_id || undefined`, `imageGen: defaults.commitFastImage`, `aiRefine: defaults.commitFastAi`

## 9. Compose Init & Pen Down Updates

- [x] 9.1 Update `enterComposeMode` in `actions/compose-init.ts`: accept `eventId` option, store it in `ComposeState.eventId`
- [x] 9.2 Update `handleCommitPenDown` in `actions/compose.ts`: pass `event_id: compose.eventId` to `createDraft` instead of `source_data`. After draft creation, call `updateCommitEvent(env, compose.eventId, { status: 'drafted', draftId })`.
- [x] 9.3 Update `finalizeDraft` (or equivalent) in `actions/compose.ts`: ensure commit-mode drafts pass `event_id` to `createDraft` and no longer pass `source_data`

## 10. /generate Command Refactor

- [x] 10.1 Refactor `commitShaInput` in `inputs/commit-sha.ts`: after fetching content source, build `ContentSource`, look up repo ID, call `createCommitEvent` (with dedup check via `getCommitEventByCommitSha`), then show event summary with `[⚡ Fast] [✏️ Edit]` buttons by editing the "Generating..." message. Do NOT enter compose mode.
- [x] 10.2 Handle duplicate in `/generate`: if `getCommitEventByCommitSha` finds an existing event, show the existing event summary instead of creating a new one. If event already has `draft_id`, show `[✅ Generated] [👀 View]` buttons.
- [x] 10.3 Store `message_id` on the event: after editing the "Generating..." message to show the event summary, call `updateCommitEvent(env, eventId, { messageId })` for edit-in-place support
- [x] 10.4 Clear `awaiting_input` after event creation: call `updateChatState(env, chatId, { context: null })` after showing the event summary
- [x] 10.5 Handle fetch failure: if `getContentSource` fails, edit the "Generating..." message to show error, keep `awaiting_input: 'commit_sha'` for retry

## 11. generateContent imagePrompt Stripping

- [x] 11.1 In `generateContent` in `ai/gemini.ts`: after `parseContentResponse`, if `options?.generateImagePrompt === false`, delete `result.content.imagePrompt` from the result before returning
- [x] 11.2 Verify backward compatibility: callers without `options` or with `generateImagePrompt: true` (or undefined) SHALL get identical behavior — imagePrompt preserved

## 12. Router Registration

- [x] 12.1 Register `fast_commit` → `fastCommitAction` in `actionSubHandlers` in `core/router.ts`
- [x] 12.2 Verify `edit_compose` is already registered (from `unified-compose-commits` change) — update its import if the module path changed
- [x] 12.3 Remove old `approve` action handler if it was only used for webhook auto-generated drafts (verify if `approve` is used elsewhere before removing)

## 13. Event Summary View

- [x] 13.1 Create `renderEventSummary` function (in `views/` or inline): builds the HTML text for a commit event notification/summary. Takes event data + lang, returns formatted text with emoji, labels, repo, title, author, stats.
- [x] 13.2 Create `renderEventButtons` function: returns keyboard with `[⚡ Fast] [✏️ Edit]` for ungenerated events, or `[✅ Generated] [👀 View]` for events with `draft_id`
- [x] 13.3 Use `renderEventSummary` + `renderEventButtons` in both `sendEventNotification` (webhook handler) and `commitShaInput` (/generate) for consistent formatting

## 14. Cleanup

- [x] 14.1 Remove `source_data` handling from `actions/compose.ts` (any code that reads/writes `source_data` on drafts for commit mode)
- [x] 14.2 Remove `source_data` handling from `data/draft-db.ts` (column reference in INSERT/SELECT)
- [x] 14.3 Verify `edit_compose` action no longer attempts to read `source_data` from drafts or call `getContentSource` as fallback — it reads exclusively from `commit_events`
- [x] 14.4 Remove unused imports across all modified files

## 15. Integration Testing

- [ ] 15.1 Test webhook PR flow: PR merged webhook → commit_events row created (no draft, no AI call) → notification sent with [⚡ Fast] [✏️ Edit] → message_id stored on event
- [ ] 15.2 Test webhook push flow: push webhook → commit_events row created → notification sent with correct push format
- [ ] 15.3 Test webhook duplicate: same PR webhook twice → second one skipped, no duplicate event
- [ ] 15.4 Test Fast generation: click [⚡ Fast] → content generated → draft created → event updated (status: drafted, draft_id set) → notification edited to [✅ Generated] [👀 View] → "draft ready" notification sent
- [ ] 15.5 Test Fast with image disabled: set commit_fast_image to 0 → click Fast → draft created WITHOUT imagePrompt → ensureImage NOT called
- [ ] 15.6 Test Fast with image enabled: commit_fast_image is 1 (default) → click Fast → draft has imagePrompt → ensureImage called
- [ ] 15.7 Test Edit compose: click [✏️ Edit] → compose mode entered with source commit header → pen down → draft created with event_id → event updated to drafted
- [ ] 15.8 Test Edit compose with existing draft: event already has draft_id → compose entered → warning shown → pen down creates new draft → event.draft_id updated to new draft
- [ ] 15.9 Test /generate flow: send SHA → fetch from GitHub → commit_events row created → event summary shown with [⚡ Fast] [✏️ Edit] → awaiting_input cleared
- [ ] 15.10 Test /generate duplicate: send SHA for existing event → existing event summary shown (no duplicate)
- [ ] 15.11 Test /generate with existing draft: event already has draft → summary shows [✅ Generated] [👀 View]
- [ ] 15.12 Test /generate fetch failure: invalid SHA → error shown → user can retry
- [ ] 15.13 Test commit defaults in settings: toggle commit_fast_image and commit_fast_ai → verify they affect Fast generation and compose defaults
- [ ] 15.14 Test handwrite and repost flows unaffected: verify no regressions in existing compose modes
- [ ] 15.15 Test overview patches: Fast generation with overview updates → patches applied (non-blocking)
