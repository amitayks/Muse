## Context

The bot has 54 render functions across 10 view files in `cloudflare-bot/src/views/`. These views return `ViewResult` objects (`{ text: string, keyboard: InlineButton[][], disableLinkPreview?: boolean }`) which get sent to Telegram via `respond()` in `core/respond.ts`.

The current codebase has no shared UI building blocks — every view constructs its buttons, rows, and layouts inline. This has led to 11+ copies of the Home button, 6 copies of `escapeHtml()`, 13+ toggle button patterns, and numerous other duplications (see proposal for full inventory).

**Key architectural constraint**: Views are pure functions that return `ViewResult`. There's no component framework, no JSX, no template engine. "Components" here means **TypeScript helper functions** that return `InlineButton`, `InlineButton[]`, `InlineButton[][]`, or `ViewResult`.

**Current file structure**:
```
cloudflare-bot/src/
├── views/
│   ├── home.ts          (7 render functions)
│   ├── drafts.ts        (7 render functions)
│   ├── repos.ts         (4 render functions)
│   ├── accounts.ts      (4 render functions)
│   ├── settings.ts      (4 render functions)
│   ├── onboarding.ts    (10 render functions)
│   ├── repost.ts        (3 render functions)
│   ├── video-studio.ts  (6 render functions)
│   └── video-settings.ts (9 render functions)
├── services/telegram.ts  (has duplicated truncateHtmlCaption)
└── actions/              (some have inline error ViewResults)
```

## Goals / Non-Goals

**Goals:**
- Extract all repeated UI patterns into a single `ui/components.ts` module
- Extract shared utilities (`escapeHtml`, `truncateHtml`) into `ui/utils.ts`
- Refactor all view files to use the extracted components
- Standardize inconsistent patterns (e.g., selected-item highlighting)
- Prepare the codebase for i18n (Phase 1) by centralizing string-bearing components
- Zero behavior change — identical rendered output before and after

