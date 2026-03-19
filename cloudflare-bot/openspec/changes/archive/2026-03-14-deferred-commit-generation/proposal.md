## Why

The webhook handler currently auto-generates content (AI call + draft creation) immediately when a PR is merged or code is pushed — before the user has any say. This is expensive, slow, and produces drafts the user may not want. The `/generate` command also immediately enters compose mode without giving the user a simple "fast generate" option. Both flows should match the proven pattern from the repost batch notification system: store the event data, notify the user, and let them choose `[⚡ Fast]` (generate with defaults) or `[✏️ Edit]` (enter compose mode with full control). This unifies the UX across all content creation flows and gives users control over when AI resources are spent.

## What Changes

- **New `commit_events` table**: Stores webhook and `/generate` event data (commit/PR metadata, ContentSource JSON) before any AI generation happens. Mirrors the role of `twitter_tweets` in the repost flow.
- **Webhook handler stops auto-generating**: `handlePullRequestEvent` and `handlePushEvent` no longer call `generateContent` or `createDraft`. Instead, they enrich the data (call `getPR()` for PR events), create a `commit_events` row, and send a notification with `[⚡ Fast] [✏️ Edit]` buttons.
- **`/generate` command uses the same flow**: After fetching commit/PR data from GitHub API, it creates a `commit_events` row and shows the same event summary + `[⚡ Fast] [✏️ Edit]` buttons (instead of immediately entering compose mode).
- **New `fastCommitAction` handler**: Handles `action:fast_commit:EVENT_ID`. Reads the event's `source_data`, reads user's commit defaults (`commit_fast_image`, `commit_fast_ai`), generates content, creates draft, links event to draft, and edits the notification in-place to show `[✅ Generated]`.
- **Refactored `editComposeAction` handler**: Now reads from `commit_events` (by event ID) instead of from `drafts.source_data`. Builds `ComposeSourceCommit` from event data and enters compose mode.
- **`source_data` column removed from drafts table**: Content source data lives exclusively in `commit_events`. Drafts get a new `event_id` column (nullable FK to `commit_events`) for linking back to their source event.
- **Webhook notification format changes**: No longer shows generated content preview (since nothing is generated yet). Shows commit/PR summary info instead: event type, repo, title, author, stats. Buttons change from `[✅ Approve] [✏️ Edit] / [👀 View] [🗑 Delete]` to `[⚡ Fast] [✏️ Edit]`, with `[✅ Generated] [👀 View]` after generation.
- **Webhook respects `commit_fast_image` setting**: The `fastCommitAction` reads user defaults and passes `{ generateImagePrompt: commitDefaults.commitFastImage }` to `generateContent`. When image generation is disabled, `imagePrompt` is stripped from the result.
- **`generateContent` strips imagePrompt when disabled**: After `parseContentResponse`, if `options.generateImagePrompt === false`, the `imagePrompt` field is deleted from the result (matching how `refineContent` already works).

## Capabilities

### New Capabilities
- `commit-event-storage`: The `commit_events` table, CRUD operations, status lifecycle, and event-to-draft linking. Covers table schema, data access functions, deduplication, and notification message tracking.
- `commit-fast-generate`: The `fastCommitAction` handler for `action:fast_commit:EVENT_ID`. Covers generation with user defaults, draft creation, event status update, notification edit-in-place, and lazy image generation.

### Modified Capabilities
- `github-integration`: Webhook handlers stop auto-generating. They now create `commit_events` rows and send notification-only messages instead of generating content and creating drafts.
- `commit-data-pipeline`: `generateContent` strips `imagePrompt` when `generateImagePrompt === false`. The `/generate` command flow changes from entering compose mode directly to creating a `commit_events` row and showing `[⚡ Fast] [✏️ Edit]`.
- `webhook-compose-integration`: `editComposeAction` reads from `commit_events` instead of `drafts.source_data`. Notification button layout changes. The `source_data` column is removed from drafts, replaced by `event_id` FK.
- `compose-commit-mode`: Compose entry via `/generate` now goes through the event summary screen first (user clicks `[✏️ Edit]` to enter compose). `enterComposeMode` for commit mode loads source data from `commit_events` via `event_id`.
- `user-settings`: Commit default settings (`commit_fast_image`, `commit_fast_ai`) now affect the `fastCommitAction` behavior, not just compose entry. The webhook auto-generation scenario is replaced by user-initiated fast generation.

## Impact

- **Database**: New `commit_events` table with migration. `drafts` table gets `event_id` column, `source_data` column deprecated/removed. Migration `012_commit_compose.sql` needs updating.
- **Webhook handler** (`handlers/github-webhook.ts`): Major refactor — removes AI generation, adds event creation and new notification format.
- **Router** (`core/router.ts`): Register `fast_commit` action handler.
- **New action** (`actions/fast-commit.ts`): New handler for fast generation from commit events.
- **Refactored action** (`actions/edit-compose.ts`): Reads from `commit_events` instead of drafts.
- **Modified input** (`inputs/commit-sha.ts`): Creates event + shows summary instead of entering compose directly.
- **AI pipeline** (`ai/gemini.ts`): `generateContent` strips imagePrompt when disabled.
- **Data layer** (`data/draft-db.ts`): New `event_id` param in `createDraft`, remove `source_data` param.
- **New data module** (`data/commit-events-db.ts`): CRUD for `commit_events` table.
- **I18n strings** (`ui/strings/en.ts`, `he.ts`): New notification format strings, event summary strings, Fast/Edit button labels for commit context.
- **Views**: Event summary view for `/generate` and webhook notifications.
