## MODIFIED Requirements

### Requirement: Quote tweet fallback on 403
When publishing a repost draft as a quote tweet, if the X API returns 403 (quoting not allowed), the system SHALL retry as a regular tweet with the original tweet URL appended to the text.

#### Scenario: Quote tweet succeeds via API
- **WHEN** `postQuoteTweet` is called with a valid `quoteTweetId`
- **AND** the X API accepts the `quote_tweet_id` parameter
- **THEN** the system posts using `quote_tweet_id` as before

#### Scenario: Quote tweet blocked by API (403)
- **WHEN** `postQuoteTweet` is called and the X API returns 403
- **AND** `originalTweetUrl` is provided
- **THEN** the system SHALL retry by posting a regular tweet with the original tweet URL appended to the text (separated by newlines)
- **AND** return the new tweet ID as if the quote succeeded

#### Scenario: Quote tweet blocked without URL fallback
- **WHEN** `postQuoteTweet` is called and the X API returns 403
- **AND** `originalTweetUrl` is NOT provided
- **THEN** the system SHALL throw the error as before

#### Scenario: Non-403 errors
- **WHEN** `postQuoteTweet` is called and the X API returns any error other than 403
- **THEN** the system SHALL throw the error as before
