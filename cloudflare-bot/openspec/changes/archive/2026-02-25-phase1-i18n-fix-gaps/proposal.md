## Why

The phase1-i18n-system change built the i18n infrastructure (string registry, `t()` function, `Lang` type, `lang` parameter on all view functions) but left significant gaps: ~45 render function calls in action/input/handler files don't pass `lang`, ~75 inline hardcoded English strings exist in action files, cron/webhook notifications are entirely in English, and the input handler pipeline doesn't carry `lang` at all. Users who switch to Hebrew see most screens revert to English when navigating deeper (pagination, detail views, multi-step flows).

## What Changes

- **Pass `lang` through all action files**: Every `renderError()`, `renderSuccess()`, `renderHome()`, `renderDraftsList()`, `renderAccountDetail()`, `renderRepoDetail()`, and similar call in `actions/*.ts` will receive `(ctx.lang || 'en') as Lang`
- **Pass `lang` through input handler pipeline**: `message.ts` line 149 will include `lang` in the input handler context; all input files will use it
- **Fix handler fallback paths**: `message.ts` lines 177/183, `callback.ts` line 87, `router.ts` lines 144/155 will pass `lang`
- **Replace hardcoded English in action files**: Inline ViewResult objects in `edit.ts`, `schedule.ts`, `repo-actions.ts`, `account-actions.ts`, `repost-follow.ts`, `batch-page.ts`, `tweet-generate.ts`, `settings-keys.ts`, `list-actions.ts` will use `t()` calls with new string keys
- **Internationalize cron/webhook notifications**: Add `getUserLanguage()` lookups and replace hardcoded English in `cron.ts` and `github-webhook.ts` `sendNotification()`
- **Add missing string keys**: New keys in `en.ts`/`he.ts` for action-specific, notification, and schedule-related text

## Capabilities

### New Capabilities

_(none — this is completing the existing i18n system, not introducing new capabilities)_

### Modified Capabilities

_(no spec-level requirement changes — this is implementation gap-filling for the existing i18n design)_

## Impact

- **Actions** (~18 files): All action handlers in `src/actions/` that call render functions or build inline ViewResult
- **Inputs** (~10 files): All input handlers in `src/inputs/` need `lang` from context
- **Handlers**: `message.ts`, `callback.ts`, `cron.ts`, `github-webhook.ts`
- **Core**: `router.ts` fallback paths
- **Strings**: `en.ts` and `he.ts` gain ~60 new keys for action/notification text
