## Why

The bot's 54 render functions across 10 view files contain massive duplication: the Home button is copy-pasted 11+ times, pagination logic is duplicated in 6 places, `escapeHtml()` is literally copy-pasted into 6 files, toggle buttons repeat 13+ times, confirm/delete modals repeat 5 times, and input prompts follow the same pattern in 14+ places. This duplication makes the upcoming i18n work (Phase 1) exponentially harder — without extraction, we'd need to add `t(lang, ...)` calls in 330+ individual locations. Extracting reusable components first means most strings live in ~12 shared components and get handled once.

## What Changes

- Create `ui/components.ts` with reusable button/row/view builders: `homeButton()`, `backButton()`, `backHomeRow()`, `paginationRow()`, `toggleButton()`, `addButtonRow()`, `cancelRow()`, `confirmDeleteView()`, `emptyListView()`, `inputPromptView()`, `selectedItemLabel()`
- Create `ui/utils.ts` with shared utilities: single canonical `escapeHtml()`, single canonical `truncateHtml()` (currently duplicated in `views/drafts.ts` and `services/telegram.ts`)
- Refactor all 10 view files to import and use the extracted components instead of inline duplication
- Standardize the selected-item highlighting pattern (currently inconsistent: `[x]` bracket-wrapping vs `✅ x` checkmark prefix)
- Refactor inline error/success views in action handlers to use `renderError()`/`renderSuccess()` from `views/home.ts`
- Zero behavior change — every screen renders identically before and after

## Capabilities

### New Capabilities
- `ui-components`: Reusable UI component library for Telegram bot views (buttons, rows, layouts, patterns)

### Modified Capabilities
- `view-system`: Views will import from `ui/components` and `ui/utils` instead of inline duplication. All view signatures and outputs remain identical.

## Impact

- **Files created**: `cloudflare-bot/src/ui/components.ts`, `cloudflare-bot/src/ui/utils.ts`
- **Files modified**: All 10 view files (`views/home.ts`, `views/drafts.ts`, `views/repos.ts`, `views/accounts.ts`, `views/settings.ts`, `views/onboarding.ts`, `views/repost.ts`, `views/video-studio.ts`, `views/video-settings.ts`), plus action files that have inline error views (`actions/video-settings.ts`, `actions/repost-preview.ts`, etc.)
- **Files modified for utils**: `services/telegram.ts` (remove duplicated `truncateHtmlCaption`, import from `ui/utils`)
- **No API changes, no DB changes, no behavior changes**

---

### Additional Context from Exploration

**ViewResult type** (types.ts):
```typescript
interface InlineButton { text: string; callback_data?: string; url?: string; style?: 'primary' | 'success' | 'danger'; }
interface ViewResult { text: string; keyboard: InlineButton[][]; disableLinkPreview?: boolean; }
```

**Respond pattern**: The bot uses a single-persistent-message pattern — almost all interactions edit the same message via `respond()` in `core/respond.ts`. Views return `ViewResult`, which gets sent via `editMessage()` or `sendMessage()`.

**Full duplication inventory**:
| Pattern | Occurrences | Component to extract |
|---------|------------|---------------------|
| `{ text: '🏠 Home', callback_data: 'view:home' }` | 11+ | `homeButton()` |
| `{ text: '◀️ Back', callback_data: 'view:X' }` | 15+ (3 variants) | `backButton(view)` |
| `[Back, Home]` combined row | 8+ | `backHomeRow(backView)` |
| Pagination `[⬅️ Prev][Next ➡️]` | 6 copies | `paginationRow(type, page, hasMore)` |
| Toggle `Label: On/Off` + success/danger | 13+ | `toggleButton(label, isOn, callback)` |
| Confirm delete modal | 5 copies | `confirmDeleteView(title, msg, confirmCb, cancelCb)` |
| Empty list state | 5 copies | `emptyListView(title, msg, addLabel, addCb)` |
| Input prompt + cancel | 14+ copies | `inputPromptView(title, instructions, example, cancelCb)` |
| `➕ Add X` primary button row | 5 copies | `addButtonRow(label, callback)` |
| `escapeHtml()` function | 6 copy-pasted copies | `ui/utils.ts` |
| `truncateHtml()` function | 2 copies | `ui/utils.ts` |
| Selected item `[x]` vs `✅ x` | inconsistent | `selectedItemLabel(label, isSelected)` |

**Inline error views in actions** (bypass `renderError()`):
- `actions/video-settings.ts`: ~8 inline error ViewResults
- `actions/repost-preview.ts`: inline error recovery views
- These should use the centralized `renderError()` / `renderSuccess()` from `views/home.ts`
