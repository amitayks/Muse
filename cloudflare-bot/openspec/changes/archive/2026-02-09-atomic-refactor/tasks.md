## 1. Core Utilities

- [x] 1.1 Create `core/respond.ts` — the `respond(env, chatId, view, opts?)` utility that combines sendMessage/editMessage + updateChatState into one call
- [x] 1.2 Create `core/router.ts` — define `HandlerContext`, `CommandHandler`, `ActionHandler`, `InputHandler` types; create dispatch tables and the main routing functions (`routeCommand`, `routeCallback`, `routeInput`)
- [x] 1.3 Create `core/publish.ts` — shared `publishDraft(env, chatId, draft)` pipeline: parse content → get/generate image → upload media → post thread → update DB → create published record

## 2. Rename grok.ts → gemini.ts + Split Storage

- [x] 2.1 Rename `services/grok.ts` to `services/gemini.ts` — update all imports across the codebase
- [x] 2.2 Create `services/storage.ts` — move `generateAndStoreImage()` and `ensureImage()` from gemini.ts to storage.ts; storage.ts imports `generateImage` from gemini.ts and uses R2 for persistence
- [x] 2.3 Update all files that import `generateAndStoreImage`/`ensureImage` to import from `services/storage.ts` instead

## 3. Split Views

- [x] 3.1 Create `views/home.ts` — move `renderHome`, `renderHelp`, `renderError`, `renderSuccess`, `renderGenerating`, `renderPublishing` from views/index.ts
- [x] 3.2 Create `views/drafts.ts` — move `renderDraftsList`, `renderDraftDetail`, `renderGeneratePrompt`, `renderSchedulePrompt`, `renderDeletePrompt`
- [x] 3.3 Create `views/repos.ts` — move `renderReposList`, `renderRepoDetail`, `renderAddRepo`, `renderDeleteRepoConfirm`, `renderRepoConfig`
- [x] 3.4 Update `views/index.ts` to be a barrel that re-exports from home.ts, drafts.ts, repos.ts

## 4. Extract Command Handlers

- [x] 4.1 Create `commands/start.ts` — extract /start handler
- [x] 4.2 Create `commands/generate.ts` — extract /generate handler (with inline SHA or prompt for input)
- [x] 4.3 Create `commands/approve.ts` — extract /approve handler (publish all approved, using core/publish.ts)
- [x] 4.4 Create `commands/drafts.ts` — extract /drafts handler
- [x] 4.5 Create `commands/help.ts` — extract /help handler
- [x] 4.6 Create `commands/schedule.ts` — extract /schedule handler
- [x] 4.7 Create `commands/delete.ts` — extract /delete handler
- [x] 4.8 Create `commands/repos.ts` — extract /repos handler
- [x] 4.9 Create `commands/watch.ts` — extract /watch handler

## 5. Extract Action Handlers

- [x] 5.1 Create `actions/view-change.ts` — extract all `view:*` callback handlers (home, drafts, help, generate, schedule, delete, repos)
- [x] 5.2 Create `actions/draft-detail.ts` — extract `draft:{id}` handler (with ensureImage + photo send logic)
- [x] 5.3 Create `actions/approve.ts` — extract `action:approve:{id}` handler
- [x] 5.4 Create `actions/reject.ts` — extract `action:reject:{id}` handler
- [x] 5.5 Create `actions/publish.ts` — extract `action:publish:{id}` handler (using core/publish.ts)
- [x] 5.6 Create `actions/publish-all.ts` — extract `action:publish_approved` handler (using core/publish.ts)
- [x] 5.7 Create `actions/regenerate.ts` — extract `action:regenerate:{id}` handler
- [x] 5.8 Create `actions/schedule.ts` — extract `action:schedule:{id}` handler
- [x] 5.9 Create `actions/unschedule.ts` — extract `action:unschedule:{id}` handler
- [x] 5.10 Create `actions/edit.ts` — extract `action:edit:{id}` handler
- [x] 5.11 Create `actions/repo-actions.ts` — extract repo action handlers (add_repo, watch, unwatch, delete_repo, confirm_delete_repo, edit_repo)
- [x] 5.12 Create `actions/config-toggle.ts` — extract `config:*:{repoId}` handler
- [x] 5.13 Create `actions/pagination.ts` — extract `page:{n}` handler

## 6. Extract Input Handlers

- [x] 6.1 Create `inputs/commit-sha.ts` — extract `awaiting_input: commit_sha` handler (generate content from SHA)
- [x] 6.2 Create `inputs/schedule.ts` — extract `awaiting_input: schedule` handler
- [x] 6.3 Create `inputs/delete.ts` — extract `awaiting_input: delete` handler
- [x] 6.4 Create `inputs/add-repo.ts` — extract `awaiting_input: add_repo` handler
- [x] 6.5 Create `inputs/edit-draft.ts` — extract `awaiting_input: edit_draft` handler

## 7. Wire Router and Replace Old Handlers

- [x] 7.1 Register all command handlers in the dispatch table in `core/router.ts`
- [x] 7.2 Register all action handlers in the dispatch tables in `core/router.ts`
- [x] 7.3 Register all input handlers in the dispatch table in `core/router.ts`
- [x] 7.4 Add photo-to-text message transition logic to the callback router
- [x] 7.5 Replace `handlers/message.ts` — rewrite to use `core/router.ts` (routeCommand + routeInput)
- [x] 7.6 Replace `handlers/callback.ts` — rewrite to use `core/router.ts` (routeCallback)

## 8. Extract Route Handlers from index.ts

- [x] 8.1 Create `routes/webhook.ts` — extract Telegram webhook handler (handleTelegramWebhook)
- [x] 8.2 Create `routes/github.ts` — extract GitHub webhook endpoint handler
- [x] 8.3 Create `routes/setup.ts` — extract setup webhook handler
- [x] 8.4 Create `routes/migrate.ts` — extract database migration handler
- [x] 8.5 Create `routes/test-x.ts` — extract X API test handler
- [x] 8.6 Create `routes/test-generate.ts` — extract content generation test handler
- [x] 8.7 Create `routes/image.ts` — extract image serving handler
- [x] 8.8 Slim down `index.ts` — keep only fetch() with route matching + delegation, scheduled() cron handler, and rate limiting

## 9. Update Cron Handler

- [x] 9.1 Update `handlers/cron.ts` to use `publishDraft()` from `core/publish.ts` instead of inline publish logic
- [x] 9.2 Update cron imports from `services/grok` to `services/gemini` and `services/storage`

## 10. Cleanup

- [x] 10.1 Remove old `handlers/callback.ts` and `handlers/message.ts` (replaced by router + individual handlers)
- [x] 10.2 Remove `services/grok.ts` if still present after rename
- [x] 10.3 Verify all imports resolve correctly — run `npx tsc --noEmit`
- [ ] 10.4 Deploy and manually test: /start, /generate, /drafts, /repos, publish flow, edit draft, config toggle, cron
