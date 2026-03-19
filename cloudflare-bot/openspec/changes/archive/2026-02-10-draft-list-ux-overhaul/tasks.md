## 1. Database — page_size column and accessors

- [x] 1.1 Add migration in `routes/migrate.ts`: `ALTER TABLE chat_state ADD COLUMN page_size INTEGER DEFAULT 5`
- [x] 1.2 Add `getPageSize(env, chatId)` and `setPageSize(env, chatId, size)` functions in `services/db.ts`

## 2. Settings — page size UI

- [x] 2.1 Update `renderSettings` in `views/settings.ts` to show current page size and a "📏 Page Size" button
- [x] 2.2 Add `renderPageSizeSelect` function in `views/settings.ts` with preset buttons (5, 10, 15, 20)
- [x] 2.3 Export `renderPageSizeSelect` from `views/index.ts`
- [x] 2.4 Handle `config:page_size:N` in `actions/config-toggle.ts` — call `setPageSize`, return settings view
- [x] 2.5 Add `view:page_size_select` case in `actions/view-change.ts` — return `renderPageSizeSelect`

## 3. Draft list — two-row layout with quick actions

- [x] 3.1 Update `renderDraftsList` in `views/drafts.ts`: accept `pageSize` param (replace hardcoded `limit = 10`), render two rows per draft — title row + action row with status-appropriate buttons (✅/📤/🗑). Callback format: `action:list_approve:<draftId>:<listType>:<page>` etc.
- [x] 3.2 Update all call sites of `renderDraftsList` to pass page size: `view-change.ts`, `pagination.ts`, `delete-draft.ts` (confirm delete). Read page size via `getPageSize`.

## 4. Quick action handlers

- [x] 4.1 Create `actions/list-actions.ts` with `listApproveAction`: parse extra to get `draftId:listType:page`, approve draft, re-render list with page size
- [x] 4.2 Add `listPublishAction` in same file: parse extra, publish draft (reuse core publish logic), re-render list
- [x] 4.3 Add `listDeleteAction` in same file: parse extra, show confirmation prompt with `[✅ Yes, Delete] [❌ Cancel]` encoding list context
- [x] 4.4 Add `listConfirmDeleteAction` in same file: parse extra, delete draft + R2 image, re-render list
- [x] 4.5 Add `listCancelDeleteAction` in same file: parse extra, re-render list unchanged

## 5. Router registration

- [x] 5.1 Import and register in `core/router.ts` actionSubHandlers: `list_approve`, `list_publish`, `list_delete`, `list_confirm_delete`, `list_cancel_delete`

## 6. Auto-draft title format

- [x] 6.1 Update `handlers/github-webhook.ts`: store `pr_title` as `repoShortName | originalTitle` for both PR and push events
- [x] 6.2 Update `inputs/commit-sha.ts`: store `pr_title` as `repoShortName | originalTitle`. Pass repo name from `getContentSource` (may need to return repo name from that function).
- [x] 6.3 Update display logic in `renderDraftsList` (`views/drafts.ts`): for auto-generated drafts, parse `pr_title` for repo name (split on ` | `), parse `content` JSON for first tweet text, display as `📝 repo — tweet-preview...`. Fall back to current format if no ` | ` separator.

## 7. Combined Back + Home row

- [x] 7.1 Update `renderDraftsList` in `views/drafts.ts`: combine Back and Home into one row `[◀️ Back, 🏠 Home]`. Also update the empty-list case.
- [x] 7.2 Update `renderDraftCategories` empty state to combine nav buttons into one row

## 8. Verify and deploy

- [x] 8.1 Run `npx tsc --noEmit` — type check passes
- [x] 8.2 Deploy with `npx wrangler deploy`
