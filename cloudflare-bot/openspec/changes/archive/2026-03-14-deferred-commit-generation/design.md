## Context

The system has two entry points for commit/PR-based content creation:

1. **Webhook handler** (`handlers/github-webhook.ts`): Fires when a PR is merged or code is pushed. Currently calls `generateContent()` (AI), creates a draft, and sends a notification with `[✅ Approve] [✏️ Edit] / [👀 View] [🗑 Delete]`.
2. **`/generate` command** (`inputs/commit-sha.ts`): User provides a commit SHA. Currently fetches from GitHub API and immediately enters compose mode.

The repost flow already has the correct pattern via `twitter-batch-notifications`: store the source data, send a notification with `[⚡ Fast] [✏️ Edit]`, and let the user decide when to generate. The commit flow should match this pattern.

The `twitter_tweets` table serves as the event store for repost — storing tweet data, lifecycle status, draft linkage, and notification message ID. No equivalent exists for commits. The `repos` table is config-level (like `twitter_accounts`), not event-level.

Currently, `source_data` is stored on the `drafts` table for compose re-entry. With the new event table, this data belongs on the event — the draft just links back to its source event.

## Goals / Non-Goals

**Goals:**
- Defer all AI generation to user action (no auto-generation on webhook)
- Unify webhook and `/generate` into the same `[⚡ Fast] [✏️ Edit]` pattern
- Create `commit_events` table as the event store (parallel to `twitter_tweets`)
- Move `source_data` from drafts to `commit_events`
- Respect `commit_fast_image` and `commit_fast_ai` settings in fast generation
- Fix `generateContent` to strip `imagePrompt` when `generateImagePrompt === false`

**Non-Goals:**
- Batching multiple webhook events into one notification (keep 1 event = 1 notification)
- Renaming the overloaded `pr_number`/`pr_title`/`commit_sha` columns on `drafts` (they're used broadly by all draft types — renaming is a separate refactor)
- Changing the repost flow (it already works correctly)
- Adding overview update logic to fast generation (overview updates can be deferred)

## Decisions

### Decision 1: New `commit_events` table (not reusing `repos` or `drafts`)

**Chosen:** New `commit_events` table with denormalized display fields + `source_data` JSON blob.

**Why not `repos`?** The `repos` table is config-level (1 row per watched repo). Webhook events are 1:N per repo — multiple PRs can merge for the same repo. Storing event data on repos would overwrite previous events.

**Why not "pending" drafts?** Creating drafts with empty content muddies the draft concept. Drafts should always have generated content. The event table cleanly separates "something happened" from "content was generated."

**Why denormalize display fields?** Same pattern as `twitter_tweets` — `text`, `author_username` are denormalized for fast notification rendering without JSON parsing, while `metrics` holds richer data as JSON. In `commit_events`, `title`, `author`, `branch`, stats are denormalized for notifications, while `source_data` holds the full `ContentSource` for AI generation.

### Decision 2: Table named `commit_events` (not `webhook_events`)

Both webhooks and `/generate` create rows in this table. "webhook_events" would be misleading since `/generate` is manual. "commit_events" accurately describes what's tracked — code change events (PRs and pushes both map to commits) regardless of how they were discovered.

### Decision 3: PR enrichment at event creation time (not deferred)

**Chosen:** Call `getPR()` at webhook/generate time to get full PR data (file list, commit list) before storing the event.

**Why not defer?** The webhook response time isn't user-facing. Having complete data means `fastCommitAction` doesn't need GitHub API calls. Avoids issues if the PR is force-pushed or repo access changes after merge.

For push events, all data comes from the webhook payload directly — no API call needed.

### Decision 4: `source_data` on `commit_events`, not on `drafts`

**Chosen:** Move `source_data` from `drafts` to `commit_events`. Add `event_id` FK on drafts.

The `source_data` column on `drafts` was added in the `unified-compose-commits` change specifically for compose re-entry. Since we haven't deployed that migration yet, we can cleanly move it. The event table is the natural owner — it's the source of truth for what happened, and `source_data` describes the event, not the draft.

The `edit_compose` action now reads `commit_events` by `event_id` instead of `drafts.source_data`.

### Decision 5: Callback data format uses event ID

**Chosen:** `action:fast_commit:{eventId}` and `action:edit_compose:{eventId}`

The event ID is the primary key for looking up all data needed for both Fast and Edit flows. This matches how the repost flow uses tweet IDs: `action:fast_gen:{tweetId}` and `action:edit_rp:{tweetId}`.

Note: `edit_compose` callback_data changes from `action:edit_compose:{draftId}` to `action:edit_compose:{eventId}`. This is safe because the old format was never deployed (it was added in the not-yet-deployed `unified-compose-commits` change).

### Decision 6: Notification format — event summary without content preview

**Chosen:** Show commit/PR metadata in the notification (event type, repo, title, author, stats). No generated content preview since nothing is generated yet.

Post-generation (after Fast), the notification edits in-place to show `[✅ Generated] [👀 View]` — same pattern as repost batch `[✅ Generated]`.

### Decision 7: `/generate` shows event summary instead of entering compose directly

**Chosen:** After fetching commit/PR data, `/generate` creates a `commit_events` row and shows the same event summary + `[⚡ Fast] [✏️ Edit]` message that webhooks show.

This unifies the UX: both entry points give the user the same choice. The message is shown inline (editing the "Generating..." status message), not as a separate notification.

### Decision 8: `generateContent` strips imagePrompt when disabled

**Chosen:** After `parseContentResponse`, if `options.generateImagePrompt === false`, delete `result.content.imagePrompt`.

This matches how `refineContent` already handles it (line 361 of `gemini.ts`). The `parseContentResponse` function always adds a fallback `imagePrompt` — we strip it post-parse rather than trying to prevent the fallback.

## Risks / Trade-offs

**[Risk] Existing tests/flows depend on auto-generation** → The webhook handler tests (if any) expect drafts to be created. These need updating. Manual testing tasks from `unified-compose-commits` (section 17) reference the old auto-generation flow and need rewriting.

**[Risk] `unified-compose-commits` has undeployed changes that conflict** → The `source_data` column migration (012_commit_compose.sql) and `edit_compose` action from that change need to be updated/replaced. Since neither is deployed, we can modify them directly.

**[Trade-off] Webhook no longer creates drafts automatically** → Users who relied on "check Telegram later, drafts ready" now need to click Fast. This is intentional — it gives control and saves AI compute, but changes the workflow.

**[Trade-off] Two clicks instead of zero for common case** → A webhook notification + Fast click = 2 interactions vs 0 before. But it matches the repost pattern and prevents unwanted generations.

**[Risk] Migration ordering** → The `commit_events` table migration must run before the code that references it. The `drafts.event_id` column must be added before `source_data` is removed. Deploy migrations first.

## Migration Plan

1. Create migration: `CREATE TABLE commit_events (...)` + `ALTER TABLE drafts ADD COLUMN event_id TEXT`
2. Update `012_commit_compose.sql` to NOT add `source_data` to drafts (since it was never deployed)
3. Deploy migration
4. Deploy code changes (webhook handler, actions, router, etc.)
5. No rollback needed for data — `commit_events` is additive. Old webhook behavior can be restored by reverting code.
