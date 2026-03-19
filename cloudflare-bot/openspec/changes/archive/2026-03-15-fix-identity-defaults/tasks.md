## 1. DB & Type System

- [x] 1.1 Create migration `014_identity_prompt_type.sql` — add `identity_lang_notified TEXT DEFAULT ''` column to `users` table
- [x] 1.2 Update `PromptType` union in `ai/prompts.ts` to add `'identity'` (10 total types)
- [x] 1.3 Update constants: `ALL_SKILLS` (add `'identity'`), `USER_EDITABLE_SKILLS` (add `'identity'`), `ADMIN_EDITABLE_SKILLS` (add `'identity'`), `IDENTITY_ATTACHED_SKILLS` (unchanged but verify)
- [x] 1.4 Update `assembleSystemInstruction` to resolve identity via `getPrompt(env, chatId, 'identity', lang)` instead of `'who-am-i'`
- [x] 1.5 Update `countStalePrompts` to exclude `prompt_type = 'identity'` from the stale count query

## 2. Skeleton Default Content

- [x] 2.1 Create `src/skills/identity-default.ts` with `IDENTITY_DEFAULT_EN` and `IDENTITY_DEFAULT_HE` skeleton identity text (first-person, minimal, honest about being a baseline)
- [x] 2.2 Update `src/skills/index.ts` barrel — add re-exports for `IDENTITY_DEFAULT_EN` / `IDENTITY_DEFAULT_HE`, update `getDefaultPromptTexts()` to include `{ type: 'identity', language: 'en'/'he', content }` entries (20 total entries)

## 3. Identity Storage Fix

- [x] 3.1 Update `analyzeIdentity()` in `ai/identity.ts` — store result as `saveUserPrompt(env, chatId, 'identity', lang, doc)` instead of `'who-am-i'`
- [x] 3.2 Remove `storeDefaultIdentity()` function from `ai/identity.ts` — no longer needed since defaults fall through via `getPrompt`
- [x] 3.3 Update `handleIdentityApi` in `routes/api-prompt.ts` — read/write `'identity'` prompt type instead of `'who-am-i'`

## 4. Onboarding Flow Fix

- [x] 4.1 Update `onboard:identity_default` handler in `commands/onboarding.ts` — remove the `storeDefaultIdentity` call, just advance to next step (user falls through to default)
- [x] 4.2 Update `onboard:skip_x` handler — remove the `storeDefaultIdentity` call, just advance to instagram step
- [x] 4.3 Update `handleIdentityAnalyze` error/null paths — remove `storeDefaultIdentity` calls, just show failure and advance (user falls through to default)
- [x] 4.4 Remove the `storeDefaultIdentity` import from `commands/onboarding.ts`

## 5. Language Switch Notification

- [x] 5.1 Add identity language notification view function — text explaining identity is missing for this language, with `[Re-analyze]`, `[Keep default]`, and `[Home]` buttons
- [x] 5.2 Add `hasAnalyzedIdentity(env, chatId, lang)` helper in `ai/identity.ts` — queries `user_prompts` to check if `identity` row exists for any language, and specifically for the target language
- [x] 5.3 Update `config:language` handler in `actions/config-toggle.ts` — after flipping language, call detection logic: (1) has ANY analyzed identity? (2) has identity in target lang? (3) already notified? If triggers, send notification message and update `identity_lang_notified`
- [x] 5.4 Add callback handlers for notification buttons — `identity_lang:reanalyze` triggers `analyzeIdentity()` for current language, `identity_lang:keep_default` dismisses

## 6. Admin Dashboard & WebApp

- [x] 6.1 Update admin dashboard in `routes/app-admin.ts` — add `<option value="identity">/identity — Default identity skeleton</option>` to dropdown
- [x] 6.2 Update user WebApp prompt editor in `routes/app.ts` — add `identity` tab alongside work-progress, refine, quote (if not already handled by `USER_EDITABLE_SKILLS` change)

## 7. Strings & Cleanup

- [x] 7.1 Add i18n strings for identity language notification (en + he) in `ui/strings/en.ts` and `ui/strings/he.ts`
- [x] 7.2 Run seed migration to insert `identity` skeleton defaults into `default_prompts` via `seedDefaultPrompts()` — handled by `getDefaultPromptTexts()` already including identity entries
- [x] 7.3 Verify: `who-am-i` in `default_prompts` still contains analysis skill (unchanged), `identity` in `default_prompts` contains skeleton, no `user_prompts` rows for `who-am-i` are created during onboarding — verified by code review
