## 1. Fix lang Propagation in Handlers & Core

- [x] 1.1 Fix `handlers/message.ts` — pass `lang` to input handlers at line 149, to `renderHome` at line 177, and to `renderError` at line 183
- [x] 1.2 Fix `handlers/callback.ts` — pass `lang` to `renderError` in catch block at line 87
- [x] 1.3 Fix `core/router.ts` — pass `ctx.lang` to `renderHome` at line 144 and `renderRepoDetail` at line 155

## 2. Fix lang in Action Files (render calls)

- [x] 2.1 Fix `actions/pagination.ts` — pass lang to `renderReposList`, `renderAccountsList`, `renderDraftsList`
- [x] 2.2 Fix `actions/account-actions.ts` — pass lang to `renderAddAccount`, `renderAccountDetail` (x3), `renderDeleteAccountConfirm`, `renderError`
- [x] 2.3 Fix `actions/account-config.ts` — pass lang to `renderError`, `renderAccountDetail`
- [x] 2.4 Fix `actions/repo-actions.ts` — pass lang to `renderAddRepo`, `renderRepoDetail` (x2), `renderDeleteRepoConfirm`, `renderError`
- [x] 2.5 Fix `actions/config-toggle.ts` — pass lang to all `renderError` calls and `renderRepoDetail`
- [x] 2.6 Fix `actions/compose.ts` — pass lang to `renderHome` (x3), `renderCompose`
- [x] 2.7 Fix `actions/approve.ts` — pass lang to `renderDraftDetail`
- [x] 2.8 Fix `actions/draft-detail.ts` — pass lang to `renderError`
- [x] 2.9 Fix `actions/delete-draft.ts` — pass lang to `renderError` (x4), `renderDraftCategories`
- [x] 2.10 Fix `actions/publish.ts` — pass lang to `renderError` (x2), `renderDraftDetail`, `renderSuccess`
- [x] 2.11 Fix `actions/publish-all.ts` — pass lang to `renderError`, `renderSuccess`
- [x] 2.12 Fix `actions/unschedule.ts` — pass lang to `renderSuccess`
- [x] 2.13 Fix `actions/list-actions.ts` — pass lang to all `renderError` calls
- [x] 2.14 Fix `actions/tweet-generate.ts` — pass lang to all `renderError` calls

## 3. Fix lang in Input Handlers

- [x] 3.1 Fix `inputs/handwrite.ts` — pass lang to `renderCompose` (already done)
- [x] 3.2 Fix `inputs/commit-sha.ts` — pass lang to `renderGenerating` (already done)
- [x] 3.3 Fix `inputs/edit-draft.ts` — pass lang to `renderError` (already done)
- [x] 3.4 Fix `inputs/add-repo.ts` — pass lang to `renderError` (already done)
- [x] 3.5 Fix `inputs/delete.ts` — pass lang to `renderError` (already done)

## 4. Add New String Keys & Replace Hardcoded English in Actions

- [x] 4.1 Add string keys to `en.ts`/`he.ts` and replace hardcoded English in `config-toggle.ts`, `inputs/add-repo.ts`, `inputs/edit-draft.ts`, `inputs/settings-key.ts`
- [x] 4.2 i18n `actions/schedule.ts` — add `lang` to `renderScheduleDayPicker`, translate day names, "Today"/"Tomorrow", title, and cancel button
- [x] 4.3 i18n `handlers/cron.ts` — add `getUserLanguage()` per user, replace all hardcoded English in draft and video cron notifications with `t()` calls