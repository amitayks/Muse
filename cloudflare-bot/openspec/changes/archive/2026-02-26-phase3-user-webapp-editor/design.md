## Context

Phase 2 gave us `default_prompts` and `user_prompts` tables with `getPrompt()`, `saveUserPrompt()`, and `deleteUserPrompt()` functions. Now we need a UI for users to interact with these.

The bot is a Cloudflare Worker. It can serve HTML directly from route handlers (no separate Pages deployment needed). The current worker handles routes via a simple URL-path switch in `index.ts`.

Telegram WebApps (Mini Apps) are web pages opened inside the Telegram client via `web_app` inline keyboard buttons. They run in a sandboxed web view with access to `window.Telegram.WebApp` SDK for theme integration and user identity.

## Goals / Non-Goals

**Goals:**
- Users can view and edit their 3 creative system prompts (content, edit, repost)
- Editor provides a comfortable text editing experience (not cramped Telegram message input)
- Edits are saved directly to the database via API calls
- Users can reset any prompt to the current global default
- Authentication via Telegram `initData` HMAC validation
- Editor matches Telegram's visual theme (dark/light mode)

**Non-Goals:**
- Admin prompt editor (that's Phase 4 — separate HTML page)
- Version comparison or diff view (Phase 4)
- Prompt template variables or syntax highlighting
- Offline editing or draft saving
- Rich text / markdown editing — prompts are plain text

## Decisions

### 1. Serve WebApp HTML inline from the worker

The HTML page is a single file with embedded CSS and JS (~200-300 lines). Serve it as a template literal string from the route handler:

```typescript
// routes/app.ts
export function handlePromptEditorPage(): Response {
  const html = `<!DOCTYPE html>...`;
  return new Response(html, {
    headers: {
      'Content-Type': 'text/html',
      // NO X-Frame-Options header — Telegram needs iframe access
    }
  });
}
```

**Why inline over Cloudflare Assets**: Zero config change needed. No `[assets]` in `wrangler.toml`, no `public/` directory. The HTML is small enough to live in code. If it grows beyond ~500 lines, we can migrate to `[assets]` later.

**Alternative considered**: Cloudflare Pages as a separate deployment. Rejected — too much infrastructure for a single HTML page.

### 2. Direct API calls for CRUD, not `sendData()`

The WebApp makes fetch calls to the worker's API routes:

```
GET  /api/prompt?type=content&lang=en  → returns { content, isCustom, isStale }
POST /api/prompt                       → body: { type, lang, content } → saves
DELETE /api/prompt?type=content&lang=en → resets to default
```

**Why not `Telegram.WebApp.sendData()`**: Size limit (4096 bytes), closes WebApp immediately, no error handling, no loading states. Direct API calls have none of these limitations.

### 3. Authentication via initData HMAC validation

Every API request includes `Telegram.WebApp.initData` in the `Authorization` header:

```
Authorization: tma <initData string>
```

Server-side validation:
1. Parse `initData` as URL query string
2. Extract `hash` parameter
3. Sort remaining parameters alphabetically, join with `\n`
4. HMAC-SHA256 with key derived from bot token: `HMAC(HMAC("WebAppData", bot_token), data_check_string)`
5. Compare computed hash with provided hash
6. Extract `user.id` as `chatId`

**Why**: This is Telegram's official authentication mechanism for Mini Apps. No session tokens, no cookies, no separate auth system. The bot token is already available in `env.BOT_TOKEN`.

### 4. Editor UI structure

```
┌─────────────────────────────────────────┐
│  📝 System Prompts                       │
│                                          │
│  ┌─────────┬────────┬──────────┐        │
│  │ Content │  Edit  │  Repost  │  ← tabs│
│  └─────────┴────────┴──────────┘        │
│                                          │
│  ┌──────────────────────────────┐       │
│  │ Badge: "Custom" or "Default" │       │
│  └──────────────────────────────┘       │
│                                          │
│  ┌──────────────────────────────┐       │
│  │                              │       │
│  │  [textarea - auto-resizing]  │       │
│  │                              │       │
│  │                              │       │
│  └──────────────────────────────┘       │
│                                          │
│  [Reset to Default]        [Save]       │
│                                          │
│  Saving... ✅ Saved!                     │
└─────────────────────────────────────────┘
```

- Tab selection loads the prompt for that type via GET /api/prompt
- Textarea auto-resizes to content
- Save button calls POST /api/prompt, shows loading spinner, then success/error
- Reset to Default calls DELETE /api/prompt, reloads the default text
- Badge shows "Custom" (green) or "Default" (gray) per prompt
- Uses Telegram theme CSS variables for native appearance

### 5. X-Frame-Options exception for /app/* routes

The `addSecurityHeaders()` function in `security.ts` sets `X-Frame-Options: DENY` on all responses. For `/app/*` routes, this header must be omitted (Telegram loads WebApps in iframes).

**Approach**: Add a parameter or check in `addSecurityHeaders()` to skip `X-Frame-Options` for WebApp routes. Or apply security headers selectively in `index.ts` based on route prefix.

### 6. Language auto-detection in the editor

The editor auto-selects the user's language (from their bot setting). The API returns prompts in the user's language by default. Users don't need to toggle language in the editor — they edit the prompt for their current bot language.

**Why**: Simplifies the user experience. If a user is in Hebrew mode, they see and edit Hebrew prompts. If they switch bot language (in Settings), the editor shows the other language's prompts next time.

## Risks / Trade-offs

**[Risk] initData validation complexity** → Mitigation: Telegram provides well-documented validation steps. Use the Web Crypto API available in Cloudflare Workers for HMAC-SHA256. Test thoroughly with a real Telegram WebApp session.

**[Risk] WebApp may not load due to HTTPS/security issues** → Mitigation: The worker URL is already HTTPS (Cloudflare). Just need to ensure X-Frame-Options is not set. Test in Telegram's Android, iOS, and desktop clients.

**[Risk] Large inline HTML string in worker code** → Mitigation: Extract to a separate `.ts` file that exports the HTML string. Keeps the route handler clean. If it grows too large, migrate to Cloudflare Assets.

**[Trade-off] No syntax highlighting or smart editing** → Accepted. System prompts are plain text instructions to an AI. A textarea is sufficient. Rich editing adds complexity without clear benefit.

**[Trade-off] User can only edit prompts in their current bot language** → Accepted for simplicity. Power users who want to maintain both en and he prompts can switch bot language and edit each. The admin WebApp (Phase 4) shows both languages.

## Additional Notes

**API route signatures**:

```
GET /api/prompt?type=content&lang=en
Headers: Authorization: tma <initData>
Response: { content: string, isCustom: boolean, isStale: boolean, defaultVersion: number }

POST /api/prompt
Headers: Authorization: tma <initData>, Content-Type: application/json
Body: { type: string, lang: string, content: string }
Response: { success: true }

DELETE /api/prompt?type=content&lang=en
Headers: Authorization: tma <initData>
Response: { success: true, content: string }  // returns the default prompt text
```

**WebApp SDK integration points**:
- `Telegram.WebApp.initData` — for auth header
- `Telegram.WebApp.initDataUnsafe.user.id` — for display (not for auth — server validates)
- `Telegram.WebApp.themeParams` — for CSS variable theming
- `Telegram.WebApp.MainButton` — can use Telegram's native bottom button for Save
- `Telegram.WebApp.BackButton` — can use Telegram's native back button
- `Telegram.WebApp.close()` — close the WebApp after successful save (optional)
- `Telegram.WebApp.ready()` — signal to Telegram that the page is loaded
- `Telegram.WebApp.expand()` — expand to full height

**Telegram theme CSS variables** (auto-available in WebApp):
```css
var(--tg-theme-bg-color)
var(--tg-theme-text-color)
var(--tg-theme-hint-color)
var(--tg-theme-link-color)
var(--tg-theme-button-color)
var(--tg-theme-button-text-color)
var(--tg-theme-secondary-bg-color)
```
