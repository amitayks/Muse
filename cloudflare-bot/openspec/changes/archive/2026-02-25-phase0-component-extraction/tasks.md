## 1. Create shared utility and component modules

- [x] 1.1 Create `cloudflare-bot/src/ui/utils.ts` with canonical `escapeHtml(text: string)` and `truncateHtml(html: string, maxLength: number)` functions (copy from existing `views/drafts.ts` implementation)
- [x] 1.2 Create `cloudflare-bot/src/ui/components.ts` with all component functions: `homeButton()`, `backButton(view)`, `backHomeRow(backView)`, `paginationRows(type, page, hasMore)`, `toggleButton(label, isOn, callback)`, `addButtonRow(label, callback)`, `cancelRow(cancelView)`, `confirmDeleteView(title, message, confirmCb, cancelCb)`, `emptyListView(title, message, addLabel, addCb, backView)`, `inputPromptView(title, instructions, example, cancelCb)`, `selectedItemLabel(label, isSelected)`, `errorWithBackView(message, backView)`

## 2. Refactor view files to use shared components

- [x] 2.1 Refactor `views/home.ts` — replace inline Home button with `homeButton()`, remove local `escapeHtml` (import from `ui/utils`)
- [x] 2.2 Refactor `views/settings.ts` — replace inline Back/Home buttons with components, replace bracket-style `[5]` selected item in `renderPageSizeSelect` with `selectedItemLabel()`
- [x] 2.3 Refactor `views/repos.ts` — replace inline pagination with `paginationRows()`, toggles with `toggleButton()`, delete confirm with `confirmDeleteView()`, empty state with `emptyListView()`, add-repo prompt with `inputPromptView()`, remove local `escapeHtml`
- [x] 2.4 Refactor `views/accounts.ts` — same pattern as repos: pagination, toggles, delete confirm, empty state, add-account prompt, remove local `escapeHtml`
- [x] 2.5 Refactor `views/drafts.ts` — replace pagination with `paginationRows()`, Back+Home row with `backHomeRow()`, delete confirm with `confirmDeleteView()`, input prompts with `inputPromptView()`, remove local `escapeHtml` and `truncateHtml`
- [x] 2.6 Refactor `views/onboarding.ts` — replace key prompt screens (Gemini, X, GitHub) with `inputPromptView()` where applicable, replace Home/dashboard buttons with `homeButton()`
- [x] 2.7 Refactor `views/repost.ts` — replace input prompt with `inputPromptView()`, replace bracket-style `[Casual]` tone selection with `selectedItemLabel()`, remove local `escapeHtml`
- [x] 2.8 Refactor `views/video-studio.ts` — replace Home/Back buttons with components, replace pagination with `paginationRows()`
- [x] 2.9 Refactor `views/video-settings.ts` — replace toggles with `toggleButton()`, delete confirm with `confirmDeleteView()`, selected items (aspect ratio, length, etc.) with `selectedItemLabel()`, remove local `escapeHtml`

## 3. Refactor services and actions

- [x] 3.1 Refactor `services/telegram.ts` — remove local `truncateHtmlCaption`, import `truncateHtml` from `ui/utils`
- [x] 3.2 Refactor `actions/video-settings.ts` — replace ~8 inline error ViewResults with `errorWithBackView()` from `ui/components`
- [x] 3.3 Refactor `actions/repost-preview.ts` — replace inline error ViewResults with `errorWithBackView()`
- [x] 3.4 Scan remaining action files for any other inline ViewResult patterns and replace with shared components

## 4. Verification

- [x] 4.1 Verify no view file contains a local `escapeHtml` function definition (search codebase)
- [x] 4.2 Verify no view file contains a local `truncateHtml` function definition
- [x] 4.3 Verify all selected-item patterns use `selectedItemLabel()` (no more `[x]` bracket wrapping)
- [ ] 4.4 Deploy and manually test all screens in Telegram: home, repos list/detail, accounts list/detail, drafts categories/list/detail, settings (timezone, page size, API keys), onboarding flow, repost preview, video studio, video settings
