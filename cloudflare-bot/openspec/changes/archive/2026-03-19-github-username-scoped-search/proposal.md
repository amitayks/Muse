## Why

Commit SHA search via GitHub's Search API returns commits from random public repos when short SHAs collide. The scoped search relies on `GITHUB_OWNER` which is a global worker env var, now commented out since the bot is multi-user. Each user needs their own GitHub username stored so commit searches are scoped to their repos only.

## What Changes

- Store GitHub username (`login`) when user connects their GitHub token (onboarding + settings)
- Add `github_username` column to `users` table
- Hydrate `env.GITHUB_OWNER` per-user from stored `github_username` during env hydration
- Remove the unscoped search fallback in `findCommitBysha` (already partially done)
- Add DB migration for the new column

## Capabilities

### New Capabilities

_(none — this extends existing capabilities)_

### Modified Capabilities

- `github-integration`: Commit search scoped per-user via stored GitHub username instead of global GITHUB_OWNER
- `user-onboarding`: GitHub token step now extracts and stores username from GET /user response
- `user-key-resolution`: Env hydration populates GITHUB_OWNER from user's stored github_username

## Impact

- **DB**: New column `github_username TEXT` on `users` table
- **Files**: `integrations/github.ts`, `commands/onboarding.ts`, `inputs/settings-key.ts`, `data/user-keys.ts`, `data/user-db.ts`, `types.ts`, `routes/migrate.ts`
- **No backfill needed**: Only one user currently, will populate on next token update via settings
