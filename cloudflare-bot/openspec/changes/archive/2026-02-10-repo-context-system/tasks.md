## 1. Database & Types

- [x] 1.1 Add `repo_overviews` table to schema.sql with all columns (id, repo_id, summary, tech_stack, key_features, target_audience, brand_voice, visual_theme, recent_changes, version, created_at, updated_at) and UNIQUE constraint on repo_id
- [x] 1.2 Create D1 migration script for existing databases (`ALTER TABLE` or `CREATE TABLE IF NOT EXISTS`)
- [x] 1.3 Add `RepoOverview` TypeScript interface to types.ts with all fields typed (key_features: string[], recent_changes: string[], rest: string)
- [x] 1.4 Add `OverviewPatch` TypeScript type to types.ts for the field-level patch format (null | string for scalars, { add: string[], remove: string[] } for arrays)
- [x] 1.5 Extend `ContentResponse` type to include optional `overviewUpdates: OverviewPatch | null` field

## 2. DB Service Functions

- [x] 2.1 Add `getRepoOverview(env, repoId): Promise<RepoOverview | null>` to db.ts — reads and parses overview from D1
- [x] 2.2 Add `upsertRepoOverview(env, repoId, overview: RepoOverview): Promise<void>` to db.ts — inserts or replaces full overview (used by bootstrap)
- [x] 2.3 Add `applyOverviewPatches(env, repoId, patches: OverviewPatch): Promise<void>` to db.ts — reads current overview, applies field-level patches, enforces 20-item FIFO on recent_changes, increments version, writes back

## 3. GitHub API Extension

- [x] 3.1 Add `fetchRepoReadme(env, owner, repo): Promise<string | null>` to github service — fetches README content via `GET /repos/{owner}/{repo}/readme`, base64 decodes, returns text or null
- [x] 3.2 Add `fetchRecentMergedPRs(env, owner, repo, count): Promise<PRSummary[]>` to github service — fetches last N merged PRs with titles and descriptions

## 4. Gemini Prompts & Parsing

- [x] 4.1 Create overview extraction prompt — takes README text + PR summaries, returns structured JSON matching RepoOverview fields, enforces conciseness constraints
- [x] 4.2 Add `extractRepoOverview(env, readmeText, prSummaries): Promise<RepoOverview>` function to gemini.ts — calls Gemini with extraction prompt, parses and validates response
- [x] 4.3 Modify `CONTENT_SYSTEM_PROMPT` to include repo overview context section with instructions for Gemini to ground perspectives in project identity, audience, and brand voice
- [x] 4.4 Add overview patch generation instructions to `CONTENT_SYSTEM_PROMPT` — instruct Gemini to return `overviewUpdates` field with patches when changes represent meaningful project evolution
- [x] 4.5 Update `parseContentResponse()` to extract and validate `overviewUpdates` from Gemini response — invalid patches return null, valid patches returned typed

## 5. Content Generation Pipeline

- [x] 5.1 Modify `buildContentPrompt()` to accept optional `repoOverview: RepoOverview` parameter and include it as structured context in the prompt text
- [x] 5.2 Modify `generateContent()` call chain to fetch repo overview from D1 before calling buildContentPrompt, passing the overview through
- [x] 5.3 After `generateContent()` returns, apply any `overviewUpdates` patches to D1 via `applyOverviewPatches()` — non-blocking, failures logged but don't break the content flow
- [x] 5.4 Pass `visual_theme` from overview to image generation context so imagePrompt respects repo brand identity

## 6. Bootstrap Command

- [x] 6.1 Add `/overview` command handler — parses `owner/repo` argument, validates repo is watched, calls fetchRepoReadme + fetchRecentMergedPRs
- [x] 6.2 Call `extractRepoOverview()` with fetched data, store result via `upsertRepoOverview()`
- [x] 6.3 Send overview preview to Telegram (summary + key features + tech stack) with "Looks good" confirmation
- [x] 6.4 Register `/overview` in the command router

## 7. Telegram UI — Repo Settings

- [x] 7.1 Add overview summary display to repo settings view — show summary (truncated), feature count, and visual theme when overview exists
- [x] 7.2 Add "No overview yet — run /overview owner/repo" message when overview doesn't exist
- [x] 7.3 Add "Edit Overview" button that shows field selection menu (Summary, Tech Stack, Key Features, Target Audience, Brand Voice, Visual Theme)
- [x] 7.4 Add "Re-bootstrap" button that re-runs the /overview extraction flow
- [x] 7.5 Implement field edit input flow — user selects field, sends new text, system updates the specific field in D1
