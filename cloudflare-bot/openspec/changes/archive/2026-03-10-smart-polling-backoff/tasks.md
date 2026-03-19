## 1. Database Schema

- [x] 1.1 Add `next_poll_at` (TEXT, nullable) and `consecutive_empty_polls` (INTEGER, default 0) columns to `twitter_accounts` table in the D1 migration
- [x] 1.2 Add `next_poll_at` and `consecutive_empty_polls` fields to the `TwitterAccount` type in `types.ts`

## 2. Backoff Logic

- [x] 2.1 Create `calculateNextPollAt(consecutiveEmptyPolls: number): string` utility function in `poller.ts` that returns ISO timestamp using formula `min(30 * 2^(n-1), 240)` minutes from now
- [x] 2.2 Update `pollSingleAccount()` to update `consecutive_empty_polls` and `next_poll_at` after each poll — reset on tweets found, increment + backoff on empty

## 3. Skip Logic

- [x] 3.1 Update `pollUserAccounts()` to filter out accounts where `next_poll_at` is in the future before entering the per-account loop (NULL = immediately eligible)

## 4. Database Operations

- [x] 4.1 Update `updateTwitterAccount()` calls in the poller to persist `next_poll_at` and `consecutive_empty_polls` alongside existing `last_tweet_id` updates
