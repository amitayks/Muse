## Context

The bot stores drafts in D1 with statuses: draft, approved, scheduled, rejected, published. The draft detail view (`renderDraftDetail` in `views/drafts.ts`) shows status-specific action buttons but has no delete option. A `deleteDraft` function already exists in `db.ts` (line 303) but is unused by any UI flow. Images are stored in R2 with keys referenced by `draft.image_url`.

The callback system in `callback.ts` already handles photo messages with `editMessageCaption` for `action:*` prefixed callbacks, preserving images during state transitions.

## Goals / Non-Goals

**Goals:**
- Add a Delete button to draft detail view for all draft statuses
- Show a confirmation step before deletion (with image preserved if present)
- Delete the draft from D1 and clean up its R2 image on confirm
- Navigate back to draft categories after successful deletion

**Non-Goals:**
- Bulk delete (select multiple drafts at once)
- Deleting the published tweet from X (that's the existing `/delete` command)
- Soft delete / trash / undo — this is a hard delete

## Decisions

**1. Two-step callback flow: `action:delete_draft` → `action:confirm_delete`**

The delete button sends `action:delete_draft:<draftId>`. The handler returns a confirmation view with Confirm/Cancel buttons. Confirm sends `action:confirm_delete:<draftId>`. This follows the existing pattern used by `delete_repo` / `confirm_delete_repo`.

Alternative: Single-step delete with no confirmation. Rejected because accidental deletion is irreversible.

**2. Confirmation view preserves the image via `editMessageCaption`**

When the user taps Delete on a photo message, `callback.ts` already calls `editMessageCaption` for `action:*` prefixed callbacks. The confirmation prompt becomes the new caption — the image stays visible. This gives the user instant UI feedback and avoids the delete+re-send flicker.

No code change needed in `callback.ts` for this — it's already handled.

**3. Delete button placement: last row before Back, on all statuses**

The Delete button goes in its own row at the bottom of the action buttons, just above the Back button. It appears for every status (draft, approved, scheduled, published, rejected). Uses `🗑 Delete` label.

**4. R2 image cleanup on delete**

When a draft has an `image_url` key, delete the R2 object after deleting the D1 row. Failure to delete R2 is logged but not blocking — orphaned images are acceptable over failed deletes.

## Risks / Trade-offs

- [Published draft deletion doesn't remove the tweet from X] → Acceptable. The existing `/delete` command handles that. The Delete button only removes the draft record.
- [R2 cleanup failure leaves orphaned images] → Log and continue. R2 storage cost is negligible.
