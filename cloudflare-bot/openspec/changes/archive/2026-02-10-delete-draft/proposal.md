## Why

Users accumulate drafts (auto-generated, handwritten, published) with no way to remove unwanted ones from the bot. The only cleanup path is the `/delete` command which deletes published *tweets from X* — not drafts from the database. Users need a simple "Delete" button on every draft detail view to declutter their list.

## What Changes

- Add a "Delete" button to the draft detail view for **all statuses**: draft, approved, scheduled, published, rejected
- Tapping "Delete" shows a confirmation prompt (with the image still visible if present) so the UI transitions instantly
- Confirming deletes the draft row from D1 and navigates back to the draft list
- Cancelling returns to the draft detail view
- Also cleans up R2 image if the draft had one

## Capabilities

### New Capabilities
- `draft-delete`: Delete any draft from the database via a confirm/cancel flow in the draft detail view

### Modified Capabilities

## Impact

- `cloudflare-bot/src/views/drafts.ts` — add Delete button to `renderDraftDetail` for all statuses, add `renderDeleteConfirm` view
- `cloudflare-bot/src/actions/` — new `delete-draft.ts` action handler (confirm + execute)
- `cloudflare-bot/src/core/router.ts` — register new action sub-handlers
- `cloudflare-bot/src/services/db.ts` — reuse existing `deleteDraft` function
- `cloudflare-bot/src/services/storage.ts` — may need image cleanup on delete
