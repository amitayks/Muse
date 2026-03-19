## ADDED Requirements

### Requirement: Store author profile image URL at tweet fetch time
The poller and manual repost flows SHALL store the tweet author's profile image URL when fetching tweets from the X API.

#### Scenario: Poller stores profile image URL
- **WHEN** the poller fetches tweets from a followed account and the API response includes `profile_image_url` in user expansions
- **THEN** the `twitter_tweets` row SHALL store the value in `author_profile_image_url`

#### Scenario: Manual repost stores profile image URL
- **WHEN** a manual repost fetches a tweet via `getTweetById()` with user expansions
- **THEN** the `repost_preview` context SHALL include `author_profile_image_url`
- **AND** when the draft is created, the profile image URL SHALL be accessible for tweet card rendering

#### Scenario: X API request includes profile image field
- **WHEN** the poller calls `getUserTweets()` or `getTweetById()` with user expansions
- **THEN** the request SHALL include `profile_image_url` in `user.fields`

### Requirement: Store author display name on twitter_tweets
The `twitter_tweets` table SHALL include an `author_display_name` column to store the tweet author's display name for tweet card rendering.

#### Scenario: Display name stored at fetch time
- **WHEN** a tweet is fetched from the X API with user expansions
- **THEN** the `twitter_tweets` row SHALL store the author's `name` field as `author_display_name`

#### Scenario: Display name used in tweet card
- **WHEN** a tweet card is rendered for a repost draft
- **THEN** the original author's display name from `twitter_tweets.author_display_name` SHALL be used in the card

### Requirement: Profile image URL on persona_cache
The `persona_cache` table SHALL include a `profile_image_url` column populated during persona generation.

#### Scenario: Manual repost stores profile image in cache
- **WHEN** a persona is generated for a non-followed account
- **THEN** the `persona_cache` row SHALL include `profile_image_url` from the X API profile data

#### Scenario: Profile image available for tweet card
- **WHEN** a tweet card is rendered for a repost from a non-followed account
- **THEN** the system SHALL look up the profile image URL from `persona_cache.profile_image_url`

### Requirement: Profile image URL on twitter_accounts
The `twitter_accounts` table SHALL include a `profile_image_url` column populated during account add/bootstrap.

#### Scenario: Profile image stored when account is added
- **WHEN** a new Twitter account is followed via the Add Account flow
- **THEN** the `twitter_accounts` row SHALL include `profile_image_url` from the X API user lookup

#### Scenario: Profile image updated during bootstrap
- **WHEN** a persona bootstrap is performed for a followed account
- **THEN** the `twitter_accounts.profile_image_url` SHALL be updated with the latest value from the X API

### Requirement: User's own profile image cached
The system SHALL store the user's own X profile image URL on the `users` table for tweet card rendering of the user's own tweets.

#### Scenario: Profile image stored during identity analysis
- **WHEN** `analyzeIdentity()` calls `/2/users/me` and receives profile data
- **THEN** `users.own_profile_image_url` SHALL be updated with the `profile_image_url` value
- **AND** `users.own_username_x` SHALL be updated with the `username` value
- **AND** `users.own_display_name_x` SHALL be updated with the `name` value

#### Scenario: Profile data used for own tweet cards
- **WHEN** a tweet card is rendered for the user's own content (auto-generated or handwritten drafts)
- **THEN** the card SHALL use `users.own_profile_image_url`, `users.own_username_x`, and `users.own_display_name_x`

## MODIFIED Requirements

### Requirement: Store media URL at poll time
The system SHALL store the first relevant media URL (photo URL or video thumbnail) for each tweet in the `twitter_tweets.media_url` column when polling followed accounts. It SHALL also store the author's profile image URL and display name.

#### Scenario: Tweet with photo
- **WHEN** the poller fetches a tweet that has an attached photo
- **THEN** the system stores the photo's `url` field as `media_url` in `twitter_tweets`

#### Scenario: Tweet with video
- **WHEN** the poller fetches a tweet that has an attached video or animated GIF
- **THEN** the system stores the video's `preview_image_url` (thumbnail) as `media_url` in `twitter_tweets`

#### Scenario: Tweet with no media
- **WHEN** the poller fetches a tweet with no media attachments
- **THEN** the `media_url` column SHALL be NULL

#### Scenario: Tweet with multiple media
- **WHEN** the poller fetches a tweet with multiple media attachments
- **THEN** the system stores only the first photo URL (or first video thumbnail if no photos)

#### Scenario: Author profile data stored alongside media
- **WHEN** the poller fetches a tweet with user expansion data
- **THEN** the `author_profile_image_url` and `author_display_name` columns SHALL be populated from the user expansion

### Requirement: X API media expansions in poller
The poller's `getUserTweets` call SHALL request media expansions (`attachments.media_keys`) with `media.fields` including `media_key,type,url,preview_image_url` to receive media metadata alongside tweet data. It SHALL also request `profile_image_url` in `user.fields`.

#### Scenario: API request includes media and profile fields
- **WHEN** the poller calls `getUserTweets` for a followed account
- **THEN** the request includes `attachments` in `tweet.fields`, `attachments.media_keys` in `expansions`, `media_key,type,url,preview_image_url` in `media.fields`, and `profile_image_url` in `user.fields`

### Requirement: Persona generation for unknown accounts
The system SHALL generate a lightweight persona for unknown accounts using: X API profile data (name, bio, description, public metrics, profile_image_url) and Gemini with web search grounding for contextual understanding.

#### Scenario: Successful persona generation
- **WHEN** the system generates a persona for an unknown account
- **THEN** it fetches the user profile via X API (including `profile_image_url`), calls Gemini with web search grounding to understand who this person/company is, and stores the result in persona_cache including the profile image URL

#### Scenario: X API profile fetch fails
- **WHEN** the X API profile lookup fails for an unknown account
- **THEN** generation proceeds with only the tweet text as context (no persona), and no cache entry is created
