## MODIFIED Requirements

### Requirement: Views split into domain-specific files
The monolithic `views/index.ts` SHALL be split into domain-specific modules: `views/home.ts` for general views, `views/drafts.ts` for draft-related views, and `views/repos.ts` for repository-related views. All view files SHALL import shared UI components from `ui/components.ts` and shared utilities from `ui/utils.ts` instead of defining them inline.

#### Scenario: Home views in home.ts
- **WHEN** `renderHome()`, `renderHelp()`, `renderError()`, `renderSuccess()`, `renderGenerating()`, or `renderPublishing()` is needed
- **THEN** it is imported from `views/home.ts`
- **AND** `renderHome()` SHALL accept `env` and `chatId` parameters (async)
- **AND** the Home button SHALL be produced by `homeButton()` imported from `ui/components`

#### Scenario: Draft views in drafts.ts
- **WHEN** `renderDraftCategories()`, `renderDraftsList()`, `renderDraftDetail()`, `renderGeneratePrompt()`, `renderSchedulePrompt()`, or `renderDeletePrompt()` is needed
- **THEN** it is imported from `views/drafts.ts`
- **AND** pagination SHALL use `paginationRows()` from `ui/components`
- **AND** `escapeHtml` and `truncateHtml` SHALL be imported from `ui/utils`

#### Scenario: Repo views in repos.ts
- **WHEN** `renderReposList()`, `renderRepoDetail()`, `renderAddRepo()`, or `renderDeleteRepoConfirm()` is needed
- **THEN** it is imported from `views/repos.ts`
- **AND** `renderRepoConfig()` SHALL be removed (merged into `renderRepoDetail()`)
- **AND** toggle buttons SHALL use `toggleButton()` from `ui/components`
- **AND** delete confirmation SHALL use `confirmDeleteView()` from `ui/components`

### Requirement: Selected item highlighting uses checkmark prefix
All views that display selectable items (page size, tone, voice, emotion, aspect ratio, video length, etc.) SHALL use the `selectedItemLabel()` function from `ui/components.ts` for consistent highlighting. The bracket-wrapping pattern (`[5]`, `[Casual]`) SHALL be replaced with checkmark prefix (`✅ 5`, `✅ Casual`).

#### Scenario: Page size selector uses checkmark
- **WHEN** `renderPageSizeSelect(5)` displays size options
- **THEN** the current size SHALL be displayed as `✅ 5` not `[5]`

#### Scenario: Repost tone selector uses checkmark
- **WHEN** `renderRepostPreview()` displays tone options
- **THEN** the selected tone SHALL be displayed as `✅ Casual` not `[Casual]`
