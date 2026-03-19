## Why

The repost and batch notification flows are rigid — they generate content with fixed AI behavior, always produce images, and give users zero control over the output. Meanwhile, the handwrite compose flow has evolved into a flexible composition system with instruction mode, image analysis toggles, and AI controls. These two flows solve related problems (creating tweet drafts) but share no code or UX patterns, creating inconsistency for users and duplication for developers. Unifying the compose session as the shared foundation for both handwrite and repost entry points gives users consistent control across all content creation, while consolidating the codebase around a single reusable compose architecture.

## What Changes

- **Unified `ComposeState` replaces `HandwriteState`**: A new `ComposeState` type adds a `mode` field (`'handwrite' | 'repost'`) and optional `sourceTweet` context. The existing `HandwriteState` is renamed/replaced throughout. All compose logic (toggles, instruction, message buffering, pen down) operates on `ComposeState` regardless of entry point.
- **Repost enters compose mode directly**: After fetching the tweet, the bot sends a compose message with the source tweet embedded at the top — no separate "preview then generate" step. The user gets immediate access to all compose controls (image, AI, instruction, pen down). AI defaults to ON for repost mode.
- **Repost compose view with source tweet**: `renderCompose` is extended to display the source tweet (author, text as clickable link, metrics) above the user's tweet buffer. The source tweet URL is embedded as a hyperlink in the message text, eliminating the need for a separate "Open Tweet" button.
- **Pen down branches by mode**: The pen-down handler selects the `quote` skill for repost mode and the `refine` skill for handwrite mode. For repost, user-provided tweets are passed as "initial thoughts" in the AI prompt. For handwrite, behavior is unchanged.
- **Quote skill updated for initial thoughts**: A small paragraph is added to the `quote` skill acknowledging that the AI may have rough initial thoughts to use as a starting point, maintaining the self-directed writing approach.
- **Repost prompt extended for user tweets**: `buildRepostUserPrompt` gains an optional `userTweets` section ("MY INITIAL THOUGHTS") and an optional `instruction` section ("WHAT I'M GOING FOR"), framed as self-directed context.
- **Batch notifications gain "Fast Generate" / "Edit Repost"**: Per-tweet buttons change from `[⚡ Generate @username]` to `[⚡ Fast] [✏️ Edit]`. "Fast Generate" creates a draft immediately (AI on, image off by default, no instruction) and updates the batch message inline. "Edit Repost" opens a new compose message with the source tweet pre-loaded from stored `twitter_tweets` data (no extra API call).
- **User settings for repost defaults**: New per-user settings control default image generation for fast mode and default source image analysis. Stored as columns on the `users` table.
- **Full thread context for manual repost**: When the source tweet is a thread, the system fetches sibling tweets (from X API for manual `/repost`, from `twitter_tweets` for batch) and passes the full thread text to the AI.
- **Shared compose utilities**: Reusable functions extracted/consolidated: `buildComposeView`, `handlePenDown` (with mode branching), `enterComposeMode` (shared state initialization), toggle handlers — reducing duplication between entry points.

## Capabilities

### New Capabilities
- `compose-repost-mode`: Repost-specific compose behavior — source tweet display, mode-aware pen down with `quote` skill, user tweets as initial thoughts, instruction support for reposts, repost-mode defaults (AI on, image off), and thread context fetching
- `repost-settings`: Per-user repost default settings — fast generate image toggle, source image analysis toggle, stored on `users` table, rendered in settings view
- `batch-compose-integration`: Batch notification buttons updated to "Fast Generate" / "Edit Repost", fast generate inline flow with batch message update, edit repost opens compose session from stored tweet data

### Modified Capabilities
- `handwrite-compose`: `HandwriteState` renamed to `ComposeState` with `mode` and `sourceTweet` fields; `renderCompose` extended to display source tweet context; `enterComposeMode` extracted as shared initializer; pen down branches on mode for skill selection
- `repost-system`: Manual `/repost` flow skips separate preview step and enters compose mode directly; `buildRepostUserPrompt` extended with `userTweets` and `instruction` sections; quote skill gains "initial thoughts" paragraph; `generateRepostContent` accepts optional user tweets and instruction
- `twitter-batch-notifications`: Per-tweet buttons changed from `[Generate] [Open]` to `[Fast] [Edit]`; fast generate handler added; edit repost handler opens compose from DB data; batch message inline update on fast generate
- `compose-instruction`: Instruction capture now works in both handwrite and repost modes (no changes to instruction mechanics, but compose state type changes from `HandwriteState` to `ComposeState`)
- `compose-image-analysis`: Image analysis toggles work in both modes; source tweet image is always analyzed in repost mode (separate from user image analysis toggle)
- `user-settings`: New repost defaults section in settings view with two toggles
- `publish-pipeline`: No functional changes, but repost pen-down now creates drafts through the compose path instead of the `rpGenAction` path — same `createDraft` with `source: 'repost'`

## Impact

- **Types**: `HandwriteState` → `ComposeState` with new `mode`, `sourceTweet`, `sourceAccountId`, `batchTweetId` fields. `ChatContext.handwrite` → `ChatContext.compose`. `awaiting_input: 'handwrite'` remains the same value (backward compat with message handler routing).
- **Views**: `renderCompose` gains source tweet section and mode-aware empty state text. `renderRepostPreview` deprecated (replaced by compose view). New `renderRepostComposeHeader` helper. Batch notification `buildBatchPage` updated button layout.
- **Actions**: `composeAction` pen-down handler branches on `mode`. New `fastGenerateAction` for batch fast-generate. New `editRepostAction` to open compose from batch. `rpGenAction` and `rpCancelAction` deprecated (replaced by compose flow).
- **Inputs**: `repostUrlInput` now initializes `ComposeState` with `mode: 'repost'` and enters compose mode. `handwriteInput` updated to reference `ComposeState`.
- **AI**: `buildRepostUserPrompt` extended. Quote skill text updated. `generateRepostContent` accepts new optional parameters.
- **Skills**: `quote` skill EN/HE updated with "initial thoughts" paragraph.
- **Settings**: Two new columns on `users` table. Settings view extended.
- **Strings**: New i18n entries for repost compose, batch buttons, settings labels. Some repost strings deprecated.
- **DB**: `users` table migration for new setting columns. No changes to `drafts` or `twitter_tweets` schema.
- **Router**: New action handlers registered (`fast_gen`, `edit_rp`). Old handlers (`rp_gen`, `rp_gen_anyway`) deprecated but kept temporarily for in-flight messages.
