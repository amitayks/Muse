## Why

The cron fan-out architecture uses self-fetch (`fetch(WORKER_URL/internal/user-cron)`) to dispatch per-user cron tasks. This is unreliable — the self-fetch goes through Cloudflare's external network, depends on WORKER_URL being correctly configured, is subject to rate limiting, and silently swallows errors via `ctx.waitUntil` + `.catch()`. The old dedicated twitter-poller worker ran polling directly in the scheduled handler and worked reliably. We need to restore that simplicity while keeping the multi-tenant per-user key hydration.

## What Changes

- Replace the self-fetch fan-out in `cronCoordinator` with direct inline parallel execution using `Promise.allSettled`
- Remove the `/internal/user-cron` HTTP route and handler — no longer needed
- Remove `WORKER_URL` dependency from the cron path (still used elsewhere for image URLs, webhooks, etc.)
- Each user's cron tasks (poll, publish drafts, check stale videos, publish scheduled videos) run as parallel promises inside the scheduled handler
- Fix missing `user_id` on twitter accounts: when the poller encounters an account without `user_id`, attempt an X API lookup to resolve it instead of skipping

## Capabilities

### New Capabilities

### Modified Capabilities

## Impact

- `src/handlers/cron.ts` — rewrite `cronCoordinator` to run inline parallel
- `src/routes/internal-cron.ts` — delete entirely
- `src/index.ts` — remove `/internal/user-cron` route
- `src/services/poller.ts` — add user_id auto-resolution for accounts missing it
