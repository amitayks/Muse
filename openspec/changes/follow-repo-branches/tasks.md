## 1. GitHub integration helpers (`cloudflare-bot/src/integrations/github.ts`)

- [x] 1.1 Extend `validateRepo` to also read `default_branch` from the GitHub repo object and return `{ owner, name, default_branch }` (update its return type and all call sites).
- [x] 1.2 Add `validateBranch(env, owner, repo, branch)` using `GET /repos/{owner}/{repo}/branches/{branch}`, authenticating with the env's `GITHUB_TOKEN` (the user's token via `hydrateEnv` — no worker-level token): return the canonical branch `name` on HTTP 200, `null` on 404, and handle other statuses gracefully without leaking the token. Ensure slash-containing branch names match (do not break on `/`).

## 2. Repo add paths — seed default branch (`cloudflare-bot`)

- [x] 2.1 In `src/inputs/add-repo.ts`, seed `config.branches` from `validateRepo(...).default_branch` instead of the literal `['main']` (fall back to `'main'` only if absent).
- [x] 2.2 Keep `DEFAULT_REPO_CONFIG.branches = ['main']` in `src/types.ts` as the documented last-resort fallback only (add a comment noting add paths override it).

## 3. Repos API — branch endpoints & POST parity (`cloudflare-bot/src/routes/api-v1-repos.ts`)

- [x] 3.1 Fix `POST /api/v1/repos`: call `validateRepo` (404/error → error response, no row), seed `config.branches` with the returned `default_branch`, and create the GitHub webhook (reuse `integrations/webhook.createWebhook` + persist `webhook_id`, mirroring `inputs/add-repo.ts`); report webhook status without hard-failing the add.
- [x] 3.2 Add `POST /api/v1/repos/:id/branches`: verify ownership via `getRepo`, 400 on empty `branch`, call `validateBranch` (404 → HTTP 422 `{ error }`), append the canonical name to `config.branches` idempotently, persist via `updateRepo`, and return `{ success: true, config }`.
- [x] 3.3 Add `DELETE /api/v1/repos/:id/branches?branch=<urlencoded>`: verify ownership, remove the branch from `config.branches` (no-op if absent, allow empty result), persist, and return `{ success: true, config }`.
- [x] 3.4 Ensure both new routes are matched by the existing `/repos/:id/(.+)` path parsing and dispatch before the generic handlers.
- [x] 3.5 Authenticate all GitHub calls with the user's token: `addRepo`, `addBranch`, and the existing `searchRepos` SHALL `hydrateEnv(env, chatId)` and pass the hydrated env to `validateRepo`/`createWebhook`/`validateBranch`/`searchOwnerRepos` (the raw `env` has `GITHUB_TOKEN` undefined → 401). Add an `if (!userEnv.GITHUB_TOKEN)` guard returning a "connect your GitHub account" message.

## 4. Webapp UI — branch chips (`webapp/src/pages/RepoDetailPage.tsx`)

- [x] 4.1 Replace the read-only branches `Caption` with a chip list: one chip per `config.branches` entry, each with a remove (`×`) control, plus a `+` affordance.
- [x] 4.2 Add the inline add input (`Input` from `@telegram-apps/telegram-ui`) revealed by `+`, with an Add action and `verifying… / not found / added ✓` states; trim input and ignore empty.
- [x] 4.3 Wire an add mutation to `POST /api/v1/repos/:id/branches`; on 422 show the "branch not found" message; on success update the cached repo config from the response (or invalidate `['repos', id]`).
- [x] 4.4 Wire a remove mutation to `DELETE /api/v1/repos/:id/branches?branch=<encoded>`; update cache from the response. Allow removing the last branch.
- [x] 4.5 When `config.branches` is empty, show a hint that no branches are watched (push/PR events won't be detected until one is added).
- [x] 4.6 Add chip/input styling (RepoDetailPage CSS module) consistent with native components.

## 5. i18n (`webapp/src/i18n/en.ts`, `webapp/src/i18n/he.ts`)

- [x] 5.1 Add strings for: add-branch placeholder, Add button, verifying, branch-not-found, already-followed, and the empty-branches hint — in both `en` and `he`.

## 6. Verification

- [ ] 6.1 Add a repo whose GitHub default branch is not `main` (e.g. `master`); confirm the seeded chip is the real default branch and that a push to it is detected.
- [ ] 6.2 Add an existing branch via the UI → chip appears; add a non-existent branch → "branch not found", no chip; add a duplicate → no duplicate.
- [ ] 6.3 Remove a branch (including the last one) → chip disappears, empty-state hint shows; re-add works.
- [ ] 6.4 Confirm a webapp-added repo now has a GitHub webhook and that toggling Watch-PRs/Pushes after a branch edit does not clobber the branch set (no stale-config race).
- [x] 6.5 `openspec validate follow-repo-branches --strict` passes.
