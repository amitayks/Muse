## Why

When users send multiple photos in a single Telegram message during compose mode, each photo arrives as a separate webhook update. The bot currently creates a separate tweet for each photo, splitting what the user intended as one tweet with multiple images into N tweets with one image each. This breaks the expected UX for both X (up to 4 images per tweet) and Instagram (carousel posts). Additionally, the X publish pipeline only uploads the first image per tweet, ignoring any additional media.

## What Changes

- Detect Telegram `media_group_id` on incoming photo messages during compose mode and group photos from the same message into a single tweet's `media[]` array
- Update the compose preview to show per-image camera emoji indicators (📷📷📷) and platform limit warnings (X 5/4, IG 11/10)
- Update the X publish pipeline to upload and attach multiple images per tweet (up to 4, silently truncating extras)
- Update `postThread` in the X integration to accept multiple media IDs per tweet instead of a single ID
- Update the `TelegramMessage` type to include `media_group_id`
- Add `mediaGroupId` tracking to `HandwriteTweet` for group detection
- No image deletion support — users can cancel and re-compose if needed

## Capabilities

### New Capabilities
- `media-group-compose`: Telegram media group detection and multi-image-per-tweet buffering during handwrite compose mode

### Modified Capabilities
- `handwrite-compose`: Compose input handler gains media group awareness; compose preview shows image counts and platform warnings
- `publish-pipeline`: X branch uploads up to 4 images per tweet; `postThread` accepts multi-media per tweet
- `telegram-bot`: `TelegramMessage` type extended with `media_group_id`

## Impact

- `cloudflare-bot/src/types.ts` — `TelegramMessage`, `HandwriteTweet`, `ComposeTweet` types
- `cloudflare-bot/src/inputs/handwrite.ts` — media group detection and append logic
- `cloudflare-bot/src/handlers/message.ts` — pass `media_group_id` through to handler
- `cloudflare-bot/src/views/home.ts` — `renderCompose` preview with image counts and warnings
- `cloudflare-bot/src/core/publish.ts` — multi-image upload per tweet for X
- `cloudflare-bot/src/integrations/x.ts` — `postThread` signature change to `(string[] | null)[]`
- `cloudflare-bot/src/ui/strings/en.ts` and `he.ts` — new warning strings
