## Why

The Telegram bot's UX has several friction points: the dashboard shows static help text instead of actionable info, lists are cramped with inline buttons, the repo management requires too many screen transitions, the draft approve/publish flow kicks users back to the dashboard, and Telegram's native command autocomplete isn't configured. These changes turn the bot from "functional" to "pleasant to use."

## What Changes

- **Smart dashboard**: Replace static help text with next scheduled post preview, queue stats (drafts/approved/scheduled counts), and dynamic buttons. Dashboard refreshes after cron publishes.
- **Vertical list layouts**: Draft and repo lists use stacked (one-per-row) buttons with longer titles, 10 items per page, repo list gets pagination.
- **Merged repo view**: Combine repo detail + edit config into a single screen with inline toggle buttons.
- **Draft categories**: Add navigation layer: Drafts → Auto-generated / Approved / Scheduled, each with its own filtered+paginated list.
- **Inline status transitions**: Approve action re-renders draft detail with new status buttons instead of redirecting to dashboard. Publish action shows result with "View on X" URL button.
- **Telegram command menu**: Register commands via `setMyCommands` API during setup, enabling native `/` autocomplete.

## Capabilities

### New Capabilities
- `smart-dashboard`: Dashboard shows next scheduled post, queue stats, and dynamic navigation

### Modified Capabilities
- `view-system`: Draft list layout changes to vertical stacking with 10/page; repo list gets pagination and vertical stacking; draft categories navigation added; repo detail+config merged into one view; approve/publish actions return draft detail instead of success screen
- `command-dispatch`: Add setMyCommands registration during setup; pagination needs list-type awareness (drafts_auto, drafts_approved, drafts_scheduled, repos)
- `publish-pipeline`: After cron/manual publish, dashboard message is updated if user is viewing it

## Impact

- **Views**: `home.ts`, `drafts.ts`, `repos.ts` — significant changes
- **Actions**: `approve.ts`, `publish.ts`, `view-change.ts`, `pagination.ts`, `config-toggle.ts` — moderate changes
- **Routes**: `setup.ts` — add setMyCommands call
- **Services**: `db.ts` — new query for next scheduled draft + count aggregates; `telegram.ts` — add setMyCommands function
- **Router**: `router.ts` — new callback prefixes for draft categories, repo pagination
- **Cron handler**: Update dashboard after publishing scheduled posts
