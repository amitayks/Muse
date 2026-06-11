## ADDED Requirements

### Requirement: Identity fetch authenticates via OAuth 2.0 bearer

The identity analysis reads (`fetchUserTweets`, `getMyProfile`, and the `/2/users/me` resolution) SHALL authenticate with the user's OAuth 2.0 `Authorization: Bearer` token.

#### Scenario: Fetch own tweets for identity analysis

- **WHEN** identity analysis fetches the authenticated user's recent tweets and profile
- **THEN** the requests SHALL send `Authorization: Bearer <access_token>` for that user and SHALL NOT use OAuth 1.0a signing

#### Scenario: Identity fetch when not connected

- **WHEN** identity analysis is requested for a user without a valid OAuth 2.0 token
- **THEN** it SHALL surface a reconnect-required signal rather than attempting an unauthenticated request
