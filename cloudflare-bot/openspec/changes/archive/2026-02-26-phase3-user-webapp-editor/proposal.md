## Why

With Phase 2, system prompts are stored in the database and can be customized per-user. But there's no UI for users to actually edit them. Telegram's inline message interface is too limited for editing multi-paragraph prompt text. We need a rich editing experience that lets users view and modify their 3 creative system prompts (content, edit, repost) comfortably.

Telegram WebApps (Mini Apps) provide exactly this — a web page embedded inside Telegram with access to user identity via `initData`. This phase builds the user-facing WebApp prompt editor and the API routes to support it.

**Depends on Phase 2** (prompt storage) — the DB tables and resolution functions must exist before the editor can read/write prompts.

## What Changes

- Add `web_app` field support to `InlineButton` type and `toTelegramKeyboard()` serializer
- Add `web_app_data` field to `TelegramMessage` type and handler routing
- Create `/app/prompts` route serving the user prompt editor HTML page
- Create `/api/prompt` GET/POST routes for reading/saving prompts (authenticated via Telegram `initData`)
- Add "System Prompts" button to settings view that opens the WebApp
- Fix `X-Frame-Options` for `/app/*` routes (Telegram loads WebApps in iframes)
- Build the editor HTML page with tabs (Content/Edit/Repost), textarea, Save, and Reset to Default

## Capabilities

### New Capabilities
- `webapp-prompt-editor`: Telegram WebApp-based system prompt editor for users to customize their creative prompts
- `webapp-api`: API routes for prompt CRUD operations authenticated via Telegram initData

### Modified Capabilities
- `user-settings`: Add "System Prompts" button that opens the WebApp editor
- `view-system`: Add `web_app` button type support to InlineButton and keyboard serializer

## Impact

- **New files**: `routes/app.ts` (serves WebApp HTML), `routes/api-prompt.ts` (prompt API endpoints), `services/telegram-auth.ts` (initData validation)
- **Modified files**: `types.ts` (InlineButton web_app field, TelegramMessage web_app_data field), `services/telegram.ts` (toTelegramKeyboard web_app support), `handlers/message.ts` (web_app_data routing), `views/settings.ts` (System Prompts button), `index.ts` (new routes), `security.ts` (X-Frame-Options exception for /app/*)
- **New HTML**: User prompt editor page (can be served inline from worker or as a static asset)
- **No DB changes** (uses Phase 2 tables)

---

### Additional Context from Exploration

**Current WebApp readiness (from investigation)**:
- `InlineButton` type has NO `web_app` field — only `callback_data`, `url`, `style`
- `toTelegramKeyboard()` serializer has NO `web_app` branch — would silently drop it
- `TelegramMessage` type has NO `web_app_data` field
- `handleMessage()` has NO `web_app_data` branch
- No `/app` or `/api` routes exist in the worker
- `security.ts` sets `X-Frame-Options: DENY` globally — **blocks iframe loading** in Telegram

**Telegram WebApp architecture**:
- User taps a `web_app` button → Telegram opens a web view (iframe) pointing to the URL
- The page loads with `window.Telegram.WebApp` SDK injected by Telegram client
- `Telegram.WebApp.initDataUnsafe` contains user info (id, first_name, etc.)
- `Telegram.WebApp.initData` is a signed string for server-side validation
- Two data-return methods:
  - `sendData(data)`: sends up to 4096 bytes back as `web_app_data` message, closes WebApp immediately
  - Direct API calls: WebApp calls your server API with initData for auth → no size limit, doesn't close WebApp

**We use direct API calls** (not `sendData`) because:
- System prompts can exceed 4096 bytes (CONTENT_SYSTEM_PROMPT is ~3000 chars)
- We want to show loading/error states during save
- Save confirmation before closing
- Can validate prompt content server-side

**initData validation flow**:
1. WebApp sends `Telegram.WebApp.initData` string in request header
2. Server validates HMAC-SHA256 signature using bot token
3. Extracts `user.id` (chat_id) from validated data
4. Uses chat_id for prompt CRUD operations

**Worker route structure after this phase**:
```
/webhook          — existing Telegram webhook
/github-webhook   — existing GitHub webhook
/app/prompts      — NEW: serves user prompt editor HTML
/api/prompt       — NEW: GET (read prompt), POST (save prompt), DELETE (reset to default)
/health           — existing
/media/:key       — existing
/image/:key       — existing
```

**X-Frame-Options fix**: The `/app/*` routes need `X-Frame-Options: ALLOW-FROM https://web.telegram.org` or simply omit the header for those routes. The `addSecurityHeaders()` function in `security.ts` currently applies `DENY` to all responses.

**Settings view integration**:
```
⚙️ Settings
├── 🌐 Language: 🇺🇸 English
├── 📝 System Prompts        ← NEW: web_app button opens /app/prompts
├── 🕐 Change Timezone
├── 📏 Page Size
├── 🔑 API Keys
└── 🏠 Home
```

**Editor HTML page concept**:
- Single HTML file with embedded CSS/JS (no build step needed)
- Uses `window.Telegram.WebApp` SDK for theme colors and user data
- 3 tabs: Content, Edit, Repost
- Large textarea for editing
- Shows "Using default" or "Custom" badge per prompt
- [Save] button → POST /api/prompt
- [Reset to Default] button → DELETE /api/prompt → reloads default text
- Uses Telegram theme variables (`var(--tg-theme-bg-color)`, etc.) for native look
