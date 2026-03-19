# Tasks: bot-ux-polish

## 1. Types & Infrastructure

- [x] 1.1 Add optional `url` field to `InlineButton` type in `types.ts`
- [x] 1.2 Add `setMyCommands()` function to `services/telegram.ts`
- [x] 1.3 Add `getNextScheduledDraft()`, `getDraftStatusCounts()`, and `getPublishedByDraft()` to `services/db.ts`
- [x] 1.4 URL buttons work natively — Telegram API accepts both `callback_data` and `url` fields as-is

## 2. Smart Dashboard

- [x] 2.1 Rewrite `renderHome()` in `views/home.ts` to be async with `env` and `chatId` params — show next scheduled post, queue stats, dynamic buttons
- [x] 2.2 Update all callers of `renderHome()` to pass `env` and `chatId`: `view-change.ts`, `router.ts`, `callback.ts`, `message.ts`, command files
- [x] 2.3 Update `views/index.ts` barrel to re-export the new async `renderHome`

## 3. Draft Categories Navigation

- [x] 3.1 Add `renderDraftCategories()` view in `views/drafts.ts` — shows category buttons with counts (Auto-generated, Approved, Scheduled)
- [x] 3.2 Update `renderDraftsList()` to accept a `listType` filter parameter (`auto` | `approved` | `scheduled`) and filter accordingly
- [x] 3.3 Change `view:drafts` route in `view-change.ts` to show categories instead of flat list
- [x] 3.4 Add new view routes: `view:drafts_auto`, `view:drafts_approved`, `view:drafts_scheduled` in `view-change.ts`

## 4. Pagination with List Type

- [x] 4.1 Update `paginationAction` in `actions/pagination.ts` to parse `page:TYPE:N` format with backwards-compatible fallback for `page:N`
- [x] 4.2 Update `renderDraftsList()` pagination buttons to use `page:TYPE:N` format
- [x] 4.3 Add repo pagination to `renderReposList()` with `page:repos:N` callbacks

## 5. Vertical List Layouts

- [x] 5.1 Update `renderDraftsList()` button layout: one button per row, 10 per page, longer titles (40 chars)
- [x] 5.2 Update `renderReposList()` button layout: one button per row, paginated at 10

## 6. Merged Repo View

- [x] 6.1 Merge config toggles from `renderRepoConfig()` into `renderRepoDetail()` — single screen with toggles + actions
- [x] 6.2 Update `configToggleAction` in `actions/config-toggle.ts` to return merged `renderRepoDetail()` instead of `renderRepoConfig()`
- [x] 6.3 Remove `editRepoAction` from `actions/repo-actions.ts` and its entry in `router.ts` dispatch table
- [x] 6.4 Remove `renderRepoConfig()` from `views/repos.ts` and barrel re-export

## 7. Inline Status Transitions

- [x] 7.1 Update `approveAction` in `actions/approve.ts` to return `renderDraftDetail()` instead of `renderSuccess()`
- [x] 7.2 Update `publishAction` in `actions/publish.ts` to return `renderDraftDetail()` with published state
- [x] 7.3 Add published state case to `renderDraftDetail()` in `views/drafts.ts` — show "View on X" URL button, fetch tweet_url from published record
- [x] 7.4 Update `rejectAction` in `actions/reject.ts` to return `renderDraftDetail()` instead of `renderSuccess()`

## 8. Telegram Command Menu

- [x] 8.1 Call `setMyCommands()` in `routes/setup.ts` after `setWebhook` — register all 9 commands with descriptions

## 9. TypeScript Verification

- [x] 9.1 Run `npx tsc --noEmit` and fix any type errors — passes clean
