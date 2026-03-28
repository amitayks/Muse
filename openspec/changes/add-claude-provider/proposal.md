## Why

The bot currently hardcodes Gemini as the sole AI text provider. Users have no choice over which LLM generates their content. Adding Claude Sonnet 4.6 as an alternative text provider gives users flexibility, enables quality comparison, and reduces single-vendor dependency. Image generation remains Gemini-only (it's the only provider with native image gen), but all text generation flows — content, refinement, repost, video scripts, identity analysis, scoring, and repo overview extraction — should route through whichever provider the user selects.

## What Changes

- **New AI provider abstraction layer**: A `callLLMText()` router function that reads the user's chosen provider and dispatches to `callGeminiText()` or `callClaudeText()`. All existing higher-level AI functions (`generateContent`, `refineContent`, `extractRepoOverview`, `generateVideoScript`, `refineHandwrittenContent`, `analyzeIdentity`, `scoreTweetBatch`, `generateRepostContent`) switch from calling `callGeminiText()` directly to calling `callLLMText()`.
- **Claude provider implementation**: A new `callClaudeText()` function that translates the existing system-prompt + user-prompt + options interface into Claude Messages API format, including multimodal support (base64 images) and web search tool (`web_search_20250305` replacing Gemini's `googleSearch`).
- **Claude API key validation**: A `validateClaudeKey()` function mirroring `validateGeminiKey()`.
- **Database additions**: New columns on `users` table: `ai_provider` (TEXT, default `'gemini'`), `claude_key_enc` (TEXT, nullable), `has_claude` (INTEGER, default 0).
- **Environment hydration**: `hydrateEnv()` decrypts `claude_key_enc` into `env.CLAUDE_API_KEY` and exposes `env.AI_PROVIDER` so the router can dispatch.
- **Settings UI**: New "AI Provider" toggle in the Platforms settings sub-page letting users switch between Gemini and Claude for text generation. New Claude API key connect/update flow (same pattern as existing Gemini/X/GitHub key management).
- **Onboarding unchanged**: The Gemini key step remains as-is. Claude is configured post-onboarding via Settings only. This keeps onboarding simple — Gemini is the default, Claude is opt-in.
- **Image generation unchanged**: `generateImage()` always uses Gemini's image model via `GOOGLE_API_KEY`. If the user has no Gemini key, image generation is skipped (already optional in all flows).

## Capabilities

### New Capabilities
- `ai-provider`: Multi-provider AI text generation abstraction — provider router (`callLLMText`), Claude Messages API integration (`callClaudeText`), provider-specific tool mapping (googleSearch ↔ web_search), multimodal input translation, and Claude key validation. Covers all text generation routing while leaving image generation on Gemini.

### Modified Capabilities
- `user-key-resolution`: Adding `CLAUDE_API_KEY` and `AI_PROVIDER` to the hydrated env object. `getUserKeys()` decrypts `claude_key_enc` alongside existing keys. `hydrateEnv()` populates both new fields.
- `user-settings`: Adding AI provider selection toggle in the Platforms settings sub-page, Claude API key connect/update management following the existing key update pattern, and provider status display.

## Impact

- **`src/ai/gemini.ts`**: All higher-level functions switch from `callGeminiText()` to `callLLMText()`. `callGeminiText()` itself remains unchanged but is no longer called directly by business logic. `generateImage()` is untouched (stays on Gemini).
- **`src/ai/` (new files)**: `claude.ts` (Claude API call + response parsing), provider router added to gemini.ts or new `llm.ts`.
- **`src/ai/identity.ts`**, **`src/ai/scoring.ts`**, **`src/ai/repost-generate.ts`**: Change `callGeminiText` import to `callLLMText`. No logic changes.
- **`src/types.ts`**: Add `CLAUDE_API_KEY`, `AI_PROVIDER` to `Env` interface. Add `'claude'` to relevant union types.
- **`src/data/user-keys.ts`**: Decrypt `claude_key_enc`, populate `CLAUDE_API_KEY` and `AI_PROVIDER` in hydrated env.
- **`src/data/user-db.ts`**: Handle `claude_key_enc`, `has_claude`, `ai_provider` columns.
- **`src/data/user-settings-db.ts`**: Add getter/setter for `ai_provider`.
- **`src/views/settings.ts`**: Render provider toggle and Claude key status in Platforms sub-page.
- **`src/commands/onboarding.ts`**: No changes.
- **Database migration**: New migration adding `ai_provider`, `claude_key_enc`, `has_claude` columns to `users` table.
- **Dependencies**: No new npm packages — Claude API is called via raw `fetch` (same pattern as Gemini).
