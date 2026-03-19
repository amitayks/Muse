## Why

The bot currently only creates posts from GitHub activity (PRs, commits). Users often want to write their own tweets/threads manually — announcements, thoughts, commentary — while still using the bot's AI polish, image generation, scheduling, and publishing pipeline. Adding a "handwrite" compose mode lets users draft content directly in Telegram chat with a natural thread-writing experience.

## What Changes

- New `/handwrite` command and dashboard button to enter compose mode
- Multi-message accumulation: each user message becomes a tweet in a thread, tracked by Telegram `message_id`
- Silent tracking with counter update on the bot's status message (no interrupting replies)
- Native message editing support via `edited_message` Telegram update handling
- Photo attachment support: user-sent photos are downloaded from Telegram and stored in R2 as per-tweet media
- Toggle buttons for optional AI refinement and image generation before saving
- "Pen Down" action to finalize compose, create draft, and optionally run AI processing
- New `source` column on drafts table to distinguish `auto` (webhook/generate) from `handwrite`
- New "Handwritten" category in draft categories navigation
- Character count feedback (warn when tweet exceeds 280 chars)
- Slash commands typed during compose mode cancel the session (with buffer discard)
- Video support deferred to a future change

## Capabilities

### New Capabilities
- `handwrite-compose`: Compose mode lifecycle — entering, accumulating tweets, editing, media attachment, pen-down finalization, and cancel. Covers the awaiting_input state machine and buffer management.
- `handwrite-media`: Downloading user-sent photos from Telegram, storing in R2, and attaching to drafts during publish. Covers the receive-side media pipeline (existing publish pipeline handles the send-side).

### Modified Capabilities
- `command-dispatch`: New `/handwrite` command, `edited_message` routing, compose-mode-aware message handling (commands cancel compose), new callback prefixes for compose toggles and pen-down
- `view-system`: New compose mode view, "Handwrite" button on dashboard, new draft category for handwritten drafts, handwrite status message with toggles
- `smart-dashboard`: New "Handwrite" button added to dashboard navigation
- `publish-pipeline`: Support per-tweet media attachments from R2 (not just first-tweet image), `source` field on drafts

## Impact

- **Database**: New `source` column on `drafts` table (migration needed), extended `ChatContext` type with handwrite buffer
- **Types**: New `HandwriteTweet` interface, extended `ChatContext` with handwrite state, extended `awaiting_input` union
- **Telegram service**: New `getFileUrl()` for downloading user media, handle `edited_message` update type in worker entry
- **Storage service**: New `storeUserMedia()` for saving Telegram photos to R2
- **Router**: New input handler for handwrite, new action handlers for pen-down/toggles, edited_message dispatch
- **Views**: New compose view, updated dashboard, updated draft categories
- **Commands**: New `/handwrite` command file, registered in setMyCommands
