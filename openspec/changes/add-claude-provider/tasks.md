## 1. Database & Types

- [x] 1.1 Create migration `migrations/0XX_claude_provider.sql` adding `ai_provider TEXT DEFAULT 'gemini'`, `claude_key_enc TEXT`, and `has_claude INTEGER DEFAULT 0` columns to `users` table
- [x] 1.2 Update `schema.sql` with the new columns for reference
- [x] 1.3 Add `CLAUDE_API_KEY` (optional string) and `AI_PROVIDER` (optional string) to the `Env` interface in `src/types.ts`
- [x] 1.4 Add `ai_provider`, `claude_key_enc`, and `has_claude` fields to the `User` interface in `src/types.ts`

## 2. Key Resolution & Hydration

- [x] 2.1 Update `getUserKeys()` in `src/data/user-keys.ts` to initialize `CLAUDE_API_KEY: undefined` in the result object and decrypt `claude_key_enc` when present
- [x] 2.2 Update `getUserEncryptedKeys()` in `src/data/user-db.ts` to SELECT `claude_key_enc` from the users table
- [x] 2.3 Update `hydrateEnv()` in `src/data/user-keys.ts` to read `ai_provider` from the user record and set `env.AI_PROVIDER`

## 3. Claude Provider Implementation

- [x] 3.1 Create `src/ai/claude.ts` with `callClaudeText()` function — Claude Messages API call with system prompt, multimodal content translation (Gemini format → Claude format), temperature forwarding, and response text extraction
- [x] 3.2 Add `validateClaudeKey()` function to `src/ai/claude.ts` — lightweight test call returning boolean

## 4. LLM Router

- [x] 4.1 Add `callLLMText()` to `src/ai/gemini.ts` that reads `env.AI_PROVIDER`, translates tools (`googleSearch` → `web_search_20250305` for Claude), validates required API key exists, and dispatches to `callGeminiText` or `callClaudeText`
- [x] 4.2 Update all internal callers in `gemini.ts` to use `callLLMText` instead of `callGeminiText`: `generateContent`, `refineContent`, `extractRepoOverview`, `generateVideoScript`, `refineHandwrittenContent`
- [x] 4.3 Update `src/ai/identity.ts` to import and use `callLLMText` instead of `callGeminiText`
- [x] 4.4 Update `src/ai/scoring.ts` to import and use `callLLMText` instead of `callGeminiText`
- [x] 4.5 Update `src/ai/repost-generate.ts` to import and use `callLLMText` instead of `callGeminiText`
- [x] 4.6 Update `src/ai/persona-bootstrap.ts` to import and use `callLLMText` instead of `callGeminiText`

## 5. Settings Data Layer

- [x] 5.1 Add `getAiProvider(env, chatId)` and `setAiProvider(env, chatId, provider)` functions to `src/data/user-settings-db.ts`
- [x] 5.2 Add Claude key storage functions to `src/data/user-db.ts` — encrypt and store `claude_key_enc`, set `has_claude` flag (follow existing pattern from Gemini/X/GitHub key storage)

## 6. Settings UI

- [x] 6.1 Update `renderSettingsPlatforms()` in `src/views/settings.ts` to accept and display the current AI provider with a toggle button (`settings:ai_provider:gemini` / `settings:ai_provider:claude`)
- [x] 6.2 Update `renderApiKeys()` in `src/views/settings.ts` to include a Claude AI row with connect/update button (`settings:update:claude`)
- [x] 6.3 Update `renderSettings()` (settings home) in `src/views/settings.ts` to display current AI provider in the summary line (e.g., `🧠 AI → Gemini`)
- [x] 6.4 Add i18n strings for Claude-related labels in `src/ui/strings.ts` (Claude AI, Switch to Claude, Switch to Gemini, AI Provider, etc.)

## 7. Settings Action Handlers

- [x] 7.1 Add callback handler for `settings:ai_provider:gemini` and `settings:ai_provider:claude` — validate Claude key exists before switching, call `setAiProvider`, re-render Platforms sub-page
- [x] 7.2 Add callback handler for `settings:update:claude` — set `awaiting_input: 'update_key'` with `key_service: 'claude'`, prompt user for key
- [x] 7.3 Update the key input handler to support `key_service: 'claude'` — encrypt key, call `validateClaudeKey`, store or show error, follow existing pattern from other services

## 8. Wiring & Integration

- [x] 8.1 Update the settings command handler to pass `aiProvider` to `renderSettings` and `renderSettingsPlatforms` (fetch from `getAiProvider` or user record)
- [x] 8.2 Update the settings action router to dispatch `settings:ai_provider:*` and `settings:update:claude` callbacks
- [x] 8.3 Run the D1 migration on the database
