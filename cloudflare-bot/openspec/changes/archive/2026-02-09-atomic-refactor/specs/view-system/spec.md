## ADDED Requirements

### Requirement: Views split into domain-specific files
The monolithic `views/index.ts` SHALL be split into domain-specific modules: `views/home.ts` for general views, `views/drafts.ts` for draft-related views, and `views/repos.ts` for repository-related views.

#### Scenario: Home views in home.ts
- **WHEN** `renderHome()`, `renderHelp()`, `renderError()`, `renderSuccess()`, `renderGenerating()`, or `renderPublishing()` is needed
- **THEN** it is imported from `views/home.ts`

#### Scenario: Draft views in drafts.ts
- **WHEN** `renderDraftsList()`, `renderDraftDetail()`, `renderGeneratePrompt()`, `renderSchedulePrompt()`, or `renderDeletePrompt()` is needed
- **THEN** it is imported from `views/drafts.ts`

#### Scenario: Repo views in repos.ts
- **WHEN** `renderReposList()`, `renderRepoDetail()`, `renderAddRepo()`, `renderDeleteRepoConfirm()`, or `renderRepoConfig()` is needed
- **THEN** it is imported from `views/repos.ts`

### Requirement: Views barrel re-export for migration
A `views/index.ts` barrel file SHALL re-export all views from the domain files during migration, so existing imports continue to work. Once all imports are updated, the barrel MAY be removed.

#### Scenario: Existing import still works
- **WHEN** a file imports `renderHome` from `../views/index`
- **THEN** it resolves correctly through the barrel re-export

### Requirement: All view functions preserve exact signatures
Each view function SHALL maintain its exact current signature and return type (`ViewResult`). No view function parameters, return types, or rendered content SHALL change.

#### Scenario: renderDraftsList signature unchanged
- **WHEN** `renderDraftsList(env, chatId, page)` is called
- **THEN** it returns the same `ViewResult` with identical text and keyboard as the current implementation
