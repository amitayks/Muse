## Context

The bot uses GitHub's Search API to find commits by SHA. The search needs to be scoped to the user's repos to avoid returning unrelated commits from public repos with colliding short SHAs. Currently, scoping relies on a global `GITHUB_OWNER` env var which is commented out since the bot became multi-user. The `/user` endpoint is already called during token validation but the response (containing `login`) is discarded.

## Goals / Non-Goals

**Goals:**
- Store GitHub username per-user when they connect their token
- Use stored username to scope commit search to user's repos
- Follow existing patterns (`own_username_x` precedent, env hydration via `user-keys.ts`)

**Non-Goals:**
- Backfill existing users (only one user, will repopulate via settings)
- Support org-scoped search (user-level scoping is sufficient for now)
- Change the GitHub Search API approach (author: + user: qualifiers work when username is available)

## Decisions

### 1. Store `github_username` on users table

**Choice**: New column `github_username TEXT` on `users` table, populated from `GET /user` response `login` field.

**Why**: Follows the `own_username_x` pattern already established. Avoids an extra API call at search time. Username is stable (GitHub login rarely changes).

**Alternative**: Call `GET /user` at search time to get login dynamically. Rejected because it adds latency to every commit search and wastes an API call for data we already have.

### 2. Hydrate via env.GITHUB_OWNER

**Choice**: In `user-keys.ts`, read `github_username` from user record and set `env.GITHUB_OWNER`.

**Why**: `GITHUB_OWNER` already exists in the `Env` type and is already used by `findCommitBysha`. No function signature changes needed. Consistent with how all other per-user values flow through env.

**Note**: `getUserKeys` currently only reads encrypted key columns. We need to either: (a) read `github_username` separately in `hydrateEnv`, or (b) add it to the `getUserEncryptedKeys` query. Option (a) is cleaner since it's not an encrypted field.

### 3. Remove unscoped fallback completely

**Choice**: If `GITHUB_OWNER` is not set (user hasn't connected GitHub), throw `GitHubTokenMissingError`. If scoped search returns nothing, return null (commit not found in user's repos). Never fall back to unscoped search.

**Why**: The unscoped fallback was the root cause of the bug. There's no safe way to use it without risking cross-user commit leakage.

## Risks / Trade-offs

- **Username staleness**: If a user changes their GitHub login, stored username becomes stale. Mitigation: low risk (very rare), and re-saving the token in settings will refresh it.
- **Org repos may not match**: `author:` qualifier matches commits authored by the user. `user:` qualifier matches repos owned by the user. Commits in org repos where the user is a contributor may only match `author:`. Current two-step search (author: first, then user:) handles this.
