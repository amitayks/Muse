## 1. Database — new repo default columns

- [x] 1.1 Create migration adding `repo_auto_overview` (INTEGER DEFAULT 0) and `repo_default_watch_pushes` (INTEGER DEFAULT 1) columns to `users` table
- [x] 1.2 Update `schema.sql` with the new columns
- [x] 1.3 Add `getRepoDefaults(env, chatId)` and `setRepoDefault(env, chatId, field, value)` to `data/user-settings-db.ts`

## 2. Settings home — restructure to category navigation

- [x] 2.1 Rewrite `renderSettings()` in `views/settings.ts`: text shows full summary of all values (timezone, page size, language, repost defaults, commit defaults, repo defaults), keyboard shows category buttons (General, Skills, Platforms, Repost, Commits, Repos) + API Keys + Home
- [x] 2.2 Add `repoDefaults` parameter to `renderSettings()` for repo default values in summary text
- [x] 2.3 Update `returnToSettings()` in `actions/settings-keys.ts` to fetch and pass `repoDefaults`

## 3. Sub-page render functions

- [x] 3.1 Add `renderSettingsGeneral(timezone, pageSize, lang)` — shows timezone, language, page size with descriptions and action buttons + Back
- [x] 3.2 Add `renderSettingsSkills(lang, workerUrl, staleCount, isAdminUser)` — shows system prompts (with stale badge), admin prompts (if admin), re-analyze identity with descriptions + Back
- [x] 3.3 Add `renderSettingsPlatforms(lang, defaultTargets, hasInstagram)` — shows default publish targets with badges and description, API Keys button + Back
- [x] 3.4 Add `renderSettingsRepost(repostDefaults, lang)` — shows fast image and source analysis toggles with descriptions + Back
- [x] 3.5 Add `renderSettingsCommits(commitDefaults, lang)` — shows fast image and auto refine toggles with descriptions + Back
- [x] 3.6 Add `renderSettingsRepos(repoDefaults, lang)` — shows auto overview and watch pushes toggles with descriptions + Back

## 4. Sub-page routing

- [x] 4.1 Add `settings:sub:<category>` routing in `settings-keys.ts` — when `value === 'sub'`, read `extra` for category name, fetch needed data, render appropriate sub-page
- [x] 4.2 Add repo defaults toggle handler: `settings:repo:auto_overview` and `settings:repo:watch_pushes` — toggle in DB, re-render Repos sub-page

## 5. Update existing toggle back-navigation

- [x] 5.1 Update repost toggle handlers (`settings:rp:*`) to return to Repost sub-page instead of settings home
- [x] 5.2 Update commit toggle handlers (`settings:commit:*`) to return to Commits sub-page instead of settings home
- [x] 5.3 Update `renderApiKeys` back button to go to Platforms sub-page instead of settings home
- [x] 5.4 Update `renderPageSizeSelect` back button to go to General sub-page instead of settings home
- [x] 5.5 Update `renderTimezoneSelect` back button to go to General sub-page instead of settings home

## 6. View routing for sub-pages

- [x] 6.1 Sub-pages use `settings:sub:*` callbacks which route through the existing `settings` action handler — no new view routes needed

## 7. Repo add flow — gate overview bootstrap

- [x] 7.1 In `inputs/add-repo.ts`, import `getRepoDefaults` and read user's repo defaults before the overview bootstrap block
- [x] 7.2 Wrap the auto-overview bootstrap in `if (repoDefaults.autoOverview)` check
- [x] 7.3 Read `repoDefaults.defaultWatchPushes` and use it when creating the repo config instead of hardcoded `watchPushes: false`

## 8. Strings

- [x] 8.1 Add i18n strings for category button labels, sub-page titles, and setting descriptions in `en.ts` and `he.ts`
