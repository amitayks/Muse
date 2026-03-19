## Context

The cron handler currently uses a coordinator → self-fetch fan-out pattern. `cronCoordinator` queries D1 for users with pending work, then fires `fetch(WORKER_URL/internal/user-cron)` for each user. This architecture was designed for horizontal scaling but introduces unreliable network hops. The old twitter-poller worker used direct inline execution and worked reliably.

Current flow:
```
scheduled() → cronCoordinator() → fetch(WORKER_URL/internal/user-cron) per user
                                        ↓
                              handleInternalCron() → hydrateEnv → pollUserAccounts + publishDrafts + ...
```

## Goals / Non-Goals

**Goals:**
- Make cron execution reliable — no silent failures
- Remove WORKER_URL dependency from cron path
- Keep per-user key hydration (multi-tenant)
- Run users in parallel for performance
- Auto-resolve missing `user_id` on twitter accounts

**Non-Goals:**
- Scaling to 100+ users (Cloudflare Queues would be the path for that)
- Changing what the per-user cron tasks do (polling, publishing, etc.)
- Removing WORKER_URL entirely (still needed for image URLs, webhook URLs)

## Decisions

### 1. Inline parallel via Promise.allSettled

Replace self-fetch with:
```ts
const tasks = users.map(user => processUserCron(env, user.chat_id));
await Promise.allSettled(tasks);
```

Each user runs as a concurrent promise within the same isolate. No network hops. Errors are isolated per-user via `allSettled` (one user failing doesn't affect others).

**Why not sequential?** At 2 users it doesn't matter, but parallel costs nothing extra and scales to ~20 users without wall clock issues.

**Why not keep fan-out?** The self-fetch pattern has proven unreliable — depends on WORKER_URL, goes through external network, errors silently swallowed.

### 2. Move per-user logic into a single async function

Extract the per-user work from `handleInternalCron` into a standalone `processUserCron(env, chatId)` function in `cron.ts`. This function:
1. Hydrates env with per-user keys
2. Runs pollUserAccounts
3. Runs publishUserDrafts
4. Runs checkUserStaleVideos
5. Runs publishUserScheduledVideos

Same logic as `handleInternalCron` but without the HTTP wrapper.

### 3. Auto-resolve missing user_id in poller

When the poller encounters an account without `user_id`, instead of skipping, attempt `lookupUserByUsername(env, username)`. If successful, update the account with the resolved `user_id` and continue polling. If lookup fails, then skip (as before).

This fixes the chicken-and-egg problem where accounts added during X API outages or with bad keys permanently lack user_id.

## Risks / Trade-offs

- **[Wall clock timeout with many users]** → At current scale (2-5 users), parallel execution completes in ~10-15s. If scaling beyond ~20 users, would need to migrate to Cloudflare Queues. Acceptable for now.
- **[Single isolate failure affects all users]** → If the isolate crashes, all users' cron tasks fail. With fan-out, each user was independent. Mitigated by `Promise.allSettled` which isolates per-user errors.
- **[user_id lookup adds latency]** → Only happens once per account (after first successful lookup, user_id is persisted). Negligible impact.
