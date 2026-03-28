## Context

All AI text generation in the bot flows through a single function: `callGeminiText()` in `src/ai/gemini.ts`. This function is called directly by 6 higher-level functions inside `gemini.ts` (`generateContent`, `refineContent`, `extractRepoOverview`, `generateVideoScript`, `refineHandwrittenContent`, and internally by `callGeminiText` itself) and by 4 external callers (`identity.ts:analyzeIdentity`, `scoring.ts:scoreTweetBatch`, `repost-generate.ts:generateRepostContent`, `persona-bootstrap.ts`).

The function signature is:
```typescript
callGeminiText(env, systemPrompt, userPrompt, options?: { temperature, jsonMode, tools })
→ Promise<string>
```

All callers receive a plain string back and do their own JSON parsing (usually via regex `match(/\{[\s\S]*\}/)`). This means the provider-specific details are fully contained in `callGeminiText` — the rest of the system is provider-agnostic already.

The Gemini API and Claude Messages API differ in:
- **Auth**: Gemini uses query-param API key; Claude uses `x-api-key` header
- **System prompt**: Gemini uses `systemInstruction` object; Claude uses `system` string
- **Content format**: Gemini uses `{text}` and `{inline_data: {mime_type, data}}`; Claude uses `{type:'text', text}` and `{type:'image', source: {type:'base64', media_type, data}}`
- **JSON mode**: Gemini uses `responseMimeType: 'application/json'`; Claude has no direct equivalent (system prompts already instruct JSON output, and the code already does regex extraction)
- **Tools**: Gemini uses `[{googleSearch: {}}]`; Claude uses `[{type:'web_search_20250305', name:'web_search'}]`
- **Response**: Gemini returns `candidates[0].content.parts[0].text`; Claude returns `content.find(c => c.type === 'text').text`

Image generation (`generateImage`) uses a separate Gemini model (`gemini-3-pro-image-preview`) and has no Claude equivalent. It stays on Gemini unconditionally.

User keys are decrypted in `getUserKeys()` and spread over `env` via `hydrateEnv()`. The settings UI uses a category sub-page pattern with Platforms handling API keys.

## Goals / Non-Goals

**Goals:**
- Users can choose between Gemini and Claude for all text generation
- Zero changes to the request flow — higher-level functions keep their exact same behavior
- Provider choice is per-user, stored in the database
- Claude API key management follows the existing encrypted key pattern
- Settings UI lets users switch provider and manage Claude key
- Web search capability preserved on both providers (Gemini `googleSearch` ↔ Claude `web_search`)

