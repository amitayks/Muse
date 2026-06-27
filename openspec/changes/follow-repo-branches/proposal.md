## Why

Followed repositories can only ever watch the single hard-coded branch `main`. Two problems fall out of this:

1. **No way to follow other branches.** Teams that ship from `develop`, `release/*`, or feature branches get zero commit/PR notifications for that work, and the webapp offers no UI to change the watched-branch set.
2. **A latent silent failure on first follow.** Both add paths seed `branches: ['main']` unconditionally. A repo whose default branch is `master` / `trunk` / `develop` is therefore added watching a branch that does not exist — every push and PR is silently dropped, with no error and no UI signal.

While wiring this up we also discovered the webapp's `POST /api/v1/repos` neither validates the repo nor creates the GitHub webhook (the `webapp-api` and `webapp-repos` specs already require both). Without a webhook, *no* branch configuration matters because no events ever arrive — so the branch feature would appear broken on any webapp-added repo. This change brings that endpoint back in line with its spec.

## What Changes

- **Webapp branch management UI.** The read-only "Branches" row on the repo detail page becomes interactive: each watched branch renders as a removable chip (`×` to unfollow), and a `+` reveals an inline text input to add a branch by name, with `verifying… / not found / added ✓` states. Removing the last branch is allowed (the repo then watches nothing on push/PR until one is re-added).
- **Server-side branch existence verification.** Adding a branch verifies it exists on GitHub before it is persisted. A non-existent branch is rejected with an actionable error and never saved.
- **New repo-branches API.** `POST /api/v1/repos/:id/branches` (verify + append, returns the updated config or 422) and `DELETE /api/v1/repos/:id/branches?branch=<name>` (remove, returns updated config). Both are server-authoritative and return the canonical config to avoid stale-config races with the existing toggle PUT.
- **Default-branch seeding on first follow.** `validateRepo` is extended to return the repo's `default_branch`; both add paths (webapp `POST /api/v1/repos` and the Telegram `inputs/add-repo` flow) seed `branches: [default_branch]` instead of the literal `'main'`.
- **Webhook parity for webapp adds.** `POST /api/v1/repos` validates repo accessibility and creates the GitHub webhook (matching the Telegram path and the existing spec text), so followed branches actually receive events.
- New `validateBranch(env, owner, repo, branch)` helper in `integrations/github.ts` using `GET /repos/{owner}/{repo}/branches/{branch}` (authenticated with the **user's** GitHub token — this project has no worker-level token; callers pass a `hydrateEnv()`-populated env — and returning the canonical case-preserving branch name).
- New webapp i18n strings (en + he) for the branch add/remove flow.

No DB migration is required — `RepoConfig.branches: string[]` already exists and the webhook handler already filters on `config.branches.includes(branch)`.

## Capabilities

### New Capabilities
<!-- None — this extends existing repo-management capabilities rather than introducing a new domain. -->

### Modified Capabilities
- `webapp-repos`: the repo detail page gains add/remove branch management (chips + inline verified add); the add-repository flow seeds the repo's actual default branch instead of `main`.
- `webapp-api`: adds the repo-branches endpoints (`POST`/`DELETE .../branches`); the `POST /api/v1/repos` requirement is tightened to validate accessibility, detect the default branch, seed it, and create the webhook.
- `github-integration`: `validateRepo` returns `default_branch`; a new branch-existence verification requirement (`validateBranch`) is added for the add-branch flow.

## Impact

- **Backend (`cloudflare-bot/`):**
  - `src/integrations/github.ts` — extend `validateRepo` return shape (`+ default_branch`); add `validateBranch`.
  - `src/routes/api-v1-repos.ts` — add `POST`/`DELETE /repos/:id/branches`; fix `POST /repos` to validate + seed default branch + create webhook.
  - `src/inputs/add-repo.ts` — seed `branches: [default_branch]` from `validateRepo`.
  - `src/types.ts` — `DEFAULT_REPO_CONFIG` retains `['main']` only as a last-resort fallback (documented).
  - No schema change; webhook handler (`handlers/github-webhook.ts`) already branch-filters and is untouched.
- **Frontend (`webapp/`):**
  - `src/pages/RepoDetailPage.tsx` — branch chips + inline add input + verify states; consume the new endpoints and refresh cached config.
  - `src/i18n/en.ts`, `src/i18n/he.ts` — new branch-management strings.
  - `src/pages/RepoDetailPage.module.css` (or equivalent) — chip / input styling.
- **External:** one extra GitHub API call per branch-add (existence check) and, for webapp adds, the repo-validate + webhook-create calls that were already supposed to happen. All GitHub calls authenticate with the **user's** token, decrypted from D1 via `hydrateEnv()` (there is no worker-level `GITHUB_TOKEN`); the repo set is scoped to the user's GitHub username (`GITHUB_OWNER`, also populated by `hydrateEnv`).
- **Compatibility:** existing repos keep their stored `branches`; no migration, no breaking change. Branch names are stored case-sensitively (git is case-sensitive and the webhook match is exact).
