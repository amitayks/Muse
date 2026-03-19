## Context

The bot currently works but has UX friction: static dashboard, cramped button layouts, too many navigation steps for common actions, and no Telegram command autocomplete. All changes are in the view/action layer — no schema migrations, no new external services.

## Goals / Non-Goals

**Goals:**
- Dashboard shows real-time queue status (next scheduled post, counts)
- Lists are readable with vertical stacking and more items per page
- Repo management is one screen instead of three
- Draft navigation organized by category (auto/approved/scheduled)
- Approve→Publish flow stays on the draft detail screen
- Telegram `/` autocomplete works

**Non-Goals:**
- No database schema changes (all data already exists)
- No "handwritten drafts" feature (future)
- No changes to content generation or publishing logic
- No new API endpoints

## Decisions

### 1. Dashboard becomes async with DB queries
`renderHome()` changes from a pure function to `async renderHome(env, chatId)`. It queries:
- Next scheduled draft: `SELECT * FROM drafts WHERE chat_id=? AND status='scheduled' ORDER BY scheduled_at ASC LIMIT 1`
- Counts: `SELECT status, COUNT(*) FROM drafts WHERE chat_id=? GROUP BY status`

**Why**: Minimal DB cost (2 lightweight queries), gives users immediately useful info.

### 2. Draft categories as a navigation layer
Instead of modifying the drafts DB schema, categories are just filtered queries:
- **Auto-generated**: `status IN ('draft', 'rejected')` — all unactioned drafts
- **Approved**: `status = 'approved'` — ready to publish
- **Scheduled**: `status = 'scheduled'` ORDER BY `scheduled_at ASC`

A new `renderDraftCategories()` view shows the category picker with counts. Each category links to the existing `renderDraftsList()` with a status filter param.

**Why filter-based vs. new column**: No migration needed. The status field already captures the distinction.

### 3. Pagination uses list type in callback data
Current pagination: `page:N` — only works for one list type.
New pagination: `page:TYPE:N` where TYPE is `auto`, `approved`, `scheduled`, `repos`.

The pagination action reads the type from callback data and routes to the correct filtered list.

### 4. Approve/publish return draft detail view
`approveAction` changes from returning `renderSuccess()` to returning `renderDraftDetail()`. The draft detail view already renders different buttons per status, so the transition is automatic.

`publishAction` similarly returns `renderDraftDetail()`, but the published state needs to show the tweet URL. The published record's `tweet_url` field already stores this.

For "View on X" — Telegram inline buttons support a `url` field. We add this to the `InlineButton` type and handle it in the keyboard builder.

### 5. Merged repo view replaces detail + config
`renderRepoDetail()` absorbs the config toggles from `renderRepoConfig()`. The config toggle action returns the merged view. `renderRepoConfig()` and `editRepoAction` become dead code.

### 6. setMyCommands in setup endpoint
One additional API call in the `/setup` route, right after `setWebhook`. Uses Telegram's `setMyCommands` API. One-time registration, persists across sessions.

### 7. Cron handler refreshes dashboard after publish
After publishing scheduled drafts, the cron handler doesn't currently notify the user in real-time (it only logs). Since we can't reliably update an existing message without knowing its ID, we skip dashboard auto-update for cron. The dashboard simply shows fresh data on each visit.

For manual publish (user clicks Publish Now), the action returns the updated draft detail — so the user sees the result immediately.

## Risks / Trade-offs

- **Dashboard query cost** → Minimal: 2 queries per dashboard load, both indexed on chat_id + status
- **10 items per page** → Telegram messages have a max of ~100 inline buttons. 10 buttons + 2 nav + 1 home = 13, well within limits
- **Merged repo view has many buttons** → Up to 8 toggle buttons + 2 action buttons + back = 11, still fine for Telegram
- **Breaking pagination callbacks** → Old `page:N` callbacks from cached messages will break. Mitigation: handle gracefully by falling back to page 0 of auto-generated list
