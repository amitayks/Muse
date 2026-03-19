## 1. Views — Delete button and confirmation prompt

- [x] 1.1 Add "🗑 Delete" button to `renderDraftDetail` in `views/drafts.ts` for all statuses, in its own row before the Back button. Callback data: `action:delete_draft:<draftId>`
- [x] 1.2 Add `renderDeleteDraftConfirm` function in `views/drafts.ts` that renders a confirmation prompt with draft title, permanent warning, and "✅ Yes, Delete" / "❌ Cancel" buttons. Truncate text to 1024 chars for photo caption compatibility.

## 2. Action handlers

- [x] 2.1 Create `actions/delete-draft.ts` with `deleteDraftAction` handler: loads draft, renders confirmation view via `renderDeleteDraftConfirm`, returns ViewResult
- [x] 2.2 Add `confirmDeleteDraftAction` handler in same file: calls `deleteDraft` from db, deletes R2 image if `image_url` exists (log and continue on failure), returns draft categories view
- [x] 2.3 Add `cancelDeleteDraftAction` handler in same file: returns the draft detail view (re-renders with `renderDraftDetail`)

## 3. Router registration

- [x] 3.1 Import `deleteDraftAction`, `confirmDeleteDraftAction`, `cancelDeleteDraftAction` in `core/router.ts`
- [x] 3.2 Register in `actionSubHandlers`: `delete_draft`, `confirm_delete`, `cancel_delete`

## 4. Verify and deploy

- [x] 4.1 Run `npx tsc --noEmit` — type check passes
- [x] 4.2 Deploy with `npx wrangler deploy`
