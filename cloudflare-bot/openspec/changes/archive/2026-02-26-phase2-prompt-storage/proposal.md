## Why

System prompts are currently hardcoded as `const` strings in service files (`gemini.ts`, `repost-prompt.ts`, `persona-prompt.ts`, `scoring-prompt.ts`). This means:
1. Updating a prompt requires a code deploy
2. Users cannot customize how their content sounds
3. There's no per-language prompt variant — the same English prompt is always used regardless of user language
4. The admin (bot maintainer) cannot iterate on prompts without code changes

We need to move prompts into the database with: global defaults managed by admin, per-user customizations for creative prompts, and per-language variants (en/he) stored independently.

**Depends on Phase 1** (i18n system) being completed — user language setting must exist to determine which language prompt to serve.

## What Changes

- Create `default_prompts` table for admin-managed global defaults (7 prompt types × 2 languages)
- Create `user_prompts` table for per-user customizations (3 creative prompt types × 2 languages per user)
- Migrate all 7 hardcoded system prompts from code into `default_prompts` table
- Write Hebrew versions of all 7 system prompts (maintainer writes natively)
- Create `getPrompt(env, chatId, type, lang)` resolution function: user custom → global default fallback
- Wire all prompt consumers (`generateContent`, `refineHandwrittenContent`, `buildRepostUserPrompt`, etc.) to use `getPrompt()` instead of hardcoded constants
- Add version tracking to default prompts for update notification support (Phase 4)
- Track whether users have customized their prompts via `based_on_version` field

## Capabilities

### New Capabilities
- `prompt-storage`: Database-backed system prompt storage with global defaults, per-user customization, per-language variants, and version tracking

### Modified Capabilities
- `multi-perspective-prompts`: Content generation prompt resolved from DB instead of hardcoded constant
- `repost-system`: Repost prompt resolved from DB instead of hardcoded constant

## Impact

- **DB migrations**: Create `default_prompts` and `user_prompts` tables, seed with current hardcoded prompts
- **New files**: `services/prompts.ts` (getPrompt resolution logic, prompt type constants)
- **Modified files**: `services/gemini.ts` (remove hardcoded prompts, use getPrompt), `services/repost-prompt.ts`, `services/persona-prompt.ts`, `services/scoring-prompt.ts`
- **Data migration**: Insert current hardcoded prompt text into `default_prompts` for all 7 types in English, and Hebrew versions (written by maintainer)

---

### Additional Context from Exploration

**Complete system prompt inventory** (7 prompts across 4 files):

| Constant | File | ~Lines | Purpose | User-editable? |
|----------|------|--------|---------|---------------|
| `CONTENT_SYSTEM_PROMPT` | `gemini.ts` | ~100 | Generate tweet + image prompt from PR/commit | Yes (creative) |
| `EDIT_SYSTEM_PROMPT` | `gemini.ts` | ~30 | Refine draft per user instruction | Yes (creative) |
| `VIDEO_SCRIPT_SYSTEM_PROMPT` | `gemini.ts` | ~40 | Generate HeyGen video scripts | Admin only |
| `OVERVIEW_EXTRACTION_PROMPT` | `gemini.ts` | ~20 | Extract structured project overview | Admin only |
| `REPOST_SYSTEM_PROMPT` | `repost-prompt.ts` | ~50 | Generate quote-tweet | Yes (creative) |
| `PERSONA_SYSTEM_PROMPT` | `persona-prompt.ts` | ~30 | Bootstrap X account persona | Admin only |
| `SCORING_SYSTEM_PROMPT` | `scoring-prompt.ts` | ~40 | Score tweets for relevance | Admin only |

**Prompt type enum** (for DB and code):
- `content` — CONTENT_SYSTEM_PROMPT
- `edit` — EDIT_SYSTEM_PROMPT
- `repost` — REPOST_SYSTEM_PROMPT
- `video` — VIDEO_SCRIPT_SYSTEM_PROMPT
- `overview` — OVERVIEW_EXTRACTION_PROMPT
- `persona` — PERSONA_SYSTEM_PROMPT
- `scoring` — SCORING_SYSTEM_PROMPT

**User-editable subset** (creative prompts only): `content`, `edit`, `repost`

**Per-language storage rationale**: Each prompt type has INDEPENDENT en/he versions. This means `{user}.content.en` and `{user}.content.he` are two separate stored texts. When the user switches bot language, the system serves the matching language prompt. This allows future per-feature language overrides (e.g., handwrite in English while bot is Hebrew) without giving Gemini mixed-language instructions.

**Prompt resolution flow**:
```
getPrompt(env, chatId, 'content', 'he')
  1. SELECT content FROM user_prompts WHERE chat_id=? AND prompt_type='content' AND language='he'
  2. If found → return user's custom prompt
  3. If not → SELECT content FROM default_prompts WHERE prompt_type='content' AND language='he'
  4. Return global default
```

**Version tracking** (used in Phase 4 for notifications):
- `default_prompts.version` — INTEGER, bumped when admin pushes an update
- `user_prompts.based_on_version` — INTEGER, set to current default version when user saves
- When `based_on_version < default version`, the user's prompt is "stale" and they can be notified
