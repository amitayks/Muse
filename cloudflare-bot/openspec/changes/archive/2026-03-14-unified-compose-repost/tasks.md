## 1. Types & State Refactor

- [x] 1.1 Rename `HandwriteState` → `ComposeState` in `types.ts`: add `mode: 'handwrite' | 'repost'` field, add optional `sourceTweet` object type (with `tweetId`, `username`, `displayName`, `text`, `threadText`, `mediaUrl`, `isThread`, `metrics`, `tweetUrl` fields), add optional `sourceAccountId: string`, add optional `batchTweetId: string`
- [x] 1.2 Rename `HandwriteTweet` → `ComposeTweet` in `types.ts` (keep same fields: `messageId`, `text`, optional `media`, optional `mediaGroupId`)
- [x] 1.3 Rename `ChatContext.handwrite` → `ChatContext.compose` in `types.ts`, update the `ChatContext` interface
- [x] 1.4 Update all references to `HandwriteState` → `ComposeState` across the codebase (imports, type annotations, variable names)
- [x] 1.5 Update all references to `ChatContext.handwrite` → `ChatContext.compose` across the codebase (context reads/writes in actions, inputs, commands)
- [x] 1.6 Update all references to `HandwriteTweet` → `ComposeTweet` across the codebase

## 2. DB Migration & Settings Data

- [x] 2.1 Create D1 migration: `ALTER TABLE users ADD COLUMN fast_generate_image INTEGER DEFAULT 0`
- [x] 2.2 In same migration: `ALTER TABLE users ADD COLUMN analyze_source_image INTEGER DEFAULT 1`
- [x] 2.3 Add `getRepostDefaults(env, chatId)` function in `data/user-settings-db.ts` returning `{ fastGenerateImage: boolean, analyzeSourceImage: boolean }`
- [x] 2.4 Add `setRepostDefault(env, chatId, field, value)` function in `data/user-settings-db.ts` for toggling each setting

## 3. I18n Strings

- [x] 3.1 Add repost compose strings to `en.ts`: `compose.repostHeader` (pinned header format), `compose.repostInstructions` (repost-specific empty state), `compose.repostThreadIndicator`, `compose.repostImageIndicator`, `compose.andMoreTweets` (truncation indicator)
- [x] 3.2 Add batch notification strings to `en.ts`: `batch.btnFast` ("⚡ Fast"), `batch.btnEdit` ("✏️ Edit")
- [x] 3.3 Add settings strings to `en.ts`: `settings.repostDefaults` header, `settings.btnFastImage`, `settings.btnSourceAnalysis`
- [x] 3.4 Add Hebrew equivalents for all new strings in `he.ts`

## 4. Compose View — Source Tweet Header

- [x] 4.1 Extend `ComposeOptions` interface in `views/home.ts`: add optional `sourceTweet` (same type as `ComposeState.sourceTweet`), add optional `existingDraftId: string`
- [x] 4.2 Add source tweet header rendering in `renderCompose`: when `options.sourceTweet` present, render pinned header with `@username`, metrics, tweet text as `<a href>` link, separator line. Include thread indicator if `isThread`. Include image indicator if `mediaUrl`.
- [x] 4.3 Add duplicate warning rendering in `renderCompose`: when `options.existingDraftId` present, show warning banner and add `[View Existing]` button to keyboard
- [x] 4.4 Update compose empty state to be mode-aware: show repost-specific instructions when `sourceTweet` is present, existing handwrite instructions otherwise
- [x] 4.5 Add tweet buffer truncation: show max 5 tweets in preview, add "...and N more" indicator for remaining. Truncate each tweet preview to 60 chars.

## 5. Shared Compose Initialization

- [x] 5.1 Create `enterComposeMode` function in `actions/compose-init.ts`: accepts mode, optional sourceTweet, sourceAccountId, batchTweetId, existingDraftId, defaults. Builds initial `ComposeState`, renders compose view, sends message, updates chat state.
- [x] 5.2 Refactor `handwriteCommand` in `commands/handwrite.ts` to call `enterComposeMode` with `mode: 'handwrite'`
- [x] 5.3 Refactor `repostUrlInput` in `inputs/repost-url.ts`: after fetching tweet, build `sourceTweet` from fetched data, call `enterComposeMode` with `mode: 'repost'`, `aiRefine: true`, `imageGen: false`. Remove the `repost_preview` context storage and `renderRepostPreview` call.
- [x] 5.4 Handle inline repost argument in `repostCommand`: when `ctx.args` contains a URL, process it and enter compose mode (same flow as URL input)

