## 1. Database: Published Table Migration

- [x] 1.1 Create migration `010_published_nullable_tweet_ids.sql` using rename-copy-drop pattern: rename `published` to `published_old`, create new `published` table with `tweet_ids TEXT` (nullable), `instagram_post_id TEXT`, `instagram_url TEXT`, copy data from old table, drop old table, recreate index
- [x] 1.2 Update `schema.sql` — change `tweet_ids TEXT NOT NULL` to `tweet_ids TEXT`, add `instagram_post_id TEXT` and `instagram_url TEXT` columns to the published table definition
- [x] 1.3 Update `Published` interface in `types.ts` — make `tweet_ids: string | null`, add `instagram_post_id: string | null` and `instagram_url: string | null`

## 2. Database: Update createPublished Function

- [x] 2.1 Update `createPublished()` in `data/draft-db.ts` to accept optional `tweet_ids`, `tweet_url`, `instagram_post_id`, `instagram_url` parameters and include them in the INSERT statement

## 3. Publish Pipeline: Fix Operation Order and Pass Results

- [x] 3.1 In `publishDraft()` in `core/publish.ts`, reorder the success block: call `createPublished()` BEFORE `updateDraftStatus('published')` so a failed insert doesn't leave the draft in inconsistent state
- [x] 3.2 Extract platform results from `PublishResults` and pass to `createPublished()`: `tweet_ids` from `results.x?.tweet_ids?.join(',')`, `tweet_url` from `results.x?.url`, `instagram_post_id` from first available IG result, `instagram_url` from first available IG URL

## 4. Telegram: Add sendMediaGroup

- [x] 4.1 Add `sendMediaGroup(env, chatId, photoUrls)` function to `integrations/telegram.ts` that calls Telegram's `sendMediaGroup` API with an array of `InputMediaPhoto` objects and returns array of message IDs

## 5. Draft Detail: Display Per-Tweet Media Images

- [x] 5.1 In `draftDetailAction` in `actions/draft-detail.ts`, add logic to extract all photo media keys from `content.tweets[].media[]` before the existing `ensureImage` check
- [x] 5.2 If per-tweet media exists, skip `ensureImage()` and use per-tweet media URLs instead
- [x] 5.3 For single per-tweet image: use existing `sendPhoto` flow with the media URL
- [x] 5.4 For multiple per-tweet images (2+): send images 2–N via `sendMediaGroup` first, then send image 1 via `sendPhoto` with caption and action buttons, return void
