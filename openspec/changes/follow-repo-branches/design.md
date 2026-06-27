## Context

A followed repo's watched branches live in `RepoConfig.branches: string[]`, stored as a JSON blob in `repos.config` (D1). The watch pipeline already honors it end-to-end:

- The GitHub webhook is registered per-repo for `['push', 'pull_request']` — it is **branch-agnostic** and fires for every branch.
- `handlers/github-webhook.ts` already drops events whose branch is not in `config.branches` (push: parsed from `ref`; PR: `pull_request.base.ref`).

So "follow another branch" is, mechanically, a config edit — no schema change, no webhook re-registration. What is missing is purely (a) a UI to edit the set, (b) server-side existence verification before saving, and (c) seeding the *correct* default branch on first follow instead of the literal `'main'`.

Two pre-existing gaps surfaced during exploration and are folded in because the feature is meaningless without them:

1. `validateRepo` discards GitHub's `default_branch`, so both add paths hard-code `branches: ['main']`. Repos defaulting to `master`/`trunk`/`develop` silently watch nothing.
2. The webapp `POST /api/v1/repos` neither validates the repo nor creates the webhook — though both `webapp-api` and `webapp-repos` specs already require it. Webapp-added repos therefore receive no events at all, so no branch config would ever take effect for them.

Constraints: Cloudflare Workers + D1; TypeScript strict; native `@telegram-apps/telegram-ui` components in the webapp; GitHub is accessed with the **user's** token (decrypted from D1 via `hydrateEnv`, scoped to the user's `github_username`) — there is no worker-level `GITHUB_TOKEN`.

## Goals / Non-Goals

**Goals:**
- Let a user add/remove watched branches per repo from the webapp repo detail page.
- Verify a branch exists on GitHub before persisting it; reject non-existent branches with a clear error.
- Seed the repo's real default branch when a repo is first followed (both add paths).
- Make webapp repo-add actually validate + create the webhook (spec parity), so branch-following works for webapp-added repos.
- No DB migration; no breaking change to existing stored configs.

**Non-Goals:**
- Branch-management UI in the Telegram bot (the bot keeps showing its branch set; only the shared `validateRepo`/default-branch seeding is fixed there). A future change can add bot chips.
- Branch autocomplete / listing all branches (user types the exact name; we verify it).
- Wildcard/glob branch patterns (e.g. `release/*`). Exact names only, matching the webhook's exact `.includes()` check.
- Per-branch differing config (PR vs push toggles are still repo-wide).

## Decisions

### Decision 1: Dedicated, server-authoritative branch endpoints (not generic PUT)
Add: `POST /api/v1/repos/:id/branches { branch }`. Remove: `DELETE /api/v1/repos/:id/branches?branch=<urlencoded>`. Both mutate `config.branches` server-side and return the full updated config.

- **Why:** Existence verification *must* happen server-side (the GitHub token lives on the Worker), so add cannot be a pure client-side config merge. Making both add and remove server-authoritative — each returning the canonical config — also closes a **stale-config race**: the existing watch-PRs/pushes toggles `PUT /repos/:id` with the *client's* full config object; if the client added a branch but its cache were stale, a later toggle could clobber it. By returning the updated config from the branch endpoints and having the client refresh its cache, the client always toggles against fresh state.
- **Branch in body (add) / query (remove):** branch names can contain `/` (e.g. `feature/x`), which is awkward in a path segment. Body for add, `?branch=` (via `encodeURIComponent`) for remove avoids path-encoding pitfalls.
- **Alternatives considered:** (a) Verify endpoint + reuse generic PUT — two round-trips and reintroduces the stale-config race. (b) Removal via PUT only — inconsistent with add and still races. Rejected.

### Decision 2: `validateBranch` via the single-branch GET, authenticated with the user's token
`validateBranch(env, owner, repo, branch)` calls `GET /repos/{owner}/{repo}/branches/{branch}` → `200` returns the canonical `name`; `404` returns null; other statuses throw/log and surface a generic error.

- **Why this endpoint:** O(1) existence check, no pagination, and it returns GitHub's canonical branch name so we store the exact case. Git branch names are case-sensitive and the webhook match is exact `config.branches.includes(branch)` — storing the canonical name keeps detection correct.
- **Slash handling:** pass the branch in the path without encoding the `/` (GitHub matches greedily) — verified against the live endpoint (`keisar/v2` resolved 200).

