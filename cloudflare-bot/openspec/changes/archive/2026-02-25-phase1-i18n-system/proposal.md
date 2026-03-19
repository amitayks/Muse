## Why

The bot currently has zero Hebrew support — the entire UI is hardcoded English across ~330 unique strings. Language toggles exist on repos and accounts but are overkill for this bot's scope. We want a single global user-level language setting that controls: (1) the entire bot interface language, and (2) which language system prompts are sent to Gemini. This phase builds the i18n string system, adds the user language setting, and removes per-repo/per-account language toggles.

**Depends on Phase 0** (component extraction) being completed first — without shared components, we'd need to add `t(lang, ...)` calls in 330+ individual locations across 54 render functions. With Phase 0 done, most strings live in ~12 reusable components.

## What Changes

- Create a string registry system (`ui/strings/en.ts`, `ui/strings/he.ts`, `ui/strings/index.ts`) with all ~330 user-facing strings
- Add `language TEXT DEFAULT 'en'` column to the `users` table (migration)
- Add language picker to the Settings menu (🇺🇸 English / 🇮🇱 עברית)
- Refactor all view functions and UI components (from Phase 0) to accept `lang` parameter and resolve strings via `t(lang, key)`
- Remove `language` field from `RepoConfig` type and repo config toggle
- Remove `language` field from `TwitterAccountConfig` type and account config toggle
- Remove language toggle buttons from repo detail and account detail views
- Pass user language into all prompt-building functions that generate AI content
- Wire the existing `repost-prompt.ts` language injection to use user language instead of account language

## Capabilities

### New Capabilities
- `i18n-strings`: Centralized string registry with English and Hebrew translations, supporting `t(lang, key)` resolution across all views and components

### Modified Capabilities
- `user-settings`: Add language picker to settings menu, store language preference per user
- `view-system`: All views accept and use `lang` parameter for string resolution
- `twitter-account-management`: Remove `language` from `TwitterAccountConfig`, remove language toggle from account detail
- `repost-system`: Use user-level language instead of account-level language for repost prompt generation

## Impact

- **DB migration**: Add `language` column to `users` table
- **New files**: `ui/strings/en.ts`, `ui/strings/he.ts`, `ui/strings/index.ts`
- **Modified files**: All view files (already refactored in Phase 0), all UI components in `ui/components.ts`, `types.ts` (RepoConfig, TwitterAccountConfig), `actions/config-toggle.ts`, `actions/account-config.ts`, `services/repost-prompt.ts`, `services/gemini.ts`
- **Removed**: `language` field from `RepoConfig` and `TwitterAccountConfig` types, language toggle case in `config-toggle.ts` and `account-config.ts`
- **Translation effort**: ~330 strings need Hebrew translations (written natively, not machine-translated)

---

### Additional Context from Exploration

**Current language field locations**:
- `RepoConfig.language` (types.ts line 195): `'en' | 'he'`, default `'en'`
- `TwitterAccountConfig.language` (types.ts line 419): `'en' | 'he'`, default `'en'`
- User table: NO language field currently exists

**Where language is actually consumed today**:
- `repost-prompt.ts` line 69: `params.language === 'he' ? 'Hebrew' : 'English'` — the ONLY place language affects AI output
- `views/repos.ts` line 85 and `views/accounts.ts` line 82: display `🇺🇸 EN` / `🇮🇱 HE` label
- `actions/config-toggle.ts` lines 145-147: toggles repo language
- `actions/account-config.ts` lines 30-32: toggles account language
- `generateContent()` in `gemini.ts` does NOT read repo language at all — it's a dead feature for the main content pipeline

**String categories (approximate counts)**:
| Category | Count |
|----------|-------|
| Screen titles/headers | ~50 |
| Body text/descriptions | ~70 |
| Button labels | ~80 |
| Status/emoji labels | ~30 |
| Error messages | ~25 |
| Loading/transition messages | ~12 |
| Onboarding flow texts | ~25 |
| Settings labels | ~40 |
| **Total** | **~330** |

**RTL note**: Hebrew is right-to-left. Telegram handles RTL natively in message text. Button labels in RTL also work natively. No special RTL handling needed in the code — just provide Hebrew strings and Telegram's client renders them correctly.

**Component signatures will change** (from Phase 0): Every component that displays text will gain a `lang: Lang` parameter. For example:
- `homeButton()` → `homeButton(lang: Lang)`
- `backButton(view)` → `backButton(view, lang: Lang)`
- `confirmDeleteView(...)` → `confirmDeleteView(..., lang: Lang)`
- etc.

**How user language flows through the system**:
1. User record fetched at start of every request (already happens in handlers)
2. `user.language` extracted (default `'en'`)
3. Passed to view functions and prompt builders
4. Views call `t(lang, 'key')` to resolve strings
5. Prompt builders use language to select system prompt version (Phase 2) or inject language instruction
