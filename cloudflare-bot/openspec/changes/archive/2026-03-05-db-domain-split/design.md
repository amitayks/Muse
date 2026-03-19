## Context

`src/data/db.ts` is a 1,681-line monolith containing ~77 exported functions for 6 independent domains. It has 62 importers across the codebase. The file already has section comment headers (`// ======= DOMAIN =======`) showing natural split points with zero cross-domain coupling.

## Goals / Non-Goals

**Goals:**
- Split db.ts into 6 domain files for navigability and scoped diffs
- Zero importer changes via barrel re-export pattern
- Fix 2 misplaced video functions currently in the drafts section

**Non-Goals:**
- Changing any query logic, function signatures, or return types
- Adding abstractions, base classes, or ORM patterns
- Refactoring the other data/ files (user-db.ts, user-keys.ts, storage.ts, r2.ts)

## Decisions

### 1. Barrel re-export pattern (not direct imports)
**Decision:** `db.ts` becomes a barrel file re-exporting from 6 domain files.
**Rationale:** With 62 importers, changing import paths would be high-risk with no functional benefit. The barrel pattern was already proven in the `skills/index.ts` refactor.
**Alternative considered:** Update all 62 importers to import from domain files directly — rejected due to migration cost and churn.

### 2. Private `generateId()` per file (not shared utility)
**Decision:** Each domain file gets its own `function generateId(): string { return crypto.randomUUID(); }`.
**Rationale:** It's a single line with no configuration. Sharing it would create cross-file imports for zero benefit. Duplicating a one-liner is simpler than a shared module.
**Alternative considered:** `data/db-utils.ts` — rejected as over-engineering for a one-line function.

### 3. Domain file naming: `<domain>-db.ts`
**Decision:** Files named `draft-db.ts`, `repo-db.ts`, etc.
**Rationale:** The `-db` suffix distinguishes these from other data/ files (user-db.ts already uses this pattern) and makes the purpose clear.

### 4. Imports stay in each domain file
**Decision:** Each domain file imports its own types from `../types` and `../infra/security`.
**Rationale:** Domain files are independent. Each imports only the types it needs.

## File Mapping

| Target File | Source Lines | Functions | Tables |
|---|---|---|---|
| `draft-db.ts` | 18-349, 495-549, 1672-1681 | 21 | drafts, published |
| `user-settings-db.ts` | 351-493 | 9 | users |
| `repo-db.ts` | 551-936 | 16 | repos, repo_overviews |
| `video-db.ts` | 320-339, 938-1264 | 18 | video_drafts, video_published, video_presets, users (video_settings) |
| `twitter-db.ts` | 1266-1626 | 15 | twitter_accounts, twitter_account_overviews, twitter_tweets |
| `persona-db.ts` | 1628-1669 | 3 | persona_cache |

## Risks / Trade-offs

- **[Risk] Missed re-export** → Run `tsc --noEmit` after barrel creation to catch any missing exports immediately
- **[Risk] Import order in barrel causes issues** → TypeScript re-exports are order-independent; no risk
- **[Trade-off] 6 new files in data/** → Acceptable; each is cohesive and self-contained (200-400 lines)
