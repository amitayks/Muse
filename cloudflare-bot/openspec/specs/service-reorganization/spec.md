## ADDED Requirements

### Requirement: AI directory for Gemini-powered services
`src/ai/` SHALL contain all files that interact with the Gemini API or orchestrate AI-powered operations: `gemini.ts`, `identity.ts`, `prompts.ts`, `scoring.ts`, `scoring-prompt.ts`, `repost-generate.ts`, `repost-prompt.ts`, `persona-bootstrap.ts`, `persona-prompt.ts`.

#### Scenario: AI files moved from services
- **WHEN** listing files in `src/ai/`
- **THEN** all 9 AI-related files are present
- **WHEN** checking `src/services/` for these files
- **THEN** none of them remain in `src/services/`

### Requirement: Integrations directory for external API clients
`src/integrations/` SHALL contain all external API client wrappers: `x.ts`, `github.ts`, `heygen.ts`, `telegram.ts`, `telegram-auth.ts`, `webhook.ts`.

#### Scenario: Integration files moved from services
- **WHEN** listing files in `src/integrations/`
- **THEN** all 6 external API client files are present

### Requirement: Data directory for persistence layer
`src/data/` SHALL contain all database and storage files: `db.ts`, `user-db.ts`, `user-keys.ts`, `storage.ts`, `r2.ts`.

#### Scenario: Data files moved from services
- **WHEN** listing files in `src/data/`
- **THEN** all 5 persistence files are present

### Requirement: Infra directory for cross-cutting utilities
`src/infra/` SHALL contain infrastructure utilities: `security.ts`, `crypto.ts`, `timezone.ts`.

#### Scenario: Infra files moved from services
- **WHEN** listing files in `src/infra/`
- **THEN** all 3 infrastructure files are present

### Requirement: Services directory retains only feature orchestrators
After reorganization, `src/services/` SHALL contain only feature orchestrator files: `auto-approve.ts`, `batch-notification.ts`, `poller.ts`, `video-publish.ts`.

#### Scenario: Services folder is slim
- **WHEN** listing files in `src/services/`
- **THEN** exactly 4 feature orchestrator files remain

### Requirement: All import paths updated
Every file in the codebase that imported from `services/` SHALL have its import paths updated to reference the new directory locations. The project SHALL compile cleanly with `tsc --noEmit`.

#### Scenario: TypeScript compilation succeeds
- **WHEN** running `tsc --noEmit`
- **THEN** zero errors are reported

#### Scenario: No stale imports to old locations
- **WHEN** searching for imports referencing moved files at their old `services/` paths
- **THEN** zero matches are found

### Requirement: Zero runtime behavior changes
The restructure SHALL NOT change any runtime behavior, API responses, database queries, or user-facing functionality. All exports from moved files SHALL remain identical.

#### Scenario: Exports unchanged
- **WHEN** comparing the public API (exported functions/types/constants) of each moved file before and after
- **THEN** they are identical
