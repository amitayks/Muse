## Context

After Phase 0 (component extraction) and Phase 1 (i18n + user language), the bot has a clean component architecture and every user has a `language` field. Now we need to move the 7 hardcoded system prompts into the database so they can be managed dynamically.

The bot uses Cloudflare D1 (SQLite) for all storage. Prompts are plain text strings ranging from ~500 to ~3000 characters each. D1 has no practical text column size limit for these sizes.

Currently, prompts are consumed by service functions that call Gemini via `callGeminiText(env, systemPrompt, userPrompt)`. The system prompt is always a `const string` imported at module scope.

## Goals / Non-Goals

**Goals:**
- All 7 system prompts stored in DB with per-language variants
- Admin can update defaults without code deploys (via Phase 3/4 WebApp)
- Users can customize 3 creative prompts (via Phase 3 WebApp)
- Resolution logic: user custom → global default fallback
- Version tracking for future update notifications
- Zero functional change — same prompts, same AI behavior, just stored differently

**Non-Goals:**
- WebApp editor UI (that's Phase 3)
- Admin push/notification system (that's Phase 4)
- Prompt template variables/interpolation (prompts are plain text)
- Prompt A/B testing or analytics

## Decisions

### 1. Two-table schema: `default_prompts` + `user_prompts`

```sql
CREATE TABLE default_prompts (
  prompt_type TEXT NOT NULL,
  language TEXT NOT NULL,
  content TEXT NOT NULL,
  version INTEGER DEFAULT 1,
  updated_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (prompt_type, language)
);

CREATE TABLE user_prompts (
  chat_id TEXT NOT NULL,
  prompt_type TEXT NOT NULL,
  language TEXT NOT NULL,
  content TEXT NOT NULL,
  based_on_version INTEGER DEFAULT 1,
  updated_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (chat_id, prompt_type, language),
  FOREIGN KEY (chat_id) REFERENCES users(chat_id)
);
```

**Why two tables over one**: Cleaner separation of concerns. Default prompts are global (one row per type/lang). User prompts are sparse (only exists if user customized). No need for `is_default` flag or `NULL chat_id` hacks.

**Alternative considered**: Single `prompts` table with `chat_id NULL` for defaults. Rejected — makes the resolution query more complex and conflates two different access patterns.

### 2. Prompt type as string constant, not DB enum

```typescript
export type PromptType = 'content' | 'edit' | 'repost' | 'video' | 'overview' | 'persona' | 'scoring';
export const USER_EDITABLE_PROMPTS: PromptType[] = ['content', 'edit', 'repost'];
export const ALL_PROMPTS: PromptType[] = ['content', 'edit', 'repost', 'video', 'overview', 'persona', 'scoring'];
```

**Why**: SQLite doesn't have enums. TypeScript types enforce correctness at compile time. The string values are stored as-is in the DB.

### 3. Resolution function with caching consideration

```typescript
async function getPrompt(env: Env, chatId: string, type: PromptType, lang: Lang): Promise<string> {
  // 1. Check user custom
  const custom = await db.prepare(
    'SELECT content FROM user_prompts WHERE chat_id = ? AND prompt_type = ? AND language = ?'
  ).bind(chatId, type, lang).first<{ content: string }>();
  if (custom) return custom.content;

  // 2. Fall back to global default
  const def = await db.prepare(
    'SELECT content FROM default_prompts WHERE prompt_type = ? AND language = ?'
  ).bind(type, lang).first<{ content: string }>();
  if (def) return def.content;

  // 3. Last resort: fall back to English default
  const enDef = await db.prepare(
    'SELECT content FROM default_prompts WHERE prompt_type = ? AND language = ?'
  ).bind(type, 'en').first<{ content: string }>();
  return enDef?.content ?? '';
}
```

**Three-level fallback**: user custom → default in requested language → default in English. The English fallback ensures we never return empty even if Hebrew defaults haven't been seeded yet.

**No caching for now**: D1 reads are fast (same-region SQLite). Each prompt is fetched once per request. We can add KV caching later if needed.

### 4. Seeding defaults via migration

The migration that creates the tables also seeds them with the current hardcoded prompt text:

```sql
INSERT INTO default_prompts (prompt_type, language, content, version)
VALUES ('content', 'en', '<current CONTENT_SYSTEM_PROMPT text>', 1);
-- ... repeat for all 7 types in English
-- Hebrew versions seeded separately when written by maintainer
```

After seeding, the hardcoded `const` strings in service files are removed. The service functions call `getPrompt()` instead.

### 5. Keep service function signatures stable

Instead of passing prompt text through function signatures, service functions call `getPrompt()` internally:

```typescript
// Before (hardcoded):
async function generateContent(env: Env, source: ContentSource, repoId: string) {
  const systemPrompt = CONTENT_SYSTEM_PROMPT;
  // ...
}

// After (DB-backed):
async function generateContent(env: Env, source: ContentSource, repoId: string, chatId: string, lang: Lang) {
  const systemPrompt = await getPrompt(env, chatId, 'content', lang);
  // ...
}
```

The `chatId` and `lang` parameters are added (needed for prompt resolution), but the function still encapsulates the prompt fetching.

## Risks / Trade-offs

**[Risk] Migration inserts large text blobs** → Mitigation: Use a migration JS file that imports the prompt constants, not inline SQL. This avoids SQL escaping issues with quotes in prompt text.

**[Risk] Prompt changes break AI output quality** → Mitigation: Admin changes go through "Save" (personal) vs "Save & Push" (global) in Phase 4. Version tracking allows rollback by reverting to a previous version.

**[Risk] D1 read latency for every prompt fetch** → Mitigation: Prompts are small text blobs (<5KB). D1 reads are sub-millisecond for small rows. Acceptable for current scale. Can add KV caching per-user if needed later.

**[Trade-off] Prompts no longer visible in code review** → Accepted. The trade-off for dynamic editing capability. Initial prompts are captured in the migration file for historical reference.

## Additional Notes

**Prompt consumers that need updating**:

| Function | File | Currently uses | New behavior |
|----------|------|---------------|--------------|
| `generateContent()` | `gemini.ts` | `CONTENT_SYSTEM_PROMPT` | `getPrompt(env, chatId, 'content', lang)` |
| `refineHandwrittenContent()` | `gemini.ts` | `EDIT_SYSTEM_PROMPT` | `getPrompt(env, chatId, 'edit', lang)` |
| `callGeminiText()` for video | `gemini.ts` | `VIDEO_SCRIPT_SYSTEM_PROMPT` | `getPrompt(env, chatId, 'video', lang)` |
| `extractOverview()` | `gemini.ts` | `OVERVIEW_EXTRACTION_PROMPT` | `getPrompt(env, chatId, 'overview', lang)` |
| `generateRepost()` | `repost-prompt.ts` uses `REPOST_SYSTEM_PROMPT` | `getPrompt(env, chatId, 'repost', lang)` |
| `bootstrapPersona()` | `persona-prompt.ts` | `PERSONA_SYSTEM_PROMPT` | `getPrompt(env, chatId, 'persona', lang)` |
| `scoreCandidate()` | `scoring-prompt.ts` | `SCORING_SYSTEM_PROMPT` | `getPrompt(env, chatId, 'scoring', lang)` |

**Helper functions for the WebApp (Phase 3) and Admin (Phase 4)**:

The `services/prompts.ts` module should also export:
```typescript
// For WebApp save
async function saveUserPrompt(env, chatId, type, lang, content): Promise<void>
async function deleteUserPrompt(env, chatId, type, lang): Promise<void>  // "Reset to Default"

// For Admin push
async function updateDefaultPrompt(env, type, lang, content): Promise<void>  // bumps version
async function getDefaultPromptVersion(env, type, lang): Promise<number>

// For Phase 4 staleness check
async function getUserPromptStatus(env, chatId, type, lang): Promise<{ isCustom: boolean; isStale: boolean; basedOnVersion: number; currentVersion: number }>
```
