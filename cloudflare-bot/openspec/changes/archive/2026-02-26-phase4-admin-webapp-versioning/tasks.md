## 1. Stale Prompt Detection

- [x] 1.1 Implement `countStalePrompts(env, chatId)` in `services/prompts.ts` — SQL JOIN of `user_prompts` with `default_prompts` counting rows where `based_on_version < version`
- [x] 1.2 Implement `acknowledgeStalePrompt(env, chatId, type, lang)` in `services/prompts.ts` — updates `user_prompts.based_on_version` to current default version without changing content

## 2. User-Facing Stale Notification

- [x] 2.1 Update `renderSettings()` in `views/settings.ts` to accept a `staleCount` parameter and append 🔔 to the System Prompts button label when staleCount > 0
- [x] 2.2 Update the caller of `renderSettings()` to pre-compute staleCount via `countStalePrompts(env, chatId)` and pass it in
- [x] 2.3 Add `GET /api/prompt/stale-count` endpoint in `routes/api-prompt.ts` — returns `{ count: N }` for the authenticated user
- [x] 2.4 Add `POST /api/prompt/acknowledge` endpoint in `routes/api-prompt.ts` — calls `acknowledgeStalePrompt()`, returns `{ success: true }`

## 3. User Editor Stale Warning UI

- [x] 3.1 Update user editor HTML (`routes/app.ts`) — when API returns `isStale: true` for a tab, show warning banner above textarea: "New default available" with [View Default] [Update to New] [Keep Mine]
- [x] 3.2 Implement [View Default] — fetch default prompt text (GET /api/prompt with `?default=true` param or separate endpoint), show in read-only overlay
- [x] 3.3 Implement [Update to New] — replace textarea with default text, auto-save via POST /api/prompt, update badge to "Default"
- [x] 3.4 Implement [Keep Mine] — call POST /api/prompt/acknowledge, dismiss banner, keep textarea unchanged

## 4. Admin API Routes

- [x] 4.1 Add admin middleware/check function that validates `isAdmin(chatId, env)` for `/api/admin/*` routes, returns 403 if not admin
- [x] 4.2 Implement `GET /api/admin/prompt?type=<type>&lang=<lang>` — same as user GET but accepts all 7 prompt types
- [x] 4.3 Implement `POST /api/admin/prompt` — save admin personal prompt for any of the 7 types (saves to user_prompts for admin's chatId)
- [x] 4.4 Implement `POST /api/admin/prompt/push` — validate admin, update `default_prompts` content + bump version, also save admin's personal user_prompts, return `{ success: true, newVersion: N }`
- [x] 4.5 Register all admin routes in `index.ts`

## 5. Admin Editor HTML Page

- [x] 5.1 Create `routes/app-admin.ts` with `handleAdminPromptEditorPage()` returning admin editor HTML
- [x] 5.2 Build admin editor HTML — 7 tabs (Content, Edit, Repost, Video, Overview, Persona, Scoring), language toggle (EN 🇺🇸 / HE 🇮🇱), textarea, two save buttons
- [x] 5.3 Implement tab switching — fetch GET /api/admin/prompt for selected type + language, populate textarea
- [x] 5.4 Implement language toggle — switching reloads current tab's prompt in the new language
- [x] 5.5 Implement [Save] button — POST /api/admin/prompt (personal save only), show success confirmation
- [x] 5.6 Implement [Save & Push to Users] button — confirmation dialog ("This will become the new default..."), then POST /api/admin/prompt/push, show success with new version number
- [x] 5.7 Style with Telegram theme CSS variables, same as user editor
- [x] 5.8 Implement non-admin error state — if API returns 403, show "Admin access required" message
- [x] 5.9 Register `/app/admin-prompts` route in `index.ts` (with X-Frame-Options excluded)

## 6. Settings Integration

- [x] 6.1 Add admin "📝 System Prompts (Admin)" web_app button to `renderSettings()` — only shown when `isAdmin(chatId, env)`, opens `/app/admin-prompts`
- [x] 6.2 Update the settings rendering flow to call `isAdmin()` and conditionally include the admin button

## 7. Verification

- [x] 7.1 Test admin editor: all 7 tabs load correctly, language toggle switches between en/he
- [x] 7.2 Test admin [Save] — verify it only saves to admin's user_prompts, not default_prompts
- [x] 7.3 Test admin [Save & Push] — verify default_prompts version bumps, content updates, and admin's user_prompts also updates
- [x] 7.4 Test stale detection — after admin push, verify user's Settings shows 🔔 badge
- [x] 7.5 Test user editor stale flow — [View Default], [Update to New], [Keep Mine] all work correctly
- [x] 7.6 Test [Keep Mine] suppresses the warning — revisiting the tab no longer shows the stale banner
- [x] 7.7 Test non-admin cannot access /api/admin/* routes (returns 403)
- [x] 7.8 Test non-admin opening /app/admin-prompts directly shows error message
