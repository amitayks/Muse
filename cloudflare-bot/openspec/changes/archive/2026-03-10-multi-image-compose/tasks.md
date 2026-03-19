## 1. Types: Extend Telegram and Handwrite Types

- [x] 1.1 Add `media_group_id?: string` to `TelegramMessage` interface in `types.ts`
- [x] 1.2 Add `mediaGroupId?: string` to `HandwriteTweet` interface in `types.ts`
- [x] 1.3 Change `ComposeTweet` in `views/home.ts` from `hasMedia?: boolean` to `mediaCount: number`

## 2. Message Handler: Pass media_group_id Through

- [x] 2.1 In `handlers/message.ts`, add `media_group_id` to the message object passed to the handwrite input handler (alongside existing `message_id`, `photo`, `caption`)

## 3. Handwrite Input: Media Group Detection

- [x] 3.1 Update `HandwriteInputContext` in `inputs/handwrite.ts` to include `media_group_id?: string` in the `message` field
- [x] 3.2 In the new-message branch of `handwriteInput`, when a photo arrives with `media_group_id`: check if the last tweet in `handwrite.tweets` has the same `mediaGroupId` — if so, store the photo in R2 and append to that tweet's `media[]`; if not, create a new tweet with `mediaGroupId` set
- [x] 3.3 For single photos (no `media_group_id`), preserve existing behavior: create new tweet with one media entry
- [x] 3.4 Update the `composeTweets` mapping to use `mediaCount: (t.media?.length || 0)` instead of `hasMedia: !!(t.media && t.media.length > 0)`

## 4. Compose Preview: Image Counts and Platform Warnings

- [x] 4.1 Update `renderCompose` in `views/home.ts` to accept `ComposeTweet` with `mediaCount` and render: 1-4 images as repeated 📷 emojis, 5+ as `📷×N`
- [x] 4.2 Add per-tweet X limit warning: if `mediaCount > 4`, show `⚠️ 𝕏: N/4 — only first 4 will post` below that tweet
- [x] 4.3 Add thread-level IG total warning: if sum of all `mediaCount` exceeds 10, show `⚠️ IG: N/10 — only first 10 will post` at the bottom of the preview
- [x] 4.4 Add new i18n strings for the platform warnings in `en.ts` and `he.ts`

## 5. X Publish Pipeline: Multi-Image Upload

- [x] 5.1 In `publishToX` in `core/publish.ts`, change the per-tweet media upload from `tweet.media?.[0]` to upload ALL media items per tweet (up to 4), collecting an array of media IDs per tweet
- [x] 5.2 Change `perTweetMediaIds` type from `(string | null)[]` to `(string[] | null)[]`
- [x] 5.3 Update `postThread` signature in `integrations/x.ts` to accept `perTweetMediaIds?: (string[] | null)[]` and pass the full array to `postTweet` as `mediaIds`

## 6. Compose Action: Update ComposeTweet Usage

- [x] 6.1 Update `handleToggle` and any other callers in `actions/compose.ts` that build `composeTweets` to use `mediaCount` instead of `hasMedia`
