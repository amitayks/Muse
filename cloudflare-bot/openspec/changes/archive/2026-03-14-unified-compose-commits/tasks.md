## 1. Types & State Extension

- [x] 1.1 Add `ComposeSourceCommit` interface to `types.ts`: fields `type: 'pr' | 'commit'`, `repo: string`, `repoShort: string`, optional `repoId: string`, `title: string`, optional `prNumber: number`, `commitSha: string`, `commitMessages: string[]`, `fileNames: string[]`, `filesChanged: number`, `additions: number`, `deletions: number`, `author: string`
- [x] 1.2 Widen `ComposeState.mode` type from `'handwrite' | 'repost'` to `'handwrite' | 'repost' | 'commit'` in `types.ts`
- [x] 1.3 Add optional `sourceCommit?: ComposeSourceCommit` field to `ComposeState` in `types.ts`

## 2. DB Migration

- [x] 2.1 Create D1 migration: `ALTER TABLE drafts ADD COLUMN source_data TEXT`
- [x] 2.2 In same or separate migration: `ALTER TABLE users ADD COLUMN commit_fast_image INTEGER DEFAULT 1`
- [x] 2.3 In same or separate migration: `ALTER TABLE users ADD COLUMN commit_fast_ai INTEGER DEFAULT 1`

## 3. Settings Data Layer

- [x] 3.1 Add `getCommitDefaults(env, chatId)` function in `data/user-settings-db.ts` returning `{ commitFastImage: boolean, commitFastAi: boolean }`
- [x] 3.2 Add `setCommitDefault(env, chatId, field, value)` function in `data/user-settings-db.ts` for toggling each setting
- [x] 3.3 Extend `createDraft` in `data/draft-db.ts` to accept optional `source_data: string` parameter and store it in the new column

## 4. I18n Strings

- [x] 4.1 Add commit compose strings to `en.ts`: `compose.commitHeader` (pinned header format), `compose.commitInstructions` (commit-specific empty state), `compose.commitStats` (stats line format)
- [x] 4.2 Add webhook notification strings to `en.ts`: update `notifications.btnEdit` to use new callback format, or add `notifications.btnEditCompose` if keeping both
- [x] 4.3 Add settings strings to `en.ts`: `settings.commitDefaults` header, `settings.btnCommitFastImage`, `settings.btnCommitFastAi`
- [x] 4.4 Add Hebrew equivalents for all new strings in `he.ts`

## 5. Compose View — Commit Header

- [x] 5.1 Extend `ComposeOptions` interface in `views/home.ts`: add optional `sourceCommit: ComposeSourceCommit`
- [x] 5.2 Add commit header rendering in `renderCompose`: when `options.sourceCommit` present, render pinned header with `📌 {repoShort} | {title}`, stats line with commit count, file count, additions/deletions, separator line
- [x] 5.3 Update compose empty state to be mode-aware for commit: show commit-specific instructions when `sourceCommit` is present ("Add your own tweets, attach images, or tap Pen Down to generate from this change.")
- [x] 5.4 Add duplicate warning rendering for commit compose: when `options.existingDraftId` present, show warning banner (reuse existing pattern from repost compose)

## 6. Shared Compose Initialization Extension

- [x] 6.1 Extend `EnterComposeOptions` in `actions/compose-init.ts`: add optional `sourceCommit: ComposeSourceCommit` field
- [x] 6.2 Update `enterComposeMode` to handle `mode: 'commit'`: set default `aiRefine: true`, `imageGen: true`; pass `sourceCommit` to `renderCompose` options; store `sourceCommit` in `ComposeState`
- [x] 6.3 Read user's commit default settings (`commit_fast_ai`, `commit_fast_image`) and use them as defaults when entering commit compose (overridable by explicit options)

## 7. `/generate` Command — Enter Compose Mode

- [x] 7.1 Refactor `commitShaInput` in `inputs/commit-sha.ts`: after fetching content source via `getContentSource`, build `ComposeSourceCommit` from fetched data, check for duplicate draft by `commit_sha`, call `enterComposeMode` with `mode: 'commit'`. Remove the inline generation/draft-creation/image-gen/display logic.
- [x] 7.2 Handle duplicate detection: if `getDraftByCommitSha` finds existing draft, pass `existingDraftId` to `enterComposeMode` options
- [x] 7.3 Update `generateCommand` in `commands/generate.ts` to work with the refactored compose flow (may need minimal changes since it delegates to `commitShaInput`)

