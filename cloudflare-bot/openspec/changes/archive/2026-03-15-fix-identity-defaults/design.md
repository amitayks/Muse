## Context

The identity-skills-rewrite change introduced a `who-am-i` prompt type that serves dual purpose: the `default_prompts` row holds the analysis skill (Gemini instructions for generating identity documents from tweets), while `user_prompts` rows hold the user's actual identity document. This overloading causes two bugs:

1. `storeDefaultIdentity()` reads `getDefaultPromptText('who-am-i', lang)` — which returns the analysis skill instructions — and stores that as the user's identity. Users could see raw Gemini prompts.
2. Identity is only stored for the current onboarding language. Switching languages causes `getPrompt` to fall through to `default_prompts('who-am-i')`, returning the analysis skill instead of a skeleton identity.

There are no existing users, so no migration of user data is needed.

## Goals / Non-Goals

**Goals:**
- Separate identity document storage from the analysis skill prompt
- Ensure users never see analysis skill instructions as their identity
- Admin-editable skeleton defaults that auto-propagate to users who haven't customized
- One-time notification when user switches to a language without analyzed identity
- Clean prompt type semantics: `who-am-i` = analysis skill, `identity` = user's document

**Non-Goals:**
- Auto-translation of identity between languages (future consideration)
- Identity evolution/feedback loop from published posts
- Changing the analysis skill content or flow
- Backward compatibility migration (no existing users)

## Decisions

### Decision 1: New `identity` prompt type for user documents

**Choice:** Add `identity` as a new prompt type. `who-am-i` remains the admin-only analysis skill. The user's identity document (whether skeleton default or analyzed) resolves through `identity`.

**DB layout:**
```
default_prompts:
  who-am-i   / en  → analysis skill instructions (admin-only)
  who-am-i   / he  → analysis skill instructions (admin-only)
  identity   / en  → "I'm a tech professional..." (skeleton default)
  identity   / he  → "אני איש טכנולוגיה ש..." (skeleton default)

user_prompts:
  (chatId) / identity / en  → analyzed or manually edited doc (only if exists)
```

**Why not keep `who-am-i` with a flag?** The dual-purpose naming caused the original bug. Clean separation eliminates confusion for code, admin dashboard, and future developers.

### Decision 2: Don't store defaults in `user_prompts`

**Choice:** When user clicks "Use default" during onboarding, do NOT create a `user_prompts` row. Let `getPrompt('identity', lang)` fall through to `default_prompts`.

**Why:** This gives admin push auto-propagation for free. When admin updates the skeleton default, all users without a `user_prompts` row automatically get the new content — no stale tracking, no batch update, no notification. The existing resolution system (`user_prompts → default_prompts → English default`) handles everything.

**Implications:**
- `storeDefaultIdentity()` is removed entirely
- "Use default" in onboarding becomes a no-op for storage
- `assembleSystemInstruction` calls `getPrompt(env, chatId, 'identity', lang)` — works for both default and analyzed users

### Decision 3: Only store `user_prompts` rows for analyzed/edited identity

**Choice:** A `user_prompts` row for `identity` is created ONLY when:
- User clicks "Analyze" during onboarding (stores analyzed doc for that language)
- User manually edits their identity in the webapp
- User clicks "Re-analyze" from settings

**Detection of analyzed vs default:** Check if `user_prompts(chatId, 'identity', lang)` row exists. No row = using default. Row exists = analyzed or manually edited. No extra columns needed for this distinction.

### Decision 4: Exclude `identity` from stale count

**Choice:** Modify `countStalePrompts` to exclude `prompt_type = 'identity'`. When admin pushes a new skeleton default:
- Users without rows → auto-updated (no action)
- Users with rows (analyzed) → `based_on_version` would be stale, but that's noise since "skeleton changed" has no meaning for someone with a custom analysis

**Alternative considered:** Track staleness separately for identity. Rejected — the semantics of "your analyzed identity is outdated because the skeleton changed" don't match the user's mental model.

### Decision 5: Language switch notification via DB flag

**Choice:** Add `identity_lang_notified TEXT DEFAULT ''` column to `users` table. Contains comma-separated language codes (e.g., `'he'` or `'en,he'`) for which the notification has been shown.

**Notification trigger (in `config:language` handler):**
1. User switches to `newLang`
2. Check: does `user_prompts(chatId, 'identity', ANY_LANG)` exist? If no → all defaults, no notification
3. Check: does `user_prompts(chatId, 'identity', newLang)` exist? If yes → has analysis, no notification
4. Check: does `identity_lang_notified` include `newLang`? If yes → already shown, no notification
5. Otherwise → send separate notification message, add `newLang` to `identity_lang_notified`

**Notification content:** Separate message with text + three buttons: `[Re-analyze]` | `[Keep default]` | `[Home]`

**Why a separate message?** Simpler than modifying the settings view. The notification is transient — it appears once and the user acts on it or dismisses it.

### Decision 6: `identity` is user-editable and admin-editable

**Choice:** Add `identity` to both `USER_EDITABLE_SKILLS` and `ADMIN_EDITABLE_SKILLS`.

- **User webapp:** Users can view and edit their identity document (4th tab alongside work-progress, refine, quote)
- **Admin dashboard:** Admin can edit the skeleton default and push to users. Also has a separate `who-am-i` entry for editing the analysis skill.

### Decision 7: Skeleton defaults as skill files, not hardcoded

**Choice:** Create `src/skills/identity-default.ts` with `IDENTITY_DEFAULT_EN` and `IDENTITY_DEFAULT_HE` exports. Seed via `getDefaultPromptTexts()` alongside other skills.

**Why not hardcode in `storeDefaultIdentity`?** The admin needs to iterate on the skeleton content through the dashboard. DB-backed defaults with version tracking enable this. The skill file provides the initial seed content.

## Risks / Trade-offs

**[Risk] Edge case: analysis flow reads wrong prompt type** → The `analyzeIdentity` function must read the analysis skill from `getDefaultPromptText(env, 'who-am-i', lang)` and store the result as `saveUserPrompt(env, chatId, 'identity', lang, doc)`. Mixing up the types would recreate the original bug. Mitigated by clear naming and the fact that `who-am-i` is never in `USER_EDITABLE_SKILLS`.

**[Risk] Notification message could feel intrusive** → It's shown only once per language direction, and only if user has analyzed in another language. Users who use defaults everywhere never see it.

**[Trade-off] No auto-translation between languages** → Accepted for v1. Users who want identity in both languages must analyze twice or manually edit. The notification guides them to do this.

**[Trade-off] `countStalePrompts` exclusion means analyzed users never know about identity skeleton updates** → Accepted. The skeleton default is irrelevant to users with custom analysis. If we later want to notify analyzed users about analysis skill improvements, that would be a separate system.
