## Context

Draft lists in `views/drafts.ts` (`renderDraftsList`) render one button per draft. The page size is hardcoded at `limit = 10`. Auto-generated draft titles are stored as PR title or commit message in `pr_title` column. The `chat_state` table has `timezone` but no `page_size` column. Quick actions (approve, delete, publish) currently require navigating into the draft detail view.

The callback system uses `action:*` prefix for operations. The existing `approveAction`, `deleteDraftAction`, and `publishAction` operate on individual drafts and return `ViewResult` for the draft detail view. For list quick-actions, we need variants that return the user to the list instead.

## Goals / Non-Goals

**Goals:**
- Two-row layout per draft in lists: title row + quick-action row
- Quick approve → transforms to publish button; quick delete with confirmation
- Configurable page size (5/10/15/20) stored per user in `chat_state.page_size`
- Auto-generated draft titles show `[repo] tweet-preview` in list views
- Back + Home buttons combined into one row in all lists

**Non-Goals:**
- Bulk select (multi-draft operations in one click)
- Quick actions on the draft detail view (already has full action buttons)
- Changing the draft detail view title format (only list display changes)

## Decisions

**1. Quick action callback format: `action:list_approve:<draftId>:<listType>:<page>`**

Quick actions encode the list context in the callback data so the handler can re-render the same list page after the operation. The extra field carries `draftId:listType:page` which gets parsed by the handler. This avoids reading chat state and is self-contained.

Actions: `list_approve`, `list_delete`, `list_confirm_delete`, `list_cancel_delete`, `list_publish`.

After `list_approve`, the handler re-renders the list. The draft's status changes from `draft` to `approved`, so its quick-action buttons change from `[✅] [🗑]` to `[📤] [🗑]`.

After `list_publish`, re-render the list. The draft moves to published status and may disappear from the current list (e.g., auto-generated list only shows draft/rejected).

After `list_delete` → shows confirmation in-place by editing the message to a confirm prompt with `[✅ Yes] [❌ No]` plus the list context. On confirm, deletes and re-renders list. On cancel, re-renders list.

**2. Page size stored in `chat_state.page_size` column (default 5)**

Add column via migration: `ALTER TABLE chat_state ADD COLUMN page_size INTEGER DEFAULT 5`. Functions: `getPageSize(env, chatId)` and `setPageSize(env, chatId, size)`. The page size setting UI uses preset buttons (5, 10, 15, 20) via `config:page_size:N` callback.

Default is 5 (not 10) because with two-row layout per draft, 10 items = 20 button rows which is very tall.

**3. Auto-generated title: parse content JSON at display time + store repo short name at creation**

At creation time (webhook handler + `/generate` flow): store `pr_title` as `repoShort | PR title` where `repoShort` is the repo name part of `owner/repo` (e.g., `my-app`).

At display time in `renderDraftsList`: for auto-generated drafts, parse `draft.content` JSON to get `tweets[0].text`, truncate to ~35 chars, and show that as the button label. The repo name prefix comes from `pr_title` (split on ` | `). If no ` | ` separator found (old drafts), fall back to current display.

Format: `📝 repo — tweet preview text...`

**4. Combined Back + Home row**

Change all list keyboard layouts from:
```
[◀️ Back]
[🏠 Home]
```
to:
```
[◀️ Back] [🏠 Home]
```

Applies to: `renderDraftsList`, `renderDraftCategories` (empty state), `renderReposList`, and any other list views.

## Risks / Trade-offs

- [Two rows per draft doubles keyboard height] → Mitigated by reducing default page size from 10 to 5. User can increase via settings.
- [Parsing content JSON on every list render] → Acceptable. Lists are max 20 items, JSON is small. No performance concern.
- [Old drafts won't have repo name in `pr_title`] → Fall back to showing `pr_title` as-is for drafts without the ` | ` separator.
- [Quick delete confirmation replaces entire list message] → After confirm/cancel, list is re-rendered. Brief disruption but keeps the flow simple.