**Non-Goals:**
- Per-request or per-repo provider selection (future enhancement)
- Claude image generation (doesn't exist)
- Changing the onboarding flow (Claude is opt-in via Settings)
- Adding other providers (OpenAI, etc.) — but the abstraction should make it easy later
- Changing prompt content to be provider-specific (same prompts work for both)

## Decisions

### Decision 1: Router in `gemini.ts`, Claude logic in new `claude.ts`

**Choice**: Add `callLLMText()` to `gemini.ts` as the new public router. Create `claude.ts` with `callClaudeText()`. Keep `callGeminiText()` in place but internal callers switch to `callLLMText()`.

**Why not a new `llm.ts` file for the router?** All 4 external callers (`identity.ts`, `scoring.ts`, `repost-generate.ts`, `persona-bootstrap.ts`) currently import from `'./gemini'`. If we put the router in a new file, we change 4 import paths. If we put it in `gemini.ts`, the import path stays the same — we just change the function name in the import. Both are simple, but keeping it in `gemini.ts` is fewer file-level changes and `gemini.ts` already serves as the "AI service" file.

**Why not rename `gemini.ts` to `ai.ts`?** Adds a git rename, changes every import, and the file still contains Gemini-specific code (`generateImage`, `validateGeminiKey`). Not worth the churn. The file can be renamed in a future cleanup if desired.

**Why a separate `claude.ts`?** Keeps provider-specific HTTP logic isolated. Each provider file owns its API format, auth, and response parsing. The router is a thin dispatcher.

### Decision 2: Translate Gemini content format inside `callClaudeText`

**Choice**: `callClaudeText` accepts the same input format as `callGeminiText` (Gemini-style parts: `{text}` and `{inline_data: {mime_type, data}}`). It translates internally to Claude format before making the API call.

**Why?** This means `callLLMText` passes the exact same arguments to both providers. No format conversion needed in the router or callers. The translation cost is trivial (map over the parts array).

Translation map:
```
Gemini {text: "..."}           → Claude {type: "text", text: "..."}
Gemini {inline_data: {         → Claude {type: "image", source: {
  mime_type: "image/jpeg",         type: "base64",
  data: "base64..."               media_type: "image/jpeg",
}}                                 data: "base64..."
                               }}
```

### Decision 3: Tool mapping in the router

**Choice**: `callLLMText` translates the `tools` option before passing to the provider. If `tools` contains `{googleSearch: {}}` and the provider is Claude, it maps to `{type: 'web_search_20250305', name: 'web_search'}`.

**Why in the router, not in `callClaudeText`?** Because the tool names are a cross-cutting concern. The router knows "this caller wants web search" and translates to the provider-specific format. This keeps `callClaudeText` focused on the Claude API format, and callers keep using the Gemini-style tool names they already use.

### Decision 4: No JSON mode translation for Claude

**Choice**: When `jsonMode: true` is set and the provider is Claude, we do not add any special parameter. The system prompts already instruct the model to return JSON, and all response parsing already uses regex extraction (`match(/\{[\s\S]*\}/)`).

**Why?** Claude follows JSON instructions reliably from system prompts. The existing regex-based parsing is already robust (handles code fences, leading text, etc.). Adding Claude's structured output feature would be an optimization, not a requirement.

### Decision 5: Provider stored as `ai_provider` column on `users` table

**Choice**: New column `ai_provider TEXT DEFAULT 'gemini'`. Valid values: `'gemini'` | `'claude'`. Read during `hydrateEnv()` and placed on `env.AI_PROVIDER`.

**Why on `env`?** Because all AI functions already receive `env`. No signature changes needed anywhere. `callLLMText` just reads `env.AI_PROVIDER` to decide the route.

**Why not a separate settings table?** Overkill. It's one field. Same pattern as `language`, `timezone`, `page_size`.

### Decision 6: Claude key follows existing encrypted key pattern

**Choice**: New columns `claude_key_enc TEXT` and `has_claude INTEGER DEFAULT 0` on `users` table. Decrypted in `getUserKeys()` to `env.CLAUDE_API_KEY`. Validated with `validateClaudeKey()` (lightweight Messages API call).

**Why same pattern?** Consistency. Every other API key (Gemini, X, GitHub, Instagram, HeyGen) uses the same encrypt/decrypt/has_flag pattern. Users and maintainers already understand it.

### Decision 7: Provider toggle in Platforms settings sub-page

**Choice**: Add an "AI Provider" section to `renderSettingsPlatforms()` showing the current provider with a toggle button. Add Claude to the API Keys list in `renderApiKeys()`.

**Why Platforms?** It's where API keys already live. The provider choice is tightly coupled to which key is active. Putting it in General would separate it from the key management.

**UX flow**:
1. User goes to Settings → Platforms
2. Sees current AI provider (e.g., "🧠 AI Provider → Gemini")
3. Taps toggle → switches to Claude
4. If no Claude key: redirected to API Keys to enter one
5. If Claude key exists: provider switches immediately

### Decision 8: Claude model selection

**Choice**: Use `claude-sonnet-4-6-20250514` as the Claude model. Hardcoded in `claude.ts` (same pattern as Gemini model in `gemini.ts`).

**Why Sonnet 4.6?** Per user request. It's the best balance of quality and speed for content generation. Opus would be slower and more expensive. Haiku would sacrifice quality.

### Decision 9: Max tokens for Claude

**Choice**: Set `max_tokens: 8192` for Claude text calls. This is sufficient for all use cases (tweets are short, video scripts are medium, repo overviews are structured).

**Why 8192?** Gemini doesn't require explicit max_tokens (defaults are generous). Claude requires it. 8192 covers all existing use cases with headroom. Can be tuned per-call if needed later.

## Risks / Trade-offs

**[Risk] Claude doesn't support JSON mode natively** → Mitigation: System prompts already instruct JSON output. Regex extraction handles varied formatting. If Claude occasionally wraps JSON in markdown, the existing `match(/\{[\s\S]*\}/)` handles it.

**[Risk] Claude web search is a paid add-on ($10/1000 searches)** → Mitigation: Same economic model as Gemini (users provide their own API keys and pay their own usage). Document in the settings UI that web search incurs additional cost.

**[Risk] Provider switch mid-conversation could produce inconsistent content** → Mitigation: Provider is per-user, not per-draft. Switching provider affects new generations only. Existing drafts are already generated and stored.

**[Risk] Claude API rate limits differ from Gemini** → Mitigation: Both APIs return standard HTTP error codes. The existing error handling (`throw new Error('Content generation failed')`) works for both. No retry logic to adapt.

**[Risk] User sets Claude as provider but has no Claude key** → Mitigation: `callLLMText` checks for the required key before dispatching. If `AI_PROVIDER === 'claude'` but `CLAUDE_API_KEY` is undefined, throw a clear error prompting the user to add their key in Settings. The settings UI also validates: switching to Claude without a key redirects to key entry.

## Migration Plan

1. **Database migration** (`migrations/0XX_claude_provider.sql`):
   ```sql
   ALTER TABLE users ADD COLUMN ai_provider TEXT DEFAULT 'gemini';
   ALTER TABLE users ADD COLUMN claude_key_enc TEXT;
   ALTER TABLE users ADD COLUMN has_claude INTEGER DEFAULT 0;
   ```
   All existing users default to `'gemini'` — zero-impact rollout.

2. **Code deployment order** (all in one deploy, no phased rollout needed):
   - Add `claude.ts` (new file, no callers yet)
   - Add `callLLMText` to `gemini.ts` (new export, no callers yet)
   - Switch internal callers in `gemini.ts` from `callGeminiText` → `callLLMText`
   - Switch external callers (`identity.ts`, `scoring.ts`, `repost-generate.ts`, `persona-bootstrap.ts`) import
   - Add `CLAUDE_API_KEY` and `AI_PROVIDER` to `Env` type and hydration
   - Add settings UI changes
   - Run migration

3. **Rollback**: Set any user's `ai_provider` back to `'gemini'` in D1. No code rollback needed — `callLLMText` with `ai_provider='gemini'` routes to the unchanged `callGeminiText`.

## Open Questions

- **Should scoring (admin-only) always use Gemini regardless of user provider?** Scoring uses the admin's Gemini key. If we add Claude support, should the admin also be able to choose? For now, scoring stays on Gemini since it uses admin credentials.
- **Should identity analysis during onboarding use admin key + admin provider?** Currently it uses the admin Gemini key. This should probably stay as-is since the user hasn't set up their own provider yet at that point.
