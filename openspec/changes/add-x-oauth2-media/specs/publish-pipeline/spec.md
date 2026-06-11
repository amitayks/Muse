## ADDED Requirements

### Requirement: X post calls authenticate via OAuth 2.0 bearer

All X post operations used by the publish pipeline (`postTweet`, `postThread`, `postQuoteTweet`, and `deleteTweet`) SHALL authenticate with the user's OAuth 2.0 `Authorization: Bearer` token, for both text-only and media-bearing posts.

#### Scenario: Thread and quote posts use the bearer

- **WHEN** the publish pipeline posts a tweet, a thread, or a quote tweet (with or without media)
- **THEN** each request SHALL send `Authorization: Bearer <access_token>` for the publishing user, and SHALL NOT use OAuth 1.0a signing

#### Scenario: Publish blocked when X is not connected

- **WHEN** a draft targets X but the user has no valid OAuth 2.0 token
- **THEN** the X branch of the publish pipeline SHALL record a reconnect-required error in `publish_results.errors.x` rather than attempting an unauthenticated post
