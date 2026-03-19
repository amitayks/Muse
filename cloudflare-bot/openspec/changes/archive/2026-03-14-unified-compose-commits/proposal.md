## Why

The generate-from-commits flow (`/generate` and GitHub webhooks) suffers from the same rigidity the repost flow had before `unified-compose-repost`: it generates content automatically with zero user control — no instruction support, no ability to add initial thoughts, no toggle controls, and no choice between quick generation and full compose. Meanwhile, the compose system now supports both handwrite and repost modes with a unified `ComposeState`, shared initialization, mode-aware pen down, and full control surfaces (AI, image, instruction, analyze). Extending the compose architecture to cover commit-based generation gives users consistent control across all three content creation flows, eliminates the duplicated generation logic in the webhook handler, and follows the image generation pattern established in handwrite (combining image skill with identity and tweet content rather than standalone Gemini image calls).

## What Changes

- **`ComposeState` gains `mode: 'commit'`**: A new compose mode for commit-based content. Adds optional `sourceCommit` context (repo, PR/commit title, commit messages, file names, stats) parallel to `sourceTweet` for repost mode.
- **`/generate` enters compose mode**: After fetching PR/commit data from GitHub, the bot enters compose mode with the source commit displayed at top — instead of immediately calling AI. User gets full control (AI toggle, image toggle, instruction, message buffering) before hitting Pen Down.
- **Compose view extended with commit header**: `renderCompose` renders a header section for commit mode showing repo name, PR/commit title, commit count, file count, and additions/deletions stats.
- **Pen down branches for commit mode**: `handlePenDown` selects the `work-progress` skill for commit mode. User tweets passed as "initial thoughts", instruction passed as "what I'm going for" — same pattern as repost mode's quote skill extension.
- **`work-progress` skill gains "initial thoughts" paragraph**: Same self-directed paragraph added to quote skill — acknowledging that the AI may have rough thoughts forming. Maintains first-person perspective.
- **`buildContentPrompt` extended**: Accepts optional `userTweets` and `instruction` parameters, appending "MY INITIAL THOUGHTS" and "WHAT I'M GOING FOR" sections when present.
- **`generateContent` extended**: Accepts optional user tweets, instruction, and user image parts. Passes through to `buildContentPrompt` and handles multimodal image analysis.
- **Image generation follows handwrite pattern**: Instead of standalone `ensureImage` calls, image prompt generation is combined with the AI refinement call (identity + skill + tweet content → imagePrompt in same response). Uses `refineHandwrittenContent` pattern where `generateImagePrompt` flag controls whether imagePrompt is included.
- **GitHub webhook notifications gain "Fast Generate" / "Edit Commit"**: PR merged and push notifications change from `[Approve] [View] [Edit] [Delete]` to `[⚡ Fast] [✏️ Edit] [👀 View] [🗑 Delete]`. "Fast Generate" creates a draft immediately (current webhook behavior). "Edit Commit" opens a compose session with the source commit pre-loaded.
- **Webhook handler refactored to skip auto-generation**: The webhook handler no longer auto-generates content. Instead, it stores the content source data and sends a notification with the new button layout. Auto-generation moves to the "Fast Generate" action.
- **Shared `enterComposeMode` extended**: Supports `mode: 'commit'` with `sourceCommit` context, mode-aware defaults (AI on, image on for commits).
- **`finalizeDraft` reused for commit mode**: The shared draft finalization from compose.ts handles image generation, display, and state update — eliminating duplicated logic in `commitShaInput`.
- **Shared utility extractions**: Common patterns across repost and commit generation (prompt section building, status message formatting, draft finalization with image handling) extracted into reusable utilities.

## Capabilities

### New Capabilities
- `compose-commit-mode`: Commit-specific compose behavior — source commit display, mode-aware pen down with `work-progress` skill, user tweets as initial thoughts, instruction support for commits, commit-mode defaults (AI on, image on), GitHub data as compose context
- `webhook-compose-integration`: GitHub webhook notification buttons updated to "Fast Generate" / "Edit Commit", fast generate inline flow (preserving current auto-gen behavior as one-click action), edit commit opens compose session from stored webhook data

### Modified Capabilities
- `handwrite-compose`: `ComposeState.mode` gains `'commit'` value; `renderCompose` extended with commit header section; `enterComposeMode` supports commit mode; pen down branches for commit mode with `work-progress` skill selection
- `commit-data-pipeline`: `buildContentPrompt` extended with optional `userTweets` and `instruction` sections; `generateContent` gains optional parameters for user context; content source data stored on webhook notification for deferred generation
- `github-integration`: Webhook handler no longer auto-generates content — stores source data and sends notification; new `fast_gen_commit` and `edit_commit` action handlers; notification button layout changed
- `compose-instruction`: Instruction capture now works in commit mode (no changes to instruction mechanics, but compose state type gains commit mode)
- `compose-image-analysis`: Image analysis toggles work in commit mode; source commit has no source image (unlike repost), so analyze only applies to user-attached images
- `image-generation`: Commit compose follows handwrite pattern — imagePrompt generated as part of AI call (identity + skill + content) rather than standalone; webhook fast-generate uses same pattern
- `user-settings`: New commit defaults section in settings view with toggles for fast-generate image and AI behavior

## Impact

- **Types**: `ComposeState.mode` type widens from `'handwrite' | 'repost'` to `'handwrite' | 'repost' | 'commit'`. New `ComposeSourceCommit` interface. `EnterComposeOptions` gains `sourceCommit` field.
- **Views**: `renderCompose` gains commit header section. Webhook notification view refactored with new button layout. Settings view gains commit defaults section.
- **Actions**: `composeAction` pen-down handler gains commit branch. New `fastGenCommitAction` and `editCommitAction` handlers. `commitShaInput` refactored to enter compose mode instead of auto-generating.
- **AI**: `buildContentPrompt` and `generateContent` extended. `work-progress` skill text updated with initial thoughts paragraph.
- **Webhook handler**: Refactored from auto-generate to notification-only with deferred generation. Content source data serialized in callback data or stored temporarily.
- **Router**: New action handlers registered (`fast_gen_commit`, `edit_commit`).
- **Strings**: New i18n entries for commit compose header, webhook buttons, settings labels.
- **DB**: New columns on `users` table for commit defaults. No changes to `drafts` schema.
- **Settings**: Commit defaults toggles (fast image, fast AI).
