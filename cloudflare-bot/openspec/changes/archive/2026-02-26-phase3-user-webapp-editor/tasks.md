## 1. Type System Updates

- [x] 1.1 Add `web_app?: { url: string }` field to `InlineButton` interface in `types.ts`
- [x] 1.2 Add `web_app_data?: { data: string; button_text: string }` field to `TelegramMessage` interface in `types.ts`
- [x] 1.3 Update `toTelegramKeyboard()` in `services/telegram.ts` to serialize `web_app` field: `if (btn.web_app) out.web_app = btn.web_app`

## 2. Security & Routing Infrastructure

- [x] 2.1 Update `security.ts` — modify `addSecurityHeaders()` to skip `X-Frame-Options: DENY` for `/app/*` routes (or add parameter to control it)
- [x] 2.2 Create `services/telegram-auth.ts` — implement `validateInitData(initData: string, botToken: string): { valid: boolean; chatId?: string; user?: object }` using HMAC-SHA256 with Web Crypto API
- [x] 2.3 Register new routes in `index.ts`: `/app/prompts` → handlePromptEditorPage, `/api/prompt` → handlePromptApi

## 3. API Routes

- [x] 3.1 Create `routes/api-prompt.ts` with request handler that validates initData auth on all requests
- [x] 3.2 Implement GET /api/prompt — read prompt for authenticated user (uses `getPrompt()` and `getUserPromptStatus()` from Phase 2)
- [x] 3.3 Implement POST /api/prompt — save custom prompt (validates type is in USER_EDITABLE_PROMPTS, validates non-empty content, calls `saveUserPrompt()`)
- [x] 3.4 Implement DELETE /api/prompt — reset to default (calls `deleteUserPrompt()`, returns default prompt text)
- [x] 3.5 Add error handling: 400 for invalid params, 401 for auth failure, 403 for non-editable types

## 4. WebApp HTML Page

- [x] 4.1 Create `routes/app.ts` with `handlePromptEditorPage()` that returns the editor HTML as a Response with Content-Type: text/html (no X-Frame-Options)
- [x] 4.2 Build the editor HTML — structure: header, 3 tabs (Content/Edit/Repost), badge (Custom/Default), auto-resizing textarea, Save and Reset buttons, status messages
- [x] 4.3 Implement Telegram WebApp SDK integration: `Telegram.WebApp.ready()`, `expand()`, theme CSS variables, `initData` for auth headers
- [x] 4.4 Implement tab switching logic — on tab click, fetch GET /api/prompt for that type, populate textarea, update badge
- [x] 4.5 Implement Save — POST /api/prompt with textarea content, show loading/success/error states
- [x] 4.6 Implement Reset to Default — confirm dialog, DELETE /api/prompt, load default text into textarea, update badge
- [x] 4.7 Implement non-Telegram detection — if `window.Telegram.WebApp` is missing, show "Open from bot settings" message
- [x] 4.8 Style with Telegram theme CSS variables (--tg-theme-bg-color, --tg-theme-text-color, --tg-theme-button-color, etc.)

## 5. Settings Integration

- [x] 5.1 Add "📝 System Prompts" `web_app` button to `renderSettings()` in `views/settings.ts` — URL should be the worker's base URL + `/app/prompts`
- [x] 5.2 Determine how to construct the WebApp URL (worker URL needs to be available — likely from `env` or a config value, the worker URL used in webhook setup at `/setup`)

## 6. Verification

- [ ] 6.1 Test initData validation with a real Telegram WebApp session (not just unit tests)
- [ ] 6.2 Test editor in Telegram Android, iOS, and desktop clients
- [ ] 6.3 Verify Save persists to DB and subsequent loads show the custom prompt
- [ ] 6.4 Verify Reset to Default deletes custom and loads default text
- [ ] 6.5 Verify tab switching works without data loss (unsaved changes warning would be nice but not required)
- [ ] 6.6 Verify theme follows Telegram dark/light mode
- [ ] 6.7 Verify X-Frame-Options is NOT present on /app/* routes but IS present on other routes
