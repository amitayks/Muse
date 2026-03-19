## Why

`src/data/db.ts` is 1,681 lines with ~77 exported functions and 62 importers — the largest and most-imported file in the codebase. It contains CRUD operations for 6 completely independent domains (drafts, repos, video, twitter, user settings, persona cache) with zero cross-domain coupling. Splitting by domain improves navigability and keeps diffs scoped.

## What Changes

- Split `db.ts` into 6 domain-specific files: `draft-db.ts`, `user-settings-db.ts`, `repo-db.ts`, `video-db.ts`, `twitter-db.ts`, `persona-db.ts`
- Convert `db.ts` into a barrel re-export file (all 62 importers remain unchanged)
- Move 2 misplaced video functions (`getStaleGeneratingDraftsByUser`, `getScheduledVideoDraftsByUser`) from the drafts section to `video-db.ts`
- Extract shared `generateId()` helper to avoid duplication

## Capabilities

### New Capabilities
- `db-domain-split`: Split the monolithic db.ts into domain-specific files with barrel re-export

### Modified Capabilities

## Impact

- `src/data/db.ts` — becomes barrel re-export (from ~1,681 lines to ~30 lines)
- 6 new files created in `src/data/`
- **Zero importer changes** — all 62 files keep importing from `../data/db`
- No API or runtime behavior changes
