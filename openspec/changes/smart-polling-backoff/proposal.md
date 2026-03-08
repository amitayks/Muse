## Why

The cron-based tweet polling runs every 15 minutes for all watched accounts, resulting in ~672 X API requests/week — most returning zero new tweets. On the pay-per-use pricing model ($0.005/read), this costs ~$3.36/week unnecessarily. We need to poll smarter: skip accounts that are unlikely to have new tweets, while keeping the 15-min cron for scheduled post publishing.

## What Changes

- Add exponential backoff to per-account tweet polling: min 30 min, max 4 hours
- Track `next_poll_at` and `consecutive_empty_polls` per twitter account
- Poller skips accounts whose `next_poll_at` is in the future
- On empty poll: double the interval (30m → 1h → 2h → 4h cap)
- On tweet found: reset to 30-min baseline
- Cron interval stays at 15 min (needed for scheduled posts, video checks)

## Capabilities

### New Capabilities
- `polling-backoff`: Exponential backoff logic for per-account tweet polling frequency

### Modified Capabilities
- `twitter-source-system`: Polling stage gains backoff-aware account skipping and interval tracking

## Impact

- **DB schema**: `twitter_accounts` table gains `next_poll_at` (TEXT, nullable) and `consecutive_empty_polls` (INTEGER, default 0) columns
- **Poller service**: `pollUserAccounts()` and `pollSingleAccount()` gain skip/update logic
- **X API costs**: Expected 70-90% reduction in polling requests
