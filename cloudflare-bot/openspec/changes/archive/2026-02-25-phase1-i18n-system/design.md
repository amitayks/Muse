## Context

After Phase 0, all reusable UI patterns live in `ui/components.ts` and `ui/utils.ts`. Views are cleaner and deduplicated. This phase adds the i18n layer on top of that foundation.

The bot runs as a Cloudflare Worker with D1 (SQLite). The user record is already fetched at the start of every request in the message/callback handlers. Adding `language` to the user record and passing it through is a plumbing change, not an architectural one.

**Current string situation**: ~330 unique user-facing strings are hardcoded across view files and components. All English. Zero Hebrew.

## Goals / Non-Goals

**Goals:**
- Every user-visible string in the bot is translatable via a centralized registry
- User can pick their language in Settings, and the entire bot UI switches
- Language setting stored per-user in DB
- Per-repo and per-account language toggles removed (single source of truth)
- Language passed to prompt builders for AI content generation
- Hebrew translations for all ~330 strings (written natively by the maintainer)

**Non-Goals:**
- Custom system prompt storage (that's Phase 2)
- WebApp UI (that's Phase 3)
- Supporting more than 2 languages (en/he only for now — but the architecture supports expansion)
- Translating system prompts themselves (Phase 2 handles that)

## Decisions

### 1. String registry as typed TypeScript objects with dot-path accessor

```typescript
// ui/strings/en.ts
export const en = {
  common: {
    home: '🏠 Home',
    back: '◀️ Back',
    cancel: '❌ Cancel',
    on: 'On',
    off: 'Off',
    error: '❌ Error',
    success: '✅ Success',
  },
  home: {
    title: '🤖 Content Bot Dashboard',
    nextUp: '📅 Next up:',
    noDrafts: 'No scheduled drafts',
    // ...
  },
  // ...
}
```

```typescript
// ui/strings/index.ts
export type Lang = 'en' | 'he';
export function t(lang: Lang, key: string): string { ... }
```

**Why typed objects over JSON files**: TypeScript catches missing keys at compile time. No runtime file loading needed (important in Cloudflare Workers where file I/O is restricted). Tree-shaking works naturally.

**Why dot-path string accessor `t(lang, 'home.title')` over nested access `strings[lang].home.title`**: The `t()` function provides a single point to add fallback logic (missing Hebrew key → fall back to English), logging, and future interpolation support.

**Alternative considered**: Using an i18n library like `i18next`. Rejected — too heavyweight for a Cloudflare Worker. The string count (~330) doesn't warrant a library. A simple object + accessor is sufficient.

### 2. Language type as a union, not an enum

```typescript
export type Lang = 'en' | 'he';
```

**Why**: Matches the existing `'en' | 'he'` pattern already used in `RepoConfig` and `TwitterAccountConfig`. No need to introduce enums.

### 3. Components receive `lang` as their last parameter

```typescript
function homeButton(lang: Lang): InlineButton
function backButton(view: string, lang: Lang): InlineButton
function toggleButton(label: string, isOn: boolean, callback: string, lang: Lang): InlineButton
```

**Why last**: Follows the pattern of "required data first, context/config last". Makes it easy to grep for the `lang` parameter addition.

**Note on `toggleButton`**: The `label` parameter will change from a display string to a string key. Instead of `toggleButton('Tags', true, cb)` → `toggleButton('repos.tags', true, cb, lang)` where the function resolves the label via `t(lang, key)` internally.

### 4. Settings language picker: simple two-button toggle

```
⚙️ Settings
├── 🌐 Language: 🇺🇸 English    ← tapping cycles to Hebrew
├── 🕐 Change Timezone
├── 📏 Page Size
├── 🔑 API Keys
└── 🏠 Home
```

Callback: `config:language` (no ID needed — it's a user-level setting, not per-resource).

**Why not a separate picker screen**: Only 2 options. A toggle button (same pattern as On/Off toggles) is simpler and faster.

### 5. Migration strategy for removing per-resource language

1. Add `language` column to `users` table (default `'en'`)
2. For existing users: set `user.language` to the language of their first repo or account (if any have `'he'`, set user to `'he'`)
3. Remove `language` from `RepoConfig` type and `parseRepoConfig()` defaults
4. Remove `language` from `TwitterAccountConfig` type and `parseTwitterAccountConfig()` defaults
5. Remove `config:language` case from `actions/config-toggle.ts`
6. Remove `tw_config:language` case from `actions/account-config.ts`
7. Remove language toggle button from `renderRepoDetail()` and `renderAccountDetail()`

The stored JSON in `repos.config` and `twitter_accounts.config` may still contain `language` keys — that's fine, `parseRepoConfig()` will simply ignore unknown keys after the type removes it.

### 6. Fallback strategy for missing translations

```typescript
function t(lang: Lang, key: string): string {
  const value = resolve(strings[lang], key);
  if (value) return value;
  // Fallback to English if Hebrew key is missing
  if (lang !== 'en') return resolve(strings.en, key);
  // Last resort: return the key itself (visible in UI as a bug indicator)
  return key;
}
```

This allows incremental Hebrew translation — the bot works with partial translations, falling back to English for untranslated keys.

## Risks / Trade-offs

**[Risk] Missing Hebrew translations at launch** → Mitigation: Fallback to English for missing keys. The maintainer writes Hebrew translations natively. Can ship with partial coverage and iterate.

**[Risk] String keys getting out of sync** → Mitigation: TypeScript type checking. If `en.ts` and `he.ts` don't have the same structure, the `t()` function types will catch it. Could add a build-time check that all keys in `en.ts` exist in `he.ts`.

**[Risk] Every view function signature changes (adding `lang`)** → Mitigation: Phase 0 already reduced the surface area. Most changes are mechanical (add parameter, replace hardcoded string with `t()` call). Can be done view-by-view.

**[Trade-off] `t(lang, 'key')` string keys are not type-safe** → Accepted for simplicity. Could use template literal types for full type safety but it adds complexity. The fallback mechanism (return key string on miss) makes missing keys visible without crashes.

## Additional Notes

**How `lang` flows through a typical request**:
```
Telegram Update arrives
→ handleMessage(env, message) or handleCallback(env, query)
  → getUser(env, chatId)
  → user.language (default 'en')
  → renderSomeView(env, chatId, ..., user.language)
    → t(lang, 'some.key') for text
    → homeButton(lang), backButton(view, lang), etc. for buttons
  → respond(env, chatId, viewResult)
```

**Router/handler change**: The `lang` needs to be available in action handlers and view functions. Since the user record is already fetched in most handler paths, this is a matter of extracting `user.language` and passing it along. Some action handlers fetch the user themselves — they already have access.

**Prompt builder changes** (preparation for Phase 2):
- `generateContent()` in `gemini.ts` → will receive `lang` parameter, adds `Language: Hebrew/English` instruction to user prompt
- `buildRepostUserPrompt()` in `repost-prompt.ts` → already accepts language, just needs to read from user instead of account config
- `refineHandwrittenContent()` in `gemini.ts` → will receive `lang` parameter
- Full system prompt switching (en/he prompt versions) is Phase 2's job — this phase only adds the language instruction to user prompts