## 6. Repost Input — Thread Context

- [x] 6.1 Add thread fetching in `repostUrlInput`: when `conversation_id !== tweetId`, fetch conversation thread from X API (up to 10 tweets), concatenate as `threadText` in `sourceTweet`
- [x] 6.2 Add thread assembly for batch edit: create helper `getThreadContext(env, conversationId)` that queries `twitter_tweets` by `conversation_id`, orders by `thread_position`, and concatenates text
- [x] 6.3 Handle thread fetch failure gracefully: if X API thread fetch fails, proceed with single tweet text (log warning)

## 7. Handwrite Input — State Reference Updates

- [x] 7.1 Update `handwriteInput` in `inputs/handwrite.ts`: change all `context.handwrite` references to `context.compose`, change all `HandwriteState` type references to `ComposeState`
- [x] 7.2 Verify instruction capture, photo handling, edit detection, media group buffering all work with renamed state (functional logic unchanged)

## 8. Compose Action — Mode-Aware Pen Down

- [x] 8.1 Update `composeAction` and all helpers in `actions/compose.ts`: change all `context.handwrite` → `context.compose`, `HandwriteState` → `ComposeState`
- [x] 8.2 Refactor `handlePenDown` to branch on `compose.mode`:
  - `'handwrite'`: existing logic (refine skill, instruction, image gen) — no changes
  - `'repost'` with AI on: call `generateRepostContent` with sourceTweet, optional userTweets, optional instruction; handle source image analysis based on user setting; handle user image analysis based on `analyzeImages` toggle
  - `'repost'` with AI off and user tweets: create draft directly from user tweets with `source: 'repost'`, `original_tweet_id`, `original_tweet_url`
  - `'repost'` with AI off and no tweets: re-render compose (nothing to save)
- [x] 8.3 Add follow prompt logic to repost pen down: after draft creation, if source account is not followed, send follow prompt (move logic from deprecated `rpGenAction`)
- [x] 8.4 Add batch tweet linking: if `compose.batchTweetId` is set, update `twitter_tweets` row with `status: 'drafted'` and `draft_id` after draft creation
- [x] 8.5 Update `buildComposeView` helper to pass `sourceTweet` and `existingDraftId` through to `renderCompose` options

## 9. AI Pipeline — Repost Prompt Extension

- [x] 9.1 Extend `buildRepostUserPrompt` in `ai/repost-prompt.ts`: add optional `threadText`, `userTweets: string[]`, and `instruction: string` parameters. When present, append "FULL THREAD CONTEXT", "MY INITIAL THOUGHTS", and "WHAT I'M GOING FOR" sections.
- [x] 9.2 Update `generateRepostContent` in `ai/repost-generate.ts`: add optional `userTweets` and `instruction` parameters, pass through to `buildRepostUserPrompt`
- [x] 9.3 Update `generateRepostContent` to handle source image analysis: accept `analyzeSourceImage` boolean, only fetch/encode source image when true
- [x] 9.4 Update `generateRepostContent` to handle user image parts: accept optional `userImageParts` (pre-built by `buildImageParts`), append to Gemini call alongside source image parts

## 10. Quote Skill — Initial Thoughts Paragraph

- [x] 10.1 Add "initial thoughts" paragraph to `QUOTE_EN` in `skills/quote.ts`: self-directed text about sometimes having rough thoughts as a starting point, not a template to copy
- [x] 10.2 Add Hebrew equivalent paragraph to `QUOTE_HE` in `skills/quote.ts`
- [x] 10.3 Update default prompt seed (if applicable) to include the new paragraph in the DB seed

## 11. Batch Notifications — Button Layout

- [x] 11.1 Update `buildBatchPage` in `services/batch-notification.ts`: change per-tweet text preview to be wrapped as `<a href="tweet_url">text...</a>` hyperlink
- [x] 11.2 Update `buildBatchPage` button row: replace `[⚡ Generate @username]` + `[🔗 Open]` with `[⚡ Fast]` (`action:fast_gen:TWEET_ID`) + `[✏️ Edit]` (`action:edit_rp:TWEET_ID`)
- [x] 11.3 Keep existing `[✅ Generated]` button for already-drafted tweets (callback_data `draft:DRAFT_ID`)

