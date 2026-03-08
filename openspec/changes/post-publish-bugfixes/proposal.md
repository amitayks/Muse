## Why

After shipping the Instagram post integration, three bugs were discovered during real-world testing of the publish flow. An Instagram-only publish succeeds on the platform but then crashes on the `createPublished` DB insert due to a NOT NULL constraint on `tweet_ids`. The error also masks the success from the user. Separately, per-tweet media images (attached by users during handwrite compose) are never displayed in the draft detail view — they're stored in R2 but the view only checks `draft.image_url`, not `content.tweets[].media[]`.

## What Changes

- **Fix `published` table schema**: Migrate `tweet_ids` from `NOT NULL` to nullable, add columns for Instagram results (`instagram_post_id`, `instagram_url`). Update `createPublished()` to accept and store multi-platform results.
- **Fix publish pipeline error handling**: Reorder `updateDraftStatus` and `createPublished` so a failed insert doesn't leave the draft in an inconsistent "published" state without a published record.
- **Display per-tweet media in draft detail**: Update `draftDetailAction` to extract image URLs from `content.tweets[].media[]` and display them. For multiple images, send images 2–N as a Telegram media group first, then send the first image with caption and action buttons.
- **Add `sendMediaGroup` to Telegram integration**: New function to send 2–10 photos as an album via Telegram's `sendMediaGroup` API.

## Capabilities

### New Capabilities

_(none — all fixes are within existing capabilities)_

### Modified Capabilities

- `publish-pipeline`: Fix `createPublished` to handle nullable `tweet_ids` and accept multi-platform results; reorder status update and published record creation for atomicity.
- `db-domain-split`: Migration to make `published.tweet_ids` nullable and add Instagram result columns.
- `handwrite-media`: Draft detail view must display per-tweet media images from `content.tweets[].media[]`, including multi-image support via `sendMediaGroup`.
- `telegram-bot`: Add `sendMediaGroup` function for sending photo albums.

## Impact

- **Database**: New migration (`010_published_nullable_tweet_ids.sql`) alters `published` table. SQLite doesn't support `ALTER COLUMN`, so the migration must recreate the table.
- **Code**: `core/publish.ts`, `data/draft-db.ts`, `actions/draft-detail.ts`, `integrations/telegram.ts`, `types.ts`, `handlers/callback.ts`
- **Backward compatibility**: Existing published records with `tweet_ids` values are preserved. New records may have `tweet_ids = NULL` for Instagram-only publishes.
