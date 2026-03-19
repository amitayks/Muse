## 1. Database Schema & Migration

- [x] 1.1 Create migration file to add `default_prompts` table (prompt_type TEXT, language TEXT, content TEXT, version INTEGER DEFAULT 1, updated_at TEXT, PRIMARY KEY (prompt_type, language))
- [x] 1.2 Create migration file to add `user_prompts` table (chat_id TEXT, prompt_type TEXT, language TEXT, content TEXT, based_on_version INTEGER DEFAULT 1, updated_at TEXT, PRIMARY KEY (chat_id, prompt_type, language), FK on chat_id)
- [x] 1.3 Update `schema.sql` with both new table definitions

## 2. Seed Default Prompts

- [x] 2.1 Create seed migration that inserts all 7 English prompt types into `default_prompts` from current hardcoded constants (content, edit, repost, video, overview, persona, scoring)
- [x] 2.2 Seed Hebrew default prompts for all 7 types (maintainer writes natively — placeholder initially)

## 3. Prompt Service Module

- [x] 3.1 Create `cloudflare-bot/src/services/prompts.ts` with `PromptType` type, `USER_EDITABLE_PROMPTS`, and `ALL_PROMPTS` constants
- [x] 3.2 Implement `getPrompt(env, chatId, type, lang)` with three-level fallback (user custom → default in lang → default in English)
- [x] 3.3 Implement `saveUserPrompt(env, chatId, type, lang, content)` — upsert with based_on_version from current default
- [x] 3.4 Implement `deleteUserPrompt(env, chatId, type, lang)` — reset to default
- [x] 3.5 Implement `updateDefaultPrompt(env, type, lang, content)` — update content + bump version
- [x] 3.6 Implement `getDefaultPromptVersion(env, type, lang)` — return current version number
- [x] 3.7 Implement `getUserPromptStatus(env, chatId, type, lang)` — return isCustom, isStale, basedOnVersion, currentVersion

## 4. Wire Prompt Consumers

- [x] 4.1 Update `generateContent()` in `gemini.ts` — remove `CONTENT_SYSTEM_PROMPT` constant, call `getPrompt(env, chatId, 'content', lang)`, add chatId and lang parameters
- [x] 4.2 Update `refineHandwrittenContent()` in `gemini.ts` — remove `EDIT_SYSTEM_PROMPT` constant, call `getPrompt(env, chatId, 'edit', lang)`
- [x] 4.3 Update video script generation in `gemini.ts` — remove `VIDEO_SCRIPT_SYSTEM_PROMPT` constant, call `getPrompt(env, chatId, 'video', lang)`
- [x] 4.4 Update `extractOverview()` in `gemini.ts` — remove `OVERVIEW_EXTRACTION_PROMPT` constant, call `getPrompt(env, chatId, 'overview', lang)`
- [x] 4.5 Update repost generation in `repost-prompt.ts` — remove `REPOST_SYSTEM_PROMPT` constant, call `getPrompt(env, chatId, 'repost', lang)`
- [x] 4.6 Update persona bootstrap in `persona-prompt.ts` — remove `PERSONA_SYSTEM_PROMPT` constant, call `getPrompt(env, chatId, 'persona', lang)`
- [x] 4.7 Update scoring in `scoring-prompt.ts` — remove `SCORING_SYSTEM_PROMPT` constant, call `getPrompt(env, chatId, 'scoring', lang)`

## 5. Update Callers

- [x] 5.1 Update all callers of `generateContent()` to pass chatId and lang (GitHub webhook handler, /generate command, cron handler)
- [x] 5.2 Update all callers of repost generation to pass chatId and lang
- [x] 5.3 Update all callers of `refineHandwrittenContent()` to pass chatId and lang
- [x] 5.4 Update all callers of video/overview/persona/scoring functions to pass chatId and lang

## 6. Hebrew System Prompts

- [x] 6.1 Write native Hebrew version of CONTENT_SYSTEM_PROMPT and seed into default_prompts
- [x] 6.2 Write native Hebrew version of EDIT_SYSTEM_PROMPT and seed
- [x] 6.3 Write native Hebrew version of REPOST_SYSTEM_PROMPT and seed
- [x] 6.4 Write native Hebrew version of VIDEO_SCRIPT_SYSTEM_PROMPT and seed
- [x] 6.5 Write native Hebrew version of OVERVIEW_EXTRACTION_PROMPT and seed
- [x] 6.6 Write native Hebrew version of PERSONA_SYSTEM_PROMPT and seed
- [x] 6.7 Write native Hebrew version of SCORING_SYSTEM_PROMPT and seed

## 7. Cleanup & Verification

- [x] 7.1 Remove all hardcoded prompt constant declarations from service files (verify no const PROMPT strings remain)
- [x] 7.2 Verify `getPrompt()` returns correct prompts: test user custom, test default fallback, test English fallback
- [ ] 7.3 Deploy and verify content generation still works end-to-end (generate tweet from PR, repost, edit draft, video script)
