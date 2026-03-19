## MODIFIED Requirements

### Requirement: last_tweet_id tracking
After each successful poll of an account, the poller SHALL update `twitter_accounts.last_tweet_id` with the highest tweet ID returned. This SHALL be the maximum ID across all tweets (including thread tweets), NOT just non-thread tweets. Additionally, the poller SHALL update `consecutive_empty_polls` and `next_poll_at` based on whether tweets were found.

#### Scenario: Update after poll with tweets
- **WHEN** tweets with IDs ["100", "101", "102"] are fetched
- **THEN** `last_tweet_id` SHALL be updated to "102"
- **THEN** `consecutive_empty_polls` SHALL reset to 0
- **THEN** `next_poll_at` SHALL be set to `now + 30 minutes`

#### Scenario: Empty poll
- **WHEN** no new tweets are returned
- **THEN** `last_tweet_id` SHALL remain unchanged
- **THEN** `consecutive_empty_polls` SHALL increment by 1
- **THEN** `next_poll_at` SHALL be set based on backoff formula: `min(30 * 2^(consecutive_empty_polls - 1), 240)` minutes from now