## 8. Compose Action — Commit Mode Pen Down

- [x] 8.1 Add `handleCommitPenDown` function in `actions/compose.ts`: handles commit-specific pen-down logic (parallel to `handleRepostPenDown` and `handleHandwritePenDown`)
- [x] 8.2 Wire `handleCommitPenDown` into `handlePenDown` branch: `if (compose.mode === 'commit')` dispatches to `handleCommitPenDown`
- [x] 8.3 Implement commit pen down with AI on, no user tweets: reconstruct `ContentSource` from `ComposeSourceCommit`, call `generateContent(env, source, repoId, lang, chatId, { instruction })`, use result as draft content
- [x] 8.4 Implement commit pen down with AI on, user tweets present: call `generateContent(env, source, repoId, lang, chatId, { userTweets, instruction, userImageParts })` — user tweets passed as initial thoughts, user images analyzed if `analyzeImages` is on
- [x] 8.5 Implement commit pen down with AI off, user tweets present: build `DraftContent` directly from user tweets, set `source: 'commit'` with commit metadata
- [x] 8.6 Implement commit pen down with AI off, no tweets: re-render compose view (nothing to save)
- [x] 8.7 Reuse `finalizeDraft` for commit mode: pass `source: 'commit'`, set `pr_number`, `pr_title`, `commit_sha` from `sourceCommit`, pass `source_data` (serialized `ContentSource`) to `createDraft`
- [x] 8.8 Update `buildComposeView` helper to pass `sourceCommit` through to `renderCompose` options

## 9. AI Pipeline — Content Prompt Extension

- [x] 9.1 Create shared `buildPromptSections` utility in `ai/prompt-utils.ts` (or similar): accepts `{ userTweets?: string[], instruction?: string }`, returns formatted "MY INITIAL THOUGHTS" and "WHAT I'M GOING FOR" sections as string (empty string if nothing to add)
- [x] 9.2 Refactor `buildRepostUserPrompt` in `ai/repost-prompt.ts` to use `buildPromptSections` for the user tweets and instruction sections (replacing inline formatting)
- [x] 9.3 Extend `buildContentPrompt` in `ai/gemini.ts`: add optional `options: { userTweets?: string[], instruction?: string }` parameter, use `buildPromptSections` to append sections when present
- [x] 9.4 Extend `generateContent` in `ai/gemini.ts`: add optional `options: { userTweets?: string[], instruction?: string, userImageParts?: ImagePart[] }` parameter, pass `userTweets` and `instruction` to `buildContentPrompt`, build multimodal prompt when `userImageParts` present
- [x] 9.5 Ensure `generateContent` backward compatibility: existing callers (webhook handlers, old paths) that don't pass options SHALL get identical behavior

## 10. Work-Progress Skill — Initial Thoughts Paragraph

- [x] 10.1 Add "initial thoughts" paragraph to `WORK_PROGRESS_EN` in `skills/work-progress.ts`: self-directed text about sometimes having rough thoughts as a starting point, reshaping them through voice, using them as direction not destination
- [x] 10.2 Add Hebrew equivalent paragraph to `WORK_PROGRESS_HE` in `skills/work-progress.ts`
- [x] 10.3 Update default prompt seed (if applicable) to include the new paragraph in the DB seed

## 11. Webhook Notification — Button Layout Update

- [x] 11.1 Update `sendNotification` in `handlers/github-webhook.ts`: change button layout to `[✅ Approve]` `[✏️ Edit]` on first row, `[👀 View]` `[🗑 Delete]` on second row
- [x] 11.2 Change Edit button `callback_data` from `action:edit:{draftId}` to `action:edit_compose:{draftId}`
- [x] 11.3 Keep existing `[✅ Approve]`, `[👀 View]`, `[🗑 Delete]` callbacks unchanged

## 12. Webhook Handler — Store ContentSource on Draft

