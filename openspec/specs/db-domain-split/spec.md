## ADDED Requirements

### Requirement: Domain-specific database files
The system SHALL organize database operations into domain-specific files within `src/data/`:
- `draft-db.ts` — drafts table + published table CRUD
- `user-settings-db.ts` — users table operations (chat state, language, timezone, page size)
- `repo-db.ts` — repos table + repo_overviews table CRUD
- `video-db.ts` — video_drafts, video_published, video_presets tables + video settings + video cron helpers
- `twitter-db.ts` — twitter_accounts, twitter_account_overviews, twitter_tweets tables + config parsing
- `persona-db.ts` — persona_cache table CRUD

Each file SHALL contain only functions that operate on its domain's tables.

#### Scenario: Functions grouped by table domain
- **WHEN** a developer looks for draft-related DB operations
- **THEN** all draft and published functions are located in `draft-db.ts`

#### Scenario: Video functions consolidated
- **WHEN** `getStaleGeneratingDraftsByUser` and `getScheduledVideoDraftsByUser` query `video_drafts` table
- **THEN** they SHALL be placed in `video-db.ts`, not `draft-db.ts`

### Requirement: Barrel re-export preserves all imports
The system SHALL convert `db.ts` into a barrel file that re-exports all public functions from the 6 domain files. All 62 existing importers SHALL continue to import from `../data/db` without modification.

#### Scenario: Existing importer unchanged
- **WHEN** a file imports `{ getDraft }` from `../data/db`
- **THEN** the import SHALL resolve correctly through the barrel re-export

#### Scenario: All exports preserved
- **WHEN** the barrel file is complete
- **THEN** every function previously exported from `db.ts` SHALL be re-exported from the barrel

### Requirement: Shared utility extraction
The system SHALL extract `generateId()` into each domain file as a private function (or into a shared `data/db-utils.ts`) to avoid cross-file dependencies between domain files.

#### Scenario: No cross-domain imports
- **WHEN** domain files are created
- **THEN** no domain file SHALL import from another domain file within `src/data/`

### Requirement: Zero runtime behavior change
The split SHALL be a pure structural refactor. No query logic, function signatures, or return types SHALL change.

#### Scenario: TypeScript compilation
- **WHEN** `tsc --noEmit` runs after the split
- **THEN** it SHALL pass with zero errors

#### Scenario: Identical function signatures
- **WHEN** comparing function signatures before and after the split
- **THEN** every function SHALL have identical parameters and return types