**Non-Goals:**
- No i18n/translation work (that's Phase 1)
- No new features or screens
- No changes to the `ViewResult` type or `respond()` pipeline
- No changes to callback routing or action handlers' logic (only their inline error views)
- Components do NOT accept a `lang` parameter yet — that's Phase 1's job

## Decisions

### 1. Component return types follow a hierarchy

Components return the smallest useful unit:

| Return type | Examples |
|-------------|---------|
| `InlineButton` (single button) | `homeButton()`, `backButton(view)`, `toggleButton(...)` |
| `InlineButton[]` (single row) | `backHomeRow(backView)`, `addButtonRow(label, cb)`, `cancelRow(cancelCb)` |
| `InlineButton[][]` (multiple rows) | `paginationRows(type, page, hasMore)` |
| `ViewResult` (full screen) | `confirmDeleteView(...)`, `emptyListView(...)`, `inputPromptView(...)` |

**Why**: This gives maximum composability. A view can use a single button, a row, or an entire pre-built screen depending on what it needs.

**Alternative considered**: Single abstraction level (always return `ViewResult`). Rejected because most duplications are at the button/row level, not the full-screen level.

### 2. File organization: `ui/components.ts` + `ui/utils.ts`

Two files, not one per component.

**Why**: The components are small (1-5 lines each). Separate files would create 12+ tiny files with more import boilerplate than actual code. Two files keeps it manageable. `utils.ts` is separate because it's used by both views and services (telegram.ts).

**Alternative considered**: One file `ui/index.ts`. Rejected because mixing escape utilities with UI components muddies the module's purpose.

### 3. Standardize selected-item highlighting to checkmark prefix

Current inconsistency:
- `renderPageSizeSelect`: uses `[5]` bracket wrapping
- `renderRepostPreview`: uses `[Casual]` bracket wrapping
- `renderVoiceSelect`: uses `✅ Voice Name` checkmark
- `renderEmotionSelect`: uses `✅ Happy` checkmark
- Video settings cycle buttons: uses `✅ 16:9` checkmark

**Decision**: Standardize to `✅` checkmark prefix for all. It's more visually clear in Telegram's UI and already the majority pattern.

**Function**: `selectedItemLabel(label: string, isSelected: boolean): string` → returns `✅ ${label}` or `label`.

### 4. Inline error views in actions get refactored to use shared components

Several action handlers (especially `actions/video-settings.ts` with ~8 occurrences, `actions/repost-preview.ts`) construct inline `ViewResult` error objects instead of using `renderError()` from `views/home.ts`. These will be refactored to use either:
- `renderError(message)` for generic errors
- A new `errorWithBackView(message, backView)` component for errors that need a specific back button

### 5. No barrel `ui/index.ts` re-export

Views import directly from `ui/components` and `ui/utils`. No barrel file — keeps the dependency graph explicit.

## Risks / Trade-offs

**[Risk] Subtle rendering differences after refactoring** → Mitigation: Each component extraction must be verified by comparing the exact HTML text and keyboard JSON output of affected views. Manual testing of each screen in Telegram after refactoring.

**[Risk] Large PR with many file changes** → Mitigation: Can be split into sub-PRs: (1) create `ui/` files, (2) refactor one view file at a time. Each sub-PR is independently deployable since components are additive.

**[Risk] `escapeHtml` in 6 files — changing imports could break something** → Mitigation: The function is identical across all 6 copies. Replace one file at a time, verify the view still renders correctly.

**[Trade-off] Some components will look over-abstracted for their single usage** → Accepted because Phase 1 (i18n) will make every component multi-use. The abstraction pays for itself when `lang` is added.

## Additional Notes

**Component signatures (planned)**:

```typescript
// ui/components.ts

// Single buttons
function homeButton(): InlineButton
function backButton(view: string): InlineButton
function toggleButton(label: string, isOn: boolean, callback: string): InlineButton
function selectedItemLabel(label: string, isSelected: boolean): string

// Single rows
function backHomeRow(backView: string): InlineButton[]
function addButtonRow(label: string, callback: string): InlineButton[]
function cancelRow(cancelView: string): InlineButton[]

// Multi rows
function paginationRows(type: string, page: number, hasMore: boolean): InlineButton[][]

// Full views
function confirmDeleteView(title: string, message: string, confirmCb: string, cancelCb: string): ViewResult
function emptyListView(title: string, message: string, addLabel: string, addCb: string, backView: string): ViewResult
function inputPromptView(title: string, instructions: string, example: string | null, cancelCb: string): ViewResult
function errorWithBackView(message: string, backView: string): ViewResult
```

**Files that need refactoring (in recommended order)**:
1. Create `ui/utils.ts` — extract `escapeHtml()` and `truncateHtml()`
2. Create `ui/components.ts` — all component functions
3. `views/home.ts` — use `homeButton()`, remove local `escapeHtml`
4. `views/settings.ts` — use `backButton()`, `homeButton()`, `selectedItemLabel()`
5. `views/repos.ts` — use `paginationRows()`, `toggleButton()`, `confirmDeleteView()`, `emptyListView()`, `inputPromptView()`
6. `views/accounts.ts` — same as repos (very similar structure)
7. `views/drafts.ts` — use `paginationRows()`, `backHomeRow()`, `confirmDeleteView()`, remove local `escapeHtml` and `truncateHtml`
8. `views/onboarding.ts` — use `inputPromptView()` for key prompt screens, `homeButton()`
9. `views/repost.ts` — use `inputPromptView()`, `selectedItemLabel()`, remove local `escapeHtml`
10. `views/video-studio.ts` — use `homeButton()`, `backButton()`, `paginationRows()`
11. `views/video-settings.ts` — use `toggleButton()`, `confirmDeleteView()`, `selectedItemLabel()`, remove local `escapeHtml`
12. `services/telegram.ts` — replace `truncateHtmlCaption` with import from `ui/utils`
13. `actions/video-settings.ts` — replace inline error views with `errorWithBackView()`
14. `actions/repost-preview.ts` — replace inline error views
