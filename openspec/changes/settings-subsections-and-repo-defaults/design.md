## Context

The settings page (`views/settings.ts`) currently renders all settings flat on one screen with 7 rows of buttons. As settings grow (now adding repo defaults), the page is cluttered. The repo add flow (`inputs/add-repo.ts:96-115`) always auto-bootstraps overview, and `DEFAULT_REPO_CONFIG.watchPushes` is hardcoded to `false`.

## Goals / Non-Goals

**Goals:**
- Restructure settings into category-based sub-pages while keeping a summary overview on the main settings screen
- Add two new user-level repo defaults (`repo_auto_overview`, `repo_default_watch_pushes`)
- Gate auto-overview bootstrap on repo add by user setting
- Flip default watchPushes to ON for new repos

**Non-Goals:**
- Changing existing per-repo config on already-added repos
- Adding new repo-level settings beyond the two defaults
- Changing the API keys sub-page (it's already a sub-page)
- Redesigning the repo detail page itself

## Decisions

### 1. Settings home shows summary text + 6 category buttons

The settings home message text shows a compact overview of ALL current values (same info as today, plus repo defaults). The keyboard becomes category navigation buttons instead of direct toggles.

```
⚙️ Settings

🕐 Timezone → UTC+2
📄 Page Size → 5 items
🌐 Language → English

🔄 Repost: Fast Image ⬜ · Source Analysis ✅
📝 Commits: Fast Image ✅ · Auto Refine ✅
📦 Repos: Auto Overview ⬜ · Watch Pushes ✅

[⚙️ General]  [🧠 Skills]   [📱 Platforms]
[🔄 Repost]   [📝 Commits]  [📦 Repos]
[🔑 API Keys] [🏠 Home]
```

**Alternative**: Keep everything flat and just add more rows. Rejected — already 7+ rows, will only grow.

### 2. Sub-page pattern

Each sub-page follows the same pattern:
- Title with emoji
- Current values with description of what each setting does
- Toggle/action buttons
- Back button → returns to settings home

Sub-pages use callback prefix `settings:sub:<category>` for navigation, and existing callback patterns for toggles (e.g., `settings:rp:fast_image` stays the same).

### 3. Category → sub-page routing

Navigation callbacks:
- `settings:sub:general` → renderSettingsGeneral()
- `settings:sub:skills` → renderSettingsSkills()
- `settings:sub:platforms` → renderSettingsPlatforms()
- `settings:sub:repost` → renderSettingsRepost()
- `settings:sub:commits` → renderSettingsCommits()
- `settings:sub:repos` → renderSettingsRepos()

Each renders a ViewResult. The handler in `settings-keys.ts` routes `value === 'sub'` and reads `extra` for the category.

### 4. New DB columns for repo defaults

Two new columns on the `users` table via migration:
- `repo_auto_overview` INTEGER DEFAULT 0 (OFF)
- `repo_default_watch_pushes` INTEGER DEFAULT 1 (ON)

New getter/setter in `user-settings-db.ts`:
```typescript
getRepoDefaults(env, chatId): { autoOverview: boolean; defaultWatchPushes: boolean }
setRepoDefault(env, chatId, field, value): void
```

### 5. Repo add flow reads user defaults

In `inputs/add-repo.ts`, the overview bootstrap block (lines 96-115) gets wrapped in a check:
```typescript
const repoDefaults = await getRepoDefaults(env, chatId);
if (repoDefaults.autoOverview) {
    // existing overview bootstrap code
}
```

The repo config at creation uses `repoDefaults.defaultWatchPushes` instead of hardcoded `false`.

### 6. DEFAULT_REPO_CONFIG.watchPushes stays false

Rather than changing `DEFAULT_REPO_CONFIG` (which would affect existing repos that rely on the default), the repo add flow explicitly sets `watchPushes` from user settings. `DEFAULT_REPO_CONFIG` remains backward-compatible for existing repos.

**Alternative**: Flip `DEFAULT_REPO_CONFIG.watchPushes` to `true`. Rejected — would change behavior for existing repos that use the default.

## Risks / Trade-offs

- **Sub-page navigation adds clicks**: Users need one more click to reach a toggle. Mitigated by keeping full overview visible on the main page so users can see values without navigating.
- **Existing callback patterns preserved**: All existing toggle callbacks (`settings:rp:*`, `settings:commit:*`, `config:*`) continue working — sub-pages just use different "back" targets. Low risk.
- **Migration is additive**: Two new columns with defaults, no data changes needed.
