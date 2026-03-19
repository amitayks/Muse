## ADDED Requirements

### Requirement: Inline parallel cron execution
The scheduled handler SHALL execute per-user cron tasks directly as parallel promises within the same isolate, without HTTP self-fetch fan-out.

#### Scenario: Multiple users with pending work
- **WHEN** the cron trigger fires and 2+ users have watching twitter accounts or scheduled drafts
- **THEN** all users' cron tasks SHALL run concurrently via Promise.allSettled

#### Scenario: One user fails
- **WHEN** one user's cron tasks throw an error
- **THEN** other users' tasks SHALL complete unaffected

### Requirement: Auto-resolve missing user_id
The poller SHALL attempt to resolve missing `user_id` on twitter accounts via X API lookup instead of skipping them.

#### Scenario: Account without user_id
- **WHEN** the poller encounters a twitter account with no user_id
- **THEN** it SHALL call lookupUserByUsername and persist the resolved user_id
- **THEN** it SHALL continue polling that account in the same cycle

#### Scenario: Lookup fails
- **WHEN** the X API lookup fails for an account without user_id
- **THEN** the poller SHALL skip the account (same as current behavior) and log a warning
