## Why

The identity system has two critical bugs: (1) `storeDefaultIdentity` saves the analysis skill instructions as the user's identity document — meaning users could see raw Gemini prompt instructions, and (2) identity is only stored for the onboarding language, so switching languages leaves identity empty (falling through to the analysis skill prompt). Both stem from `who-am-i` doing double duty as both the analysis skill and the user's identity document.

## What Changes

- **Split `who-am-i` into two prompt types**: `who-am-i` stays as the admin-only analysis skill. New `identity` prompt type stores the user's actual identity document (analyzed or skeleton default).
- **Add skeleton defaults to `default_prompts`**: Real identity skeleton text for each language (admin-editable, not hardcoded). Stored as `identity` prompt type.
- **Stop storing defaults in `user_prompts`**: Users who choose "Use default" get NO `user_prompts` row — `getPrompt` falls through to `default_prompts('identity', lang)`. Admin pushes auto-update these users.
- **Only store analyzed/edited identity in `user_prompts`**: When user analyzes, store result as `user_prompts(chatId, 'identity', lang)`. Other languages fall through to skeleton default.
- **Language switch notification**: When user switches to a language where they have no analyzed identity (but DO have analysis in another language), show a one-time notification offering to re-analyze.
- **Exclude `identity` from stale count**: Since analyzed users don't care about skeleton default version changes.

## Capabilities

### New Capabilities
- `identity-language-sync`: Language switch detection, one-time notification when identity is missing for target language, re-analyze or keep-default flow

### Modified Capabilities
- `prompt-storage`: Add `identity` prompt type, exclude `identity` from stale count, update `IDENTITY_ATTACHED_SKILLS` to resolve `identity` instead of `who-am-i`, add `identity` to `USER_EDITABLE_SKILLS` and `ADMIN_EDITABLE_SKILLS`
- `user-onboarding`: Fix "Use default" to NOT store in `user_prompts` (let fallback handle it), fix "Analyze" to store as `identity` prompt type instead of `who-am-i`
- `skills-extraction`: Add `identity` skeleton default files (en/he) to `src/skills/`, update barrel index and `getDefaultPromptTexts()`

## Impact

- **DB migration**: New `identity` rows in `default_prompts`, new `identity_lang_notified` column on `users` table
- **Modified files**: `ai/prompts.ts` (new type, constants, stale exclusion), `ai/identity.ts` (use `identity` type, remove `storeDefaultIdentity`), `commands/onboarding.ts` (remove default storage calls), `actions/config-toggle.ts` (language switch notification), `skills/index.ts` (new skeleton exports), `routes/api-prompt.ts` (identity API uses new type), `routes/app-admin.ts` (add `identity` to dropdown), `views/settings.ts` or new notification view
- **New files**: `skills/identity-default.ts` (skeleton text en/he), notification view for language switch
- **No breaking changes**: No existing users to migrate
