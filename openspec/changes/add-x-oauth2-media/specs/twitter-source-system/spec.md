## ADDED Requirements

### Requirement: X read/poller calls authenticate via OAuth 2.0 bearer

The X read paths used by the source/poller system (`getUserTweets`, `searchConversation`, `getTweetById`, `lookupUserByUsername`) SHALL authenticate with the user's OAuth 2.0 `Authorization: Bearer` token. The required read scopes (`tweet.read`, `users.read`) SHALL be part of the granted scope set.

#### Scenario: Polling monitored accounts uses the bearer

- **WHEN** the poller fetches tweets or looks up a user for a connected user's monitored accounts
- **THEN** the requests SHALL send `Authorization: Bearer <access_token>` and SHALL NOT use OAuth 1.0a signing

#### Scenario: Poller skips users who are not connected

- **WHEN** the poller runs for a user with no valid OAuth 2.0 token
- **THEN** it SHALL skip that user's X reads (surfacing a reconnect-required signal) rather than failing with an opaque auth error
