## Context

Phase 3 established the WebApp infrastructure: initData auth, API routes, InlineButton web_app support, and the user prompt editor. Phase 4 builds the admin layer on top. All DB tables and service functions exist from Phase 2. The `isAdmin()` function exists in the codebase for Video Studio access control.

## Goals / Non-Goals

**Goals:**
- Admin can edit all 7 prompt types from Telegram (no code deploys for prompt changes)
- Admin can work in both EN and HE with a language toggle
- Admin can test prompts personally before pushing to all users
- Users with stale custom prompts see a non-intrusive notification in Settings
- Users can view the new default and choose to update or keep their version

**Non-Goals:**
- Active push notifications (no Telegram messages sent to users about prompt updates)
- Prompt diff view (show old vs new side-by-side) — nice-to-have for later
- Prompt rollback/version history — only current version and user's version exist
- Prompt playground (test prompt against Gemini from the editor) — future enhancement
- Prompt analytics (which users customized, usage stats) — future enhancement

## Decisions

### 1. Separate admin HTML page, not parameterized user page

The admin editor at `/app/admin-prompts` is a completely separate HTML file from the user editor at `/app/prompts`.

**Why**:
- Different tab count (7 vs 3), different button set (Save + Push vs Save)
- Language toggle in admin (absent in user editor — auto from setting)
- Admin page can evolve independently (playground, analytics)
- Security: even if URL is discovered, API validates `isAdmin()` server-side
- Clean separation of concerns in the codebase

### 2. Admin API routes prefixed with `/api/admin/`

```
POST /api/admin/prompt/push   — push as new default (admin only)
GET  /api/admin/prompt         — read ANY prompt type (admin only)
POST /api/admin/prompt         — save admin personal for ANY type (admin only)
```

All `/api/admin/*` routes validate `isAdmin(chatId, env)` after initData auth. Non-admin requests get HTTP 403.

**Why separate prefix**: Clear separation in routing. Easy to add admin-only middleware. Self-documenting URL structure.

### 3. Push flow: update default + bump version atomically

```typescript
async function pushDefaultPrompt(env: Env, type: PromptType, lang: Lang, content: string): Promise<number> {
  // Single transaction:
  // 1. UPDATE default_prompts SET content=?, version=version+1, updated_at=datetime('now')
  //    WHERE prompt_type=? AND language=?
  // 2. UPSERT admin's user_prompts with same content (admin uses their own pushed version)
  // Returns new version number
}
```

D1 supports transactions via `env.DB.batch()`. The version bump and content update happen atomically.

### 4. Silent notification via Settings badge (not push notification)

When user has stale prompts, Settings shows a badge:
```
📝 System Prompts 🔔    ← with notification indicator
```
vs normal:
```
📝 System Prompts
```

**Why not Telegram push notification**: Feels spammy. Most users don't customize prompts, so they'd get irrelevant notifications. Users who do customize will see the badge next time they visit Settings.

**Implementation**: `renderSettings()` calls `countStalePrompts(env, chatId)` — a single SQL query that JOINs `user_prompts` with `default_prompts` and counts rows where `based_on_version < version`.

### 5. Stale prompt handling in user editor

When a user opens a tab with a stale prompt, a banner appears above the textarea:

```
⚠️ New default available (v2 → v5)
[View Default] [Update to New] [Keep Mine]
```

- **View Default**: Fetches default prompt text, shows in read-only overlay
- **Update to New**: Replaces textarea with default, auto-saves, updates `based_on_version`
- **Keep Mine**: Calls API to update `based_on_version` to current version (suppress future warnings), keeps user's text

The "Keep Mine" option is important — it acknowledges the update without changing the user's prompt. This prevents the badge from reappearing for the same update.

### 6. Admin editor language toggle

Unlike the user editor (which auto-selects language from user setting), the admin editor has an explicit EN/HE toggle:

```
[Content][Edit][Repost][Video][Overview][Persona][Scoring]
[EN 🇺🇸] [HE 🇮🇱]     ← language toggle

[textarea]

[Save]  [Save & Push to Users]
```

Switching language reloads the prompt for the selected type+language. This lets admin manage both language variants without switching bot language.

## Risks / Trade-offs

**[Risk] Admin accidentally pushes an incomplete prompt** → Mitigation: The "Save & Push" button has a confirmation dialog: "This will become the new default for all users who haven't customized. Continue?"

**[Risk] `countStalePrompts()` query adds latency to Settings** → Mitigation: The query is a simple COUNT with a JOIN on two small tables. D1 handles this in sub-millisecond. Can cache if needed.

**[Risk] "Keep Mine" suppresses warnings forever** → Mitigation: It only suppresses for the current version. If admin pushes another update, the user's `based_on_version` will be stale again and the badge reappears.

**[Trade-off] No diff view between old and new default** → Accepted for now. "View Default" shows the full new default, but no side-by-side. A diff view would require a JS diff library in the WebApp HTML — can add later if users request it.

## Additional Notes

**Admin editor HTML (~300-400 lines)**:
- Same Telegram theme integration as user editor
- 7 tabs instead of 3
- Language toggle row (EN/HE buttons, highlighted active)
- Same textarea + auto-resize
- Two save buttons: [Save] and [Save & Push to Users]
- Push confirmation dialog
- No stale banner (admin is the source)

**API endpoint summary after Phase 4**:

| Route | Method | Auth | Admin? | Purpose |
|-------|--------|------|--------|---------|
| `/api/prompt` | GET | initData | No | Read user prompt (3 types) |
| `/api/prompt` | POST | initData | No | Save user custom prompt (3 types) |
| `/api/prompt` | DELETE | initData | No | Reset to default (3 types) |
| `/api/prompt/stale-count` | GET | initData | No | Count stale prompts for badge |
| `/api/prompt/acknowledge` | POST | initData | No | "Keep Mine" — update based_on_version |
| `/api/admin/prompt` | GET | initData | Yes | Read ANY prompt type + language |
| `/api/admin/prompt` | POST | initData | Yes | Save admin personal for ANY type |
| `/api/admin/prompt/push` | POST | initData | Yes | Push as new default + bump version |

**Settings view rendering (with stale check)**:
```typescript
async function renderSettings(timezone, pageSize, lang, env, chatId) {
  const staleCount = await countStalePrompts(env, chatId);
  const promptLabel = staleCount > 0
    ? t(lang, 'settings.systemPrompts') + ' 🔔'
    : t(lang, 'settings.systemPrompts');
  // ... render button with promptLabel
}
```

Note: `renderSettings()` currently doesn't accept `env` or `chatId`. This phase will need to either:
- Change its signature to accept them (breaking the current pure-function pattern)
- Or have the caller pre-compute `staleCount` and pass it in

The cleaner approach is passing `staleCount` as a parameter to keep the view function pure.
