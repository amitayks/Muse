## 1. Types & Schema

- [x] 1.1 Add `HandwriteTweet` and `HandwriteState` interfaces to `types.ts`
- [x] 1.2 Extend `ChatContext.awaiting_input` union with `'handwrite'` and add optional `handwrite: HandwriteState` field
- [x] 1.3 Add optional `mediaKey?: string` and `mediaType?: 'photo'` to `Tweet` interface
- [x] 1.4 Add `source` column (`TEXT DEFAULT 'auto'`) to drafts table via D1 migration, add `source` field to `Draft` interface

## 2. Telegram Service — Media Download

- [x] 2.1 Add `getFileUrl(env, fileId)` function to `services/telegram.ts` — calls Telegram `getFile` API, returns download URL
- [x] 2.2 Add `storeUserMedia(env, chatId, messageId, fileId)` function to `services/storage.ts` — downloads from Telegram, stores in R2 at `handwrite/{chatId}/{messageId}.jpg`, returns R2 key or null

## 3. Views

- [x] 3.1 Create `renderCompose(tweetsCount, charWarnings, imageGen, aiRefine)` in `views/home.ts` — compose status message with Pen Down, toggle buttons, Cancel
- [x] 3.2 Update `renderHome()` in `views/home.ts` — add "✍️ Handwrite" button in same row as "⚡ Generate"
- [x] 3.3 Update `renderDraftCategories()` in `views/drafts.ts` — add "✍️ Handwritten (N)" category button, query by source, link to `view:drafts_handwrite`
- [x] 3.4 Update `renderDraftsList()` in `views/drafts.ts` — support `handwrite` filter (source='handwrite', status in draft/rejected), pagination as `page:handwrite:N`
- [x] 3.5 Update `renderDraftDetail()` in `views/drafts.ts` — show 📷 indicators for tweets with mediaKey in handwritten drafts
- [x] 3.6 Update `views/index.ts` barrel — export `renderCompose`

## 4. Database Queries

- [x] 4.1 Run D1 migration to add `source` column to drafts table
- [x] 4.2 Add `getDraftsBySource(env, chatId, source, page)` query to `services/db.ts`
- [x] 4.3 Add `getHandwriteDraftCount(env, chatId)` query to `services/db.ts`
- [x] 4.4 Update `createDraft()` in `services/db.ts` to accept optional `source` parameter (defaults to `'auto'`)

## 5. Command & Router Setup

- [x] 5.1 Create `commands/handwrite.ts` — sets awaiting_input to 'handwrite', initializes HandwriteState, sends compose view
- [x] 5.2 Register `/handwrite` in `commandHandlers` in `core/router.ts`
- [x] 5.3 Add `handwrite` to `setMyCommands()` in `services/telegram.ts` with description "Write your own tweet or thread"
- [x] 5.4 Add `view:handwrite` case in `actions/view-change.ts` — enters compose mode (same as command but edits existing message)

## 6. Input Handler — Handwrite Accumulation

- [x] 6.1 Create `inputs/handwrite.ts` — handles text messages during compose: buffers tweet with messageId, updates status message counter, handles photo messages by calling `storeUserMedia` and buffering with mediaKey
- [x] 6.2 Register `handwrite` in `inputHandlers` in `core/router.ts`

## 7. Worker Entry — edited_message Support

- [x] 7.1 Update `index.ts` to detect `edited_message` update type and route to message handler with `isEdit: true` flag
- [x] 7.2 Update `handlers/message.ts` to accept `isEdit` flag — when in compose mode, find tweet by messageId in buffer and update text; when not in compose mode, silently ignore

## 8. Compose Actions

- [x] 8.1 Create `actions/compose.ts` — handles `compose:pendown`, `compose:toggle_image`, `compose:toggle_ai`, `compose:cancel` callbacks
- [x] 8.2 Pen Down handler: collect buffer, create draft with source='handwrite', optionally call Gemini for AI refine and/or image prompt, show renderDraftDetail()
- [x] 8.3 Toggle handlers: flip imageGen/aiRefine in HandwriteState, re-render compose view
- [x] 8.4 Cancel handler: clear state, return renderHome()
- [x] 8.5 Register `compose` prefix in callback dispatcher in `core/router.ts`

## 9. Compose-Aware Command Routing

- [x] 9.1 Update `handlers/message.ts` — when awaiting_input is 'handwrite' and message starts with a recognized slash command, cancel compose session and dispatch command normally

## 10. AI Refinement for Handwritten Content

- [x] 10.1 Add `refineHandwrittenContent(env, tweets, options)` function to `services/gemini.ts` — sends tweets to Gemini with polish instructions (preserve voice, count, order), optionally generates imagePrompt, returns refined DraftContent

## 11. Publish Pipeline — Per-Tweet Media

- [x] 11.1 Update `postThread()` in `services/x.ts` — accept optional `mediaIds` array (one per tweet, null for no-media tweets) instead of single mediaId for first tweet
- [x] 11.2 Update `publishDraft()` in `core/publish.ts` — when DraftContent tweets have `mediaKey` fields, read each from R2, upload to X, build per-tweet mediaIds array; fallback to existing draft-level image_url for auto drafts

## 12. View Change & Pagination Wiring

- [x] 12.1 Add `drafts_handwrite` route in `actions/view-change.ts` — calls `renderDraftsList(env, chatId, 0, 'handwrite')`
- [x] 12.2 Update `actions/pagination.ts` — handle `handwrite` list type in page callbacks

## 13. Help & Registration

- [x] 13.1 Update `renderHelp()` in `views/home.ts` — add /handwrite command description
