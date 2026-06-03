## Purpose

Applies per-account exponential backoff to the Twitter poller, lengthening the polling interval (30 minutes up to a 4-hour cap) after consecutive empty polls and resetting it when new tweets appear, persisting `next_poll_at` and `consecutive_empty_polls` so accounts not yet due are skipped without X API calls.

## Requirements

### Requirement: Exponential backoff on empty polls
The poller SHALL track consecutive empty polls per account and exponentially increase the polling interval. The minimum interval SHALL be 30 minutes and the maximum SHALL be 4 hours.

#### Scenario: First empty poll
- **WHEN** a poll for an account returns 0 new tweets
- **THEN** `consecutive_empty_polls` SHALL increment by 1
- **THEN** `next_poll_at` SHALL be set to `now + 30 minutes`

#### Scenario: Second consecutive empty poll
- **WHEN** a poll returns 0 new tweets and `consecutive_empty_polls` is already 1
- **THEN** `consecutive_empty_polls` SHALL increment to 2
- **THEN** `next_poll_at` SHALL be set to `now + 1 hour`

#### Scenario: Third consecutive empty poll
- **WHEN** a poll returns 0 new tweets and `consecutive_empty_polls` is already 2
- **THEN** `consecutive_empty_polls` SHALL increment to 3
- **THEN** `next_poll_at` SHALL be set to `now + 2 hours`

#### Scenario: Fourth or more consecutive empty polls (cap)
- **WHEN** a poll returns 0 new tweets and `consecutive_empty_polls` is 3 or more
- **THEN** `next_poll_at` SHALL be set to `now + 4 hours` (maximum cap)

#### Scenario: Tweets found after backoff
- **WHEN** a poll returns 1 or more new tweets
- **THEN** `consecutive_empty_polls` SHALL reset to 0
- **THEN** `next_poll_at` SHALL be set to `now + 30 minutes`

### Requirement: Skip accounts not due for polling
The poller SHALL skip accounts whose `next_poll_at` is in the future. Accounts with NULL `next_poll_at` SHALL be considered immediately eligible.

#### Scenario: Account not yet due
- **WHEN** the poller encounters an account with `next_poll_at` = "2026-03-08T12:00:00Z" and current time is "2026-03-08T11:45:00Z"
- **THEN** the poller SHALL skip that account without making any X API call

#### Scenario: Account due for polling
- **WHEN** the poller encounters an account with `next_poll_at` = "2026-03-08T11:00:00Z" and current time is "2026-03-08T11:15:00Z"
- **THEN** the poller SHALL poll that account normally

#### Scenario: Account with no next_poll_at (new or migrated)
- **WHEN** the poller encounters an account with `next_poll_at` = NULL
- **THEN** the poller SHALL poll that account immediately (treat as due)

### Requirement: Backoff interval calculation
The system SHALL calculate the next poll interval using the formula: `min(30 * 2^(consecutive_empty_polls - 1), 240)` minutes, where the result is clamped to a minimum of 30 minutes and a maximum of 240 minutes (4 hours).

#### Scenario: Interval progression
- **WHEN** `consecutive_empty_polls` values are 1, 2, 3, 4, 5
- **THEN** intervals SHALL be 30, 60, 120, 240, 240 minutes respectively

### Requirement: Backoff state persistence
The `twitter_accounts` table SHALL have two columns for backoff state: `next_poll_at` (TEXT, nullable, ISO 8601 timestamp) and `consecutive_empty_polls` (INTEGER, default 0).

#### Scenario: New account migration
- **WHEN** the migration runs on existing accounts
- **THEN** `next_poll_at` SHALL default to NULL (immediately eligible)
- **THEN** `consecutive_empty_polls` SHALL default to 0
