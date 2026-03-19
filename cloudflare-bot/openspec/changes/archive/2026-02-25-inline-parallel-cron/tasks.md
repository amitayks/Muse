## 1. Rewrite cron coordinator to inline parallel

- [x] 1.1 Add `processUserCron(env, chatId)` function to `src/handlers/cron.ts` — extracts per-user logic from `handleInternalCron` (hydrate env, poll, publish drafts, check stale videos, publish scheduled videos) into a standalone async function
- [x] 1.2 Rewrite `cronCoordinator` to use `Promise.allSettled(users.map(...))` instead of self-fetch fan-out — remove WORKER_URL/ADMIN_SECRET usage from cron path

## 2. Remove internal-cron route

- [x] 2.1 Delete `src/routes/internal-cron.ts`
- [x] 2.2 Remove `/internal/user-cron` route and `handleInternalCron` import from `src/index.ts`

## 3. Auto-resolve missing user_id in poller

- [x] 3.1 In `src/services/poller.ts` `pollUserAccounts`, when an account has no `user_id`, call `lookupUserByUsername` to resolve it, update the account, and continue polling instead of skipping

## 4. Deploy and verify

- [x] 4.1 Deploy with `npx wrangler deploy` and verify cron fires with inline execution via `npx wrangler tail`
