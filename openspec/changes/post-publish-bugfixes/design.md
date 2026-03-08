## Context

The Instagram post integration was shipped and publishing to Instagram works correctly. However, three bugs were found in the post-publish flow:

1. The `published` table has `tweet_ids TEXT NOT NULL` from the original X-only design. Instagram-only publishes have no tweet_ids, causing `createPublished()` to fail with a constraint violation.
2. In `publishDraft()`, `updateDraftStatus('published')` runs before `createPublished()`. If the insert fails, the draft is stuck in "published" status without an actual published record.
3. Per-tweet media images (from handwrite compose) are stored in `content.tweets[].media[].key` but the draft detail view only checks `draft.image_url` — user-attached images are never displayed.

## Goals / Non-Goals

**Goals:**
- Make `published.tweet_ids` nullable so Instagram-only publishes don't crash
- Store multi-platform results in the published record (tweet_ids, instagram post_id, URLs)
- Ensure draft status and published record are consistent — don't mark as published if the record insert fails
- Display per-tweet media images in draft detail view for all draft statuses
- Support showing multiple attached images (send extras as album, first image with caption+buttons)

**Non-Goals:**
- Changing the Instagram publishing logic itself (it works correctly)
- Adding `sendMediaGroup` support for video media (photos only for now)
- Refactoring the entire draft detail rendering (minimal changes to existing flow)

## Decisions

### D1: SQLite migration strategy for making `tweet_ids` nullable

**Decision**: Recreate the `published` table via migration using SQLite's rename-copy-drop pattern.

**Alternatives considered**:
- _INSERT default empty string_: Workaround, not a real fix. Downstream code would need to handle empty string vs null inconsistently.
- _Add new nullable column, stop using old one_: Leaves dead column, confusing.

**Approach**: Migration `010_published_nullable_tweet_ids.sql`:
1. `ALTER TABLE published RENAME TO published_old`
2. `CREATE TABLE published (...)` with `tweet_ids TEXT` (nullable) and new columns `instagram_post_id TEXT`, `instagram_url TEXT`
3. `INSERT INTO published SELECT ... FROM published_old`
4. `DROP TABLE published_old`

Also update `schema.sql` for new installations.

### D2: Operation ordering in publishDraft()

**Decision**: Run `createPublished()` before `updateDraftStatus('published')`. If the insert fails, the draft stays in its current status (approved/scheduled).

**Rationale**: The published record is the authoritative proof of success. Status should only change after the record exists. This is simpler than wrapping in a try/catch with rollback.

### D3: Multi-image display in Telegram via draft detail

**Decision**: When a draft has per-tweet media, extract all image keys. If there are 2+ images, send images 2–N as a `sendMediaGroup` album first (no caption, no keyboard). Then send image 1 with caption and action buttons via `sendPhoto` (existing pattern).

**Rationale**: Telegram's `sendMediaGroup` doesn't support inline keyboards. By sending the album first and the primary image+buttons second, the user sees all images and the action buttons stay on the last (primary) message — preserving the current interactive UX.

**Approach in `draftDetailAction`**:
1. Parse `content.tweets[].media[]` to collect all photo keys
2. Fall back to `draft.image_url` / `ensureImage()` if no per-tweet media
3. If multiple images: send album of extras first, then primary image with view
4. If single image: existing `sendPhoto` flow (unchanged)

### D4: `createPublished` signature update

**Decision**: Expand `createPublished()` to accept optional `tweet_ids`, `tweet_url`, `instagram_post_id`, `instagram_url` from publish results. The caller (`publishDraft`) extracts these from `PublishResults` and passes them through.

## Risks / Trade-offs

- **[Table recreation in production]** → The rename-copy-drop migration is safe for D1 since `published` is append-only and not heavily queried during writes. The migration runs in a single D1 batch.
- **[Album messages can't be edited]** → Once a `sendMediaGroup` is sent, it can't be updated via `editMessage`. If the user navigates away and back, they may see orphaned album messages. This is acceptable since it matches how Telegram albums work natively.
- **[Callback handler complexity]** → The `draftDetailAction` now needs to handle the album-then-photo flow and return `void` (it handles its own messaging). This is already the pattern used for single-photo drafts.

## Migration Plan

1. Deploy migration `010_published_nullable_tweet_ids.sql` via `wrangler d1 migrations apply`
2. Deploy code changes (all backward-compatible — existing published records with tweet_ids still work)
3. No rollback needed for the migration — the new table is a superset of the old one
