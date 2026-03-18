## 1. Database & Types

- [x] 1.1 Add migration in `routes/migrate.ts`: `ALTER TABLE users ADD COLUMN github_username TEXT`
- [x] 1.2 Add `github_username: string | null` to `User` interface in `types.ts`
- [x] 1.3 Add `github_username` to the `UpdatableUserField` type union in `data/user-db.ts`

## 2. Token Entry Points

- [x] 2.1 Update `commands/onboarding.ts:handleGitHubTokenInput` — parse `GET /user` response, extract `login`, store as `github_username` via `updateUser`
- [x] 2.2 Update `inputs/settings-key.ts` (service === 'github') — parse `GET /user` response, extract `login`, store as `github_username` via `updateUser`

## 3. Env Hydration

- [x] 3.1 Update `data/user-keys.ts:hydrateEnv` — read user's `github_username` from DB and set `env.GITHUB_OWNER`

## 4. Commit Search Fix

- [x] 4.1 Update `integrations/github.ts:findCommitBysha` — remove dead `GITHUB_OWNER` comment, ensure scoped search works with per-user GITHUB_OWNER, confirm no unscoped fallback

## 5. Deploy & Verify

- [ ] 5.1 Deploy to Cloudflare Workers
- [ ] 5.2 Run migration endpoint to add column
- [ ] 5.3 Re-save GitHub token in settings to populate `github_username`
- [ ] 5.4 Test commit SHA search returns correct repo