## 12. Batch Actions — Fast Generate

- [x] 12.1 Create `fastGenerateAction` handler for `action:fast_gen:TWEET_ID`: fetch tweet from `twitter_tweets`, read user's repost default settings (`fast_generate_image`, `analyze_source_image`), call `generateRepostContent` with defaults (AI on, no user tweets, no instruction), create draft with `source: 'repost'`, update tweet status, rebuild batch message, send draft-ready notification
- [x] 12.2 Register `fast_gen` in `actionSubHandlers` in `router.ts`
- [x] 12.3 Handle image generation in fast mode: if `fast_generate_image` is on, call `ensureImage` after draft creation (lazy — don't block batch message update)
- [x] 12.4 Handle fast generate failure: send error notification, don't modify batch message

## 13. Batch Actions — Edit Repost

- [x] 13.1 Create `editRepostAction` handler for `action:edit_rp:TWEET_ID`: fetch tweet from `twitter_tweets`, build `sourceTweet` from DB data (including thread context via `getThreadContext` if `is_thread`), call `enterComposeMode` with `mode: 'repost'`, `batchTweetId` set
- [x] 13.2 Register `edit_rp` in `actionSubHandlers` in `router.ts`

## 14. Settings View — Repost Defaults

- [x] 14.1 Extend `renderSettings` in `views/settings.ts`: add "🔄 Repost Defaults" section with two toggle buttons: `[🎨 Fast Image: OFF/ON]` and `[📷 Source Analysis: ON/OFF]`
- [x] 14.2 Add settings toggle handlers: `settings:rp:fast_image` and `settings:rp:source_analysis` callbacks in `settingsKeysAction`. Each toggles the DB value and re-renders settings.
- [x] 14.3 Register new settings callbacks in the router (handled via existing `settings` prefix → `settingsKeysAction`)

## 15. Router — Action Handler Registration

- [x] 15.1 Register `fast_gen` → `fastGenerateAction` in `actionSubHandlers`
- [x] 15.2 Register `edit_rp` → `editRepostAction` in `actionSubHandlers`
- [x] 15.3 Keep deprecated `rp_gen`, `rp_gen_anyway`, `rp_cancel` handlers for in-flight backward compat

## 16. Deprecation & Cleanup

- [x] 16.1 Mark `rpGenAction`, `rpCancelAction` as deprecated (add comment, keep functional)
- [x] 16.2 Mark `renderRepostPreview`, `renderRepostGenerating` as deprecated (add comment, keep functional)
- [x] 16.3 Keep `repost_preview` field in `ChatContext` type (for in-flight states) but stop populating it in new code
- [x] 16.4 Update `repostUrlInput` to no longer store `repost_preview` in context (it now stores `compose` instead)

## 17. Integration Testing

- [ ] 17.1 Test handwrite flow end-to-end: enter compose → send tweets → pen down → draft created with `source: 'handwrite'` (verify rename didn't break anything)
- [ ] 17.2 Test repost flow end-to-end: `/repost URL` → compose mode with source tweet displayed → pen down with AI → draft created with `source: 'repost'`, `original_tweet_id` set
- [ ] 17.3 Test repost with user tweets: enter repost compose → send text messages → pen down → AI receives "MY INITIAL THOUGHTS" in prompt
- [ ] 17.4 Test repost with instruction: enter repost compose → set instruction → pen down → AI receives "WHAT I'M GOING FOR" in prompt
- [ ] 17.5 Test repost with AI off: enter repost compose → toggle AI off → send tweets → pen down → draft created from user tweets directly (no AI call)
- [ ] 17.6 Test batch fast generate: click [⚡ Fast] → draft created → batch message updated inline → draft-ready notification sent
- [ ] 17.7 Test batch edit repost: click [✏️ Edit] → new compose message sent → compose session works → pen down creates draft → tweet status updated
- [ ] 17.8 Test repost settings: toggle fast image and source analysis in settings → verify they affect fast generate behavior
- [ ] 17.9 Test thread context: repost a thread tweet → verify full thread text passed to AI
- [ ] 17.10 Test duplicate detection in compose: repost a tweet with existing draft → warning shown, View Existing button present
- [ ] 17.11 Test compose truncation: buffer 8+ tweets → verify only 5 shown with "...and 3 more" indicator
