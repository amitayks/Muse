## Why

The settings page currently shows all options flat on a single screen, making it cluttered as settings grow. Additionally, repo defaults (watchPushes, auto-overview bootstrap) are hardcoded rather than user-configurable. The `watchPushes` default should be ON (currently OFF), and auto-overview bootstrap should be OFF by default (user triggers manually), both configurable in settings.

## What Changes

- **Settings page restructured into sub-sections**: The settings home page retains a full text summary of all current values, but the buttons become category navigation (General, Skills, Platforms, Repost, Commits, Repos) leading to dedicated sub-pages.
- **Each sub-page**: Shows current values with explanations of what each setting does, plus toggle/edit buttons and a Back button.
- **New "Repos" settings category**: Two new user-level defaults — `repo_default_watch_pushes` (default ON) and `repo_auto_overview` (default OFF) — controlling behavior when adding new repos.
- **`DEFAULT_REPO_CONFIG.watchPushes` flipped to `true`**: New repos watch pushes by default.
- **Overview bootstrap gated by setting**: Adding a new repo only auto-bootstraps overview if `repo_auto_overview` is enabled.

## Capabilities

### New Capabilities
- `settings-subsections`: Settings home page category navigation and sub-page rendering with descriptions

### Modified Capabilities
- `user-settings`: Add repo defaults section, restructure settings home to show summary text + category buttons instead of flat toggles
- `repo-overview`: Auto-bootstrap on repo add gated by new `repo_auto_overview` user setting
- `repost-settings`: No requirement change — just moved to sub-page (implementation only)

## Impact

- `views/settings.ts` — Major rewrite: settings home becomes summary + category buttons, new sub-page render functions
- `actions/settings-keys.ts` — New routing for sub-page navigation and repo defaults toggles
- `actions/config-toggle.ts` — Repo defaults toggles
- `data/user-settings-db.ts` — New getter/setter for repo defaults
- `types.ts` — New `RepoDefaults` type, `DEFAULT_REPO_CONFIG.watchPushes` flip
- `schema.sql` + new migration — `repo_auto_overview` and `repo_default_watch_pushes` columns
- Repo add flow (wherever repos are added) — read user's repo defaults instead of hardcoded values
