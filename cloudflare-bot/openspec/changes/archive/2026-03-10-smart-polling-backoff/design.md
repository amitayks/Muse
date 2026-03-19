## Context

The bot polls watched X accounts for new tweets every 15 minutes via a Cloudflare Workers cron. Each poll calls `getUserTweets()` per account ($0.005/request on X API pay-per-use). Most polls return zero results — accounts typically tweet 1-5 times/day, but get polled 96 times/day.

The 15-min cron also handles scheduled draft publishing, video checks, and scheduled video publishing — these must remain on a 15-min cycle for punctuality.

## Goals / Non-Goals

**Goals:**
- Reduce X API polling costs by 70-90% through exponential backoff on empty polls
- Keep cron at 15-min for scheduled posts/videos (no latency degradation)
- Self-tuning: active accounts poll more, inactive accounts poll less
- Instant reset when new tweets are found

**Non-Goals:**
- Changing the cron interval itself (stays at 15 min)
- Real-time tweet detection (webhooks/streaming) — not available on current API tier
- Per-user configurable polling intervals
- Changing how thread detection or thread completion works

## Decisions

### 1. Per-account `next_poll_at` timestamp vs global interval change

**Decision**: Per-account `next_poll_at` column in `twitter_accounts`.

**Why**: Each account has different posting frequency. A global interval change would over-poll inactive accounts and under-poll active ones. Per-account tracking lets the system self-tune to each account's rhythm.

**Alternative considered**: Changing the cron interval from 15 to 30 min globally — simpler but degrades scheduled post punctuality and doesn't adapt per account.

### 2. Exponential backoff with min 30 min / max 4 hours

**Decision**: On consecutive empty polls, double the interval: 30m → 1h → 2h → 4h (cap). On any tweet found, reset to 30m.

**Why**: 30-min base is a reasonable trade-off between freshness and cost. 4-hour cap ensures even dormant accounts get checked regularly. Exponential curve matches real-world posting patterns — most accounts are either active (tweet within hours) or dormant (days/weeks).

**Backoff curve**:
- 0 empty polls → poll in 30 min
- 1 empty poll → poll in 30 min
- 2 empty polls → poll in 1 hour
- 3 empty polls → poll in 2 hours
- 4+ empty polls → poll in 4 hours (cap)

### 3. DB columns vs in-memory state

**Decision**: Two new columns on `twitter_accounts`: `next_poll_at` (TEXT, ISO timestamp, nullable) and `consecutive_empty_polls` (INTEGER, default 0).

**Why**: Workers are stateless — state must persist in D1. These columns survive worker restarts and are queryable for debugging.

### 4. Skip logic location: in `pollUserAccounts` before the per-account loop

**Decision**: Filter accounts by `next_poll_at` inside `pollUserAccounts()`, before entering the per-account loop.

**Why**: Avoids calling `getUserTweets` entirely for accounts that aren't due. The skip is a simple timestamp comparison — no API call needed.

## Risks / Trade-offs

- **[Delayed detection for suddenly-active accounts]** → An account that was dormant (4h interval) and suddenly tweets will be detected up to 4 hours late. Mitigation: 4h cap is acceptable; users can manually trigger a poll via the bot if urgency is needed.

- **[New accounts start at 30 min instead of 15 min]** → Slight increase in initial detection latency. Mitigation: 30 min is still reasonable for content reposting workflows.

- **[Migration of existing accounts]** → Existing accounts have no `next_poll_at` value. Mitigation: NULL `next_poll_at` means "poll immediately" — all accounts start eligible and naturally settle into their rhythm.