- [x] 12.1 Update `handlePullRequestEvent` in `handlers/github-webhook.ts`: serialize the `ContentSource` (type 'pr' with PRData) and pass as `source_data` to `createDraft`
- [x] 12.2 Update `handlePushEvent` in `handlers/github-webhook.ts`: serialize the `ContentSource` (type 'commit' with CommitData) and pass as `source_data` to `createDraft`
- [x] 12.3 Include `repo` field in the stored `ContentSource` for context when reconstructing compose session

## 13. Edit Compose Action — From Webhook Notification

- [x] 13.1 Create `editComposeAction` handler for `action:edit_compose:DRAFT_ID`: load draft from DB, read `source_data`, parse `ContentSource`, build `ComposeSourceCommit`, call `enterComposeMode` with `mode: 'commit'`, `sourceCommit`, `existingDraftId` set to original draft
- [x] 13.2 Handle missing `source_data` fallback: if `source_data` is null (legacy draft), attempt to re-fetch via `getContentSource(env, draft.commit_sha)`; if that fails, show error and keep current view
- [x] 13.3 Register `edit_compose` in `actionSubHandlers` in `router.ts`

## 14. Settings View — Commit Defaults

- [x] 14.1 Extend `renderSettings` in `views/settings.ts`: add "💻 Commit Defaults" section with two toggle buttons: `[🎨 Auto Image: ON/OFF]` and `[🤖 Auto AI: ON/OFF]`
- [x] 14.2 Add settings toggle handlers: `settings:commit:fast_image` and `settings:commit:fast_ai` callbacks in settings action handler. Each toggles the DB value and re-renders settings.
- [x] 14.3 Register new settings callbacks in the router (handled via existing `settings` prefix routing)

## 15. Router — Action Handler Registration

- [x] 15.1 Register `edit_compose` → `editComposeAction` in `actionSubHandlers`
- [x] 15.2 Keep existing `edit` handler unchanged (for non-compose inline editing)
- [x] 15.3 Verify backward compat: old webhook notifications with `action:edit:{draftId}` still route to existing edit handler

## 16. Shared Utility Extractions

- [x] 16.1 Extract `buildPromptSections` utility (task 9.1) — shared between `buildRepostUserPrompt` and `buildContentPrompt`
- [x] 16.2 Extract `reconstructContentSource` utility: given a `ComposeSourceCommit`, reconstruct a `ContentSource` object for passing to `generateContent` — used by `handleCommitPenDown`
- [x] 16.3 Review `finalizeDraft` in `actions/compose.ts`: ensure it accepts `source_data` passthrough for commit drafts, verify it handles all three modes cleanly without duplication

## 17. Integration Testing

- [ ] 17.1 Test `/generate` flow end-to-end: send SHA → compose mode with source commit displayed → pen down with AI → draft created with `source: 'commit'`, `commit_sha` and `pr_title` set
- [ ] 17.2 Test commit compose with user tweets: enter commit compose → send text messages → pen down → AI receives "MY INITIAL THOUGHTS" in prompt
- [ ] 17.3 Test commit compose with instruction: enter commit compose → set instruction → pen down → AI receives "WHAT I'M GOING FOR" in prompt
- [ ] 17.4 Test commit compose with AI off: enter commit compose → toggle AI off → send tweets → pen down → draft created from user tweets directly
- [ ] 17.5 Test commit compose with image gen: enter commit compose → pen down with imageGen on → draft has imagePrompt → image generated lazily
- [ ] 17.6 Test webhook auto-generation: PR merged webhook → draft auto-created → `source_data` stored → notification sent with new buttons
- [ ] 17.7 Test webhook Edit button: click [✏️ Edit] on notification → compose mode opened with source commit from `source_data` → pen down creates new draft
- [ ] 17.8 Test webhook Edit with legacy draft: click Edit on draft with no `source_data` → fallback fetches from GitHub → compose works
- [ ] 17.9 Test commit settings: toggle auto image and auto AI in settings → verify they affect `/generate` compose defaults and webhook behavior
- [ ] 17.10 Test duplicate detection: `/generate` with SHA that has existing draft → warning shown, View Existing button present
- [ ] 17.11 Test handwrite and repost still work: verify rename didn't break existing compose modes
- [ ] 17.12 Test shared `buildPromptSections`: verify repost prompt still generates correctly after refactor to use shared utility
