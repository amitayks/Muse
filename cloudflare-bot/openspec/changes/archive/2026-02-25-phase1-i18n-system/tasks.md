## 1. String Registry Setup

- [x] 1.1 Create `cloudflare-bot/src/ui/strings/en.ts` — extract ALL ~330 user-facing strings from views into organized English string object (domains: common, home, settings, repos, accounts, drafts, onboarding, repost, video, videoSettings, errors)
- [x] 1.2 Create `cloudflare-bot/src/ui/strings/he.ts` — create identical structure with Hebrew translations (placeholder stubs initially, maintainer fills in native Hebrew)
- [x] 1.3 Create `cloudflare-bot/src/ui/strings/index.ts` — export `Lang` type, `t(lang, key)` function with English fallback, and string type definitions

## 2. Database Migration

- [x] 2.1 Create migration to add `language TEXT DEFAULT 'en'` column to `users` table
- [x] 2.2 Update `User` interface in `types.ts` to include `language: Lang` field
- [x] 2.3 Add migration logic to set existing users' language based on their repo/account configs (if any have `'he'`, set user to `'he'`)

## 3. Update UI Components with i18n

- [x] 3.1 Update all component functions in `ui/components.ts` to accept `lang: Lang` parameter and use `t(lang, key)` for all string labels (homeButton, backButton, backHomeRow, paginationRows, toggleButton, cancelRow, confirmDeleteView, emptyListView, inputPromptView, errorWithBackView)

## 4. Refactor Views to use i18n

- [x] 4.1 Refactor `views/home.ts` — all 7 render functions accept `lang`, replace all hardcoded strings with `t(lang, key)`
- [x] 4.2 Refactor `views/settings.ts` — all 4 render functions accept `lang`, add language toggle button to `renderSettings()`
- [x] 4.3 Refactor `views/repos.ts` — all 4 render functions accept `lang`, remove language toggle button from `renderRepoDetail()`
- [x] 4.4 Refactor `views/accounts.ts` — all 4 render functions accept `lang`, remove language toggle button from `renderAccountDetail()`
- [x] 4.5 Refactor `views/drafts.ts` — all 7 render functions accept `lang`
- [x] 4.6 Refactor `views/onboarding.ts` — all 10 render functions accept `lang`
- [x] 4.7 Refactor `views/repost.ts` — all 3 render functions accept `lang`
- [x] 4.8 Refactor `views/video-studio.ts` — all 6 render functions accept `lang`
- [x] 4.9 Refactor `views/video-settings.ts` — all 9 render functions accept `lang`

## 5. Settings Language Picker

- [x] 5.1 Add `config:language` callback handler (toggle `user.language` between `'en'` and `'he'`, persist to DB, re-render settings)
- [x] 5.2 Register `config:language` callback in router dispatch table
- [x] 5.3 Add language toggle button to `renderSettings()` view (e.g., `🌐 🇺🇸 English` / `🌐 🇮🇱 עברית`)

## 6. Remove Per-Resource Language

- [x] 6.1 Remove `language` field from `RepoConfig` type in `types.ts` and from `parseRepoConfig()` defaults
- [x] 6.2 Remove `language` field from `TwitterAccountConfig` type in `types.ts` and from `parseTwitterAccountConfig()` defaults
- [x] 6.3 Remove `case 'language'` from `actions/config-toggle.ts` (repo language toggle handler)
- [x] 6.4 Remove `case 'language'` from `actions/account-config.ts` (account language toggle handler)
- [x] 6.5 Remove language toggle button from `renderRepoDetail()` in `views/repos.ts`
- [x] 6.6 Remove language toggle button from `renderAccountDetail()` in `views/accounts.ts`

## 7. Wire Language to Prompt Builders

- [x] 7.1 Update `buildRepostUserPrompt()` in `services/repost-prompt.ts` to accept `language` from user record instead of account config
- [x] 7.2 Update `generateContent()` in `services/gemini.ts` to accept and use `language` parameter (add language instruction to user prompt)
- [x] 7.3 Update `refineHandwrittenContent()` in `services/gemini.ts` to accept and use `language` parameter
- [x] 7.4 Update all callers of prompt builders to pass `user.language`

## 8. Wire Language Through Handlers

- [x] 8.1 Update message handler to extract `user.language` and pass to view/action calls
- [x] 8.2 Update callback handler to extract `user.language` and pass to view/action calls
- [x] 8.3 Update cron handler to use user language when generating notifications
- [x] 8.4 Update GitHub webhook handler to use repo owner's language when generating content

## 9. Hebrew Translation

- [x] 9.1 Fill in all Hebrew strings in `ui/strings/he.ts` (maintainer writes natively — not machine-translated)

## 10. Verification

- [x] 10.1 Verify no hardcoded English strings remain in any view file (grep for quoted strings that aren't imports/keys)
- [ ] 10.2 Verify language toggle works end-to-end: switch to Hebrew → all screens render in Hebrew → switch back to English
- [x] 10.3 Verify repo detail no longer shows language toggle button
- [x] 10.4 Verify account detail no longer shows language toggle button
- [x] 10.5 Verify repost generation uses user language, not account language
- [ ] 10.6 Deploy and test all screens in both languages
