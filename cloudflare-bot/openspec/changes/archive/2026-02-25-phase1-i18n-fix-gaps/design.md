## Context

Phase1-i18n-system built the full infrastructure: string registry (`en.ts`/`he.ts`), `t(lang, key)` resolver, `Lang` type, `lang` parameter on all view functions and UI components, language picker in settings, and DB migration for `user.language`. Views correctly use `t()` for all strings. However, the callers of these views — action files, input handlers, handler fallback paths, and notification senders — were not updated to pass `lang` through, causing Hebrew users to see English on most screens after one navigation step.

## Goals / Non-Goals

**Goals:**
- Every render function call across the codebase passes the user's `lang`
- Every inline ViewResult in action files uses `t()` for user-facing text
- Input handler pipeline carries `lang` from message handler through to render calls
- Cron and webhook notifications respect user language preference
- Zero hardcoded English strings remain in any user-facing code path

**Non-Goals:**
- Adding new languages beyond en/he
- Translating Telegram bot command descriptions (these are set globally, not per-user)
- Translating HeyGen emotion names or API values (these are external system values)
- Restructuring the i18n system itself

## Decisions

### 1. Pass `lang` via `ctx.lang` in all action handlers

All action handlers already receive `ctx: HandlerContext` which includes `lang?: Lang`. The fix is mechanical: append `(ctx.lang || 'en') as Lang` to every render call. This is consistent with the pattern already established in `view-change.ts`.

### 2. Add `lang` to input handler context

The `InputHandler` type in the message handler needs `lang` added to its call signature. The message handler already has `lang` from `getUserLanguage()` — it just needs to pass it through at line 149.

### 3. New string keys organized under existing domains

Action-specific strings will be added under existing domains in `en.ts`/`he.ts`:
- `drafts.*` for draft action text (edit prompt, delete confirm, schedule day picker)
- `accounts.*` for account action text (deleted, follow prompts)
- `repos.*` for repo action text (deleted)
- `repost.*` for repost follow text
- `common.*` for shared text (day names, month names, today/tomorrow)
- `notifications.*` (new domain) for cron and webhook notification text

### 4. Cron handler fetches lang per-user

`cron.ts` will call `getUserLanguage(env, chatId)` once per user processing cycle, then pass it to notification text builders. This adds one DB query per user per cron cycle — negligible overhead.

## Risks / Trade-offs

- **Large number of mechanical edits (~100+ call sites)**: Risk of missing one → Mitigated by systematic file-by-file approach and grep verification after
- **New string keys need Hebrew translations**: Mitigated by adding English keys first, then filling Hebrew — English fallback ensures no broken UI
- **Cron extra DB query per user**: Negligible — one SELECT per user per 15-min cycle