### Decision 2a: All GitHub calls authenticate with the **user's** token via `hydrateEnv` (no worker-level token)
This project has **no worker-level `GITHUB_TOKEN`** — GitHub credentials are per-user, stored encrypted in D1 and decrypted into the env by `hydrateEnv(env, chatId)` (which also sets `GITHUB_OWNER` from the user's `github_username`). Therefore every webapp endpoint that touches GitHub — `addRepo` (validateRepo + createWebhook), `addBranch` (validateBranch), and repo `search` (searchOwnerRepos) — MUST call `hydrateEnv` first and pass the hydrated env, exactly like the existing `recent-prs` / `bootstrap-overview` handlers. Endpoints additionally guard `if (!userEnv.GITHUB_TOKEN)` and return a clear "connect your GitHub account" message.

- **Why this is called out:** the raw `ApiContext.env` has `GITHUB_TOKEN: undefined`. Passing it to a GitHub helper yields `Authorization: token undefined` → HTTP 401, which surfaces to the user as a misleading "branch not found" / empty search. This was the actual failure mode caught in testing; the helpers themselves were correct.
- **Alternative rejected:** a single worker-level token — contradicts the per-user key architecture (`wrangler.toml`: GitHub keys live in D1, not Worker secrets) and would break multi-user isolation.

### Decision 3: Extend `validateRepo` to return `default_branch`; seed it on add
`validateRepo` already fetches the full repo object (which includes `default_branch`); it currently returns only `{ owner, name }`. Extend to `{ owner, name, default_branch }`. Both `POST /api/v1/repos` and `inputs/add-repo.ts` seed `branches: [default_branch]`.

- **Why:** fixes the silent-drop bug at the source for both paths with one shared change. `DEFAULT_REPO_CONFIG.branches = ['main']` remains only as a last-resort fallback if `default_branch` is somehow absent.
- **Alternative:** a separate `getDefaultBranch` call — rejected as a redundant API round-trip when `validateRepo` already has the data.

### Decision 4: UI — removable chips + inline verified add (mirror ReposPage)
The "Branches" row becomes: one chip per branch with an `×`, plus a `+` that reveals an inline `Input` (the `@telegram-apps/telegram-ui` `Input`, same primitive the repos search bar uses — the native `popup()` is buttons-only and cannot take text). Add flow shows `verifying… → added ✓` or `not found`. Remove is immediate (no modal; re-adding is cheap and verified). Removing the last branch is allowed and leaves `branches: []`.

- **Why:** consistent with the existing add-repo "type → act" pattern; chips make the set legible and individually removable; inline states give the verification feedback the user asked for.
- **Cache:** after add/remove, update the React Query repo cache from the endpoint's returned config (or invalidate `['repos', id]`) so toggles and the chip list stay consistent.

### Decision 5: Idempotent add, honest empty state
Adding a branch already in the set is a no-op success returning the current config (client may surface "already added"). With `branches: []`, push/PR events match nothing — the UI signals this (e.g. an empty-branches hint) rather than special-casing a minimum.

## Risks / Trade-offs

- **[Empty branch set looks like "broken watching".]** → The detail page shows an explicit hint when `branches: []` (nothing will be detected until a branch is added); pause/resume and PR/push toggles remain independent and visible.
- **[Webhook-creation change touches the add path used in production.]** → It only *adds* the validate + `createWebhook` steps already promised by the spec; on webhook-create failure the repo is still created and the UI reports the webhook status (same pattern as the Telegram path), so adds never hard-fail.
- **[Branch deleted on GitHub after being followed.]** → Out of scope to auto-prune; the stored branch simply stops matching. Acceptable; user can remove the chip.
- **[Case / slash mismatches.]** → Mitigated by storing GitHub's canonical `name` from `validateBranch` and not lower-casing; webhook match stays exact.
- **[Extra GitHub calls / rate limits.]** → One call per branch-add and the (already-intended) validate+webhook on repo-add; negligible against existing usage, against the user's own token budget.
- **[Forgetting to `hydrateEnv` on a GitHub-touching endpoint.]** → Yields `Authorization: token undefined` → 401, surfaced as a misleading "not found". Mitigation: the explicit `if (!userEnv.GITHUB_TOKEN)` guard returns a clear message, and Decision 2a documents the requirement.

## Migration Plan

- No DB migration. Deploy is additive: existing repos keep their stored `branches`; existing single-branch behavior is unchanged.
- Rollback: revert the Worker + webapp deploys; stored configs remain valid (extra branches simply continue to be honored by the unchanged webhook filter, or are ignored if the handler is reverted — no corruption).

## Open Questions

- None blocking. (Possible follow-ups: branch autocomplete from `GET /branches`, wildcard patterns, and bot-side branch chips — all deferred.)
