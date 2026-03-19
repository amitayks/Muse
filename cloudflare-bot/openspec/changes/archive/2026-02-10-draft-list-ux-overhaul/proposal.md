## Why

The draft list views are functional but lack quick-action capability — every operation requires entering a draft detail view first. Additionally, auto-generated draft titles show PR numbers and commit messages which are developer-facing, not content-facing. The page size is hardcoded at 10 with no user control.

## What Changes

- **Quick action buttons on draft lists**: Each draft in a list gets a second row with quick-action buttons (✅ Approve / 🗑 Delete). After a successful approve, the ✅ transforms into 📤 Publish for immediate publishing — all without entering the draft detail view.
- **Configurable page size**: Add a "Page Size" setting to `/settings` allowing users to choose how many items appear per page (5, 10, 15, 20). Stored in `chat_state` alongside timezone. Applies to all list views.
- **Improved auto-generated draft titles**: In list views, auto-generated drafts show `[repoShort] first-tweet-text` instead of `PR #N — commit message`. The repo short name (just the repo part of `owner/repo`, truncated) and the actual generated tweet content give better context for what will be posted. Requires storing repo name at draft creation time and parsing `content` JSON at display time.
- **Combined Back + Home row**: In all list views, the Back and Home buttons share a single row instead of stacking vertically, saving space.

## Capabilities

### New Capabilities
- `draft-quick-actions`: Inline approve/delete/publish actions directly from draft list views
- `page-size-setting`: User-configurable page size for all list views

### Modified Capabilities
- `view-system`: Combined Back + Home row in lists, auto-draft title format change to show repo name + tweet content

## Impact

- `cloudflare-bot/src/views/drafts.ts` — two-row layout per draft, combined nav, title format
- `cloudflare-bot/src/views/settings.ts` — page size setting display and selector
- `cloudflare-bot/src/actions/config-toggle.ts` — handle page size config changes
- `cloudflare-bot/src/services/db.ts` — `getPageSize`/`setPageSize` functions, add `page_size` column to `chat_state`
- `cloudflare-bot/src/routes/migrate.ts` — schema migration for `page_size` column
- `cloudflare-bot/src/actions/` — new quick-action handlers (list_approve, list_delete, list_publish)
- `cloudflare-bot/src/core/router.ts` — register new action handlers
- `cloudflare-bot/src/handlers/github-webhook.ts` — store repo name in `pr_title`
- `cloudflare-bot/src/inputs/commit-sha.ts` — store repo name in `pr_title`
- All list-rendering call sites — pass page size parameter
