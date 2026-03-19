## Why

Phase 3 gave regular users the ability to edit their 3 creative prompts via a WebApp. But the admin (bot maintainer) needs broader capabilities: editing all 7 prompt types, managing both en/he language variants, pushing updates as new global defaults, and notifying users with stale custom prompts.

Currently the admin would need to deploy code to change any system prompt. With this phase, the admin can iterate on all prompts in real-time from within Telegram, test changes privately before pushing to users, and track which users have outdated custom prompts.

**Depends on Phase 3** (user WebApp editor + API) — the infrastructure (initData auth, API routes, WebApp button support, X-Frame-Options fix) is already in place.

## What Changes

- Create `/app/admin-prompts` route serving a separate admin prompt editor HTML page (distinct from user editor)
- Admin editor shows all 7 prompt types (not just 3 creative ones)
- Admin editor shows both EN and HE language variants with a language toggle
- Implement dual-save: [Save] (personal only) vs [Save & Push to Users] (updates global default + bumps version)
- Add silent update notification in Settings: "🔔 System Prompts (update available)" badge when user has stale custom prompts
- Add "View Changes / Update / Keep Mine" flow when user opens their stale prompt in the editor
- Add admin check to protect admin-only routes and prompt types
- Add "System Prompts" admin button (for all 7 prompts) separate from user button (for 3)

## Capabilities

### New Capabilities
- `admin-prompt-editor`: Admin-only WebApp for editing all 7 system prompt types in both languages with push-to-users functionality
- `prompt-update-notifications`: Silent notification system for users with stale custom prompts when admin pushes new defaults

### Modified Capabilities
- `webapp-api`: Add admin-specific API endpoints for push-to-users and multi-language access
- `user-settings`: Show update-available indicator when user has stale prompts
- `webapp-prompt-editor`: Show stale prompt warning with update/keep options

## Impact

- **New files**: `routes/app-admin.ts` (admin editor HTML page)
- **Modified files**: `routes/api-prompt.ts` (admin endpoints + push logic), `views/settings.ts` (stale badge), `routes/app.ts` (stale prompt UI in user editor)
- **No new DB tables** (uses existing `default_prompts` and `user_prompts` from Phase 2)
- **Admin detection**: Uses existing `isAdmin()` function from the codebase

---

### Additional Context from Exploration

**Admin detection**: The codebase already has an `isAdmin(chatId, env)` function used for Video Studio access control. This same function gates the admin prompt editor.

**Admin vs User editor differences**:

| Feature | User Editor (/app/prompts) | Admin Editor (/app/admin-prompts) |
|---------|---------------------------|-----------------------------------|
| Prompt types | 3 (content, edit, repost) | All 7 |
| Language toggle | Auto (from user setting) | Manual EN/HE toggle |
| Save | Saves to user_prompts | Saves to user_prompts (personal) |
| Save & Push | N/A | Updates default_prompts + bumps version |
| Stale warning | Shows when own prompt is stale | N/A (admin is the source of truth) |

**Why separate HTML pages** (not a query param):
1. Admin page has fundamentally different UI (7 tabs, language toggle, push button)
2. Isolates permissions — a regular user can't accidentally access admin features by URL manipulation
3. Admin page can evolve independently (e.g., add playground, diff view, usage stats) without affecting users
4. Even if someone finds the admin URL, the API validates `isAdmin()` server-side

**Push flow in detail**:
```
Admin clicks [Save & Push to Users]
│
├── API: POST /api/admin/prompt/push { type, lang, content }
│
├── Server validates isAdmin(chatId)
├── Updates default_prompts SET content=?, version=version+1
├── Saves admin's personal user_prompts too (same content)
│
├── Returns { success: true, newVersion: N }
│
└── All users with user_prompts for this type/lang where
    based_on_version < new version are now "stale"
    (No notification sent — detected on next settings view)
```

**Stale detection in Settings**:
```typescript
// In renderSettings():
const staleCount = await countStalePrompts(env, chatId);
// If staleCount > 0:
//   Show: "📝 System Prompts 🔔" (with notification badge)
// Else:
//   Show: "📝 System Prompts"
```

**Stale prompt flow in user editor**:
```
User opens editor → tab shows stale prompt → banner appears:
┌──────────────────────────────────────────────┐
│ ⚠️ A new default version is available.       │
│ [View Default] [Update to New] [Keep Mine]   │
└──────────────────────────────────────────────┘

- View Default: shows the current default in a read-only view
- Update to New: replaces user's content with default, saves
- Keep Mine: dismisses banner, keeps user's version
  (optionally updates based_on_version to suppress future warnings)
```

**countStalePrompts helper** (needed for Settings badge):
```typescript
async function countStalePrompts(env: Env, chatId: string): Promise<number> {
  // COUNT user_prompts WHERE chat_id=? AND based_on_version < (SELECT version FROM default_prompts WHERE prompt_type=user_prompts.prompt_type AND language=user_prompts.language)
}
```

**API routes after this phase**:
```
// Existing from Phase 3:
GET  /api/prompt?type=content&lang=en     — read prompt (user or default)
POST /api/prompt                          — save user custom prompt
DELETE /api/prompt?type=content&lang=en   — reset to default

// New in Phase 4:
POST /api/admin/prompt/push               — save as default + bump version (admin only)
GET  /api/admin/prompt?type=persona&lang=he — read ANY prompt type (admin only)
POST /api/admin/prompt                    — save admin custom for ANY type (admin only)
GET  /api/prompt/stale-count              — return count of stale prompts for user
```
