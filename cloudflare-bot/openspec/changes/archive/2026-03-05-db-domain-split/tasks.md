## 1. Create Domain Files

- [x] 1.1 Create `src/data/draft-db.ts` — extract drafts section (lines 18-349), published section (lines 495-549), and `getExistingRepostDraft` (lines 1672-1681) from `db.ts`. Include `generateId()`, required type imports, and `logInfo`/`logError` imports.
- [x] 1.2 Create `src/data/user-settings-db.ts` — extract chat state (lines 351-423), language (lines 425-447), timezone (lines 449-470), and page size (lines 472-493) sections. Include required type imports.
- [x] 1.3 Create `src/data/repo-db.ts` — extract repos section (lines 551-719) and repo overviews section (lines 721-936). Include `generateId()`, `RepoOverviewRow` interface, `parseOverviewRow()`, required type imports, and `logInfo` import.
- [x] 1.4 Create `src/data/video-db.ts` — extract video drafts (lines 938-1101), video published (lines 1113-1155), video presets (lines 1157-1192), video cron helpers (lines 1194-1233), video settings (lines 1235-1264), PLUS the 2 misplaced functions `getStaleGeneratingDraftsByUser` (line 320) and `getScheduledVideoDraftsByUser` (line 332). Include `generateId()` and required type imports.
- [x] 1.5 Create `src/data/twitter-db.ts` — extract twitter accounts (lines 1266-1411), twitter account overviews (lines 1413-1484), and twitter tweets (lines 1486-1626). Include `generateId()` and required type imports.
- [x] 1.6 Create `src/data/persona-db.ts` — extract persona cache section (lines 1628-1669). Include `generateId()` and required type imports.

## 2. Convert db.ts to Barrel

- [x] 2.1 Replace `db.ts` content with barrel re-exports from all 6 domain files (e.g., `export * from './draft-db'`)
- [x] 2.2 Also re-export the `RepoOverviewRow` type if it was exported (check usage) — N/A, not exported

## 3. Verify

- [x] 3.1 Run `tsc --noEmit` — must pass with zero errors
- [x] 3.2 Verify all 62 importers still resolve correctly (grep for `from.*data/db` should still match 62 files)
- [x] 3.3 Deploy and smoke test
