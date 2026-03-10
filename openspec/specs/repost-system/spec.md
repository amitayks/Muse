## Trigger & Input

### Requirement: Repost command and dashboard button
The system SHALL provide a `/repost` command and a "🔄 RePost" button on the home dashboard that enters the repost URL input mode.

#### Scenario: User triggers repost via command
- **WHEN** user sends `/repost`
- **THEN** bot sets `awaiting_input` to `repost_url` and displays a prompt: "Send me a tweet URL to create a repost" with a Cancel button

#### Scenario: User triggers repost via dashboard button
- **WHEN** user clicks "🔄 RePost" on the home screen
- **THEN** bot enters the same repost URL input mode as the `/repost` command

### Requirement: Tweet URL parsing
The system SHALL parse tweet URLs to extract the tweet ID and username. Supported formats: `https://x.com/{username}/status/{id}`, `https://twitter.com/{username}/status/{id}`, and bare variants without protocol.

#### Scenario: Valid tweet URL
- **WHEN** user sends a valid tweet URL like `https://x.com/vercel/status/1234567890`
- **THEN** bot extracts username `vercel` and tweet ID `1234567890` and proceeds to fetch the tweet

#### Scenario: Invalid URL format
- **WHEN** user sends text that is not a recognized tweet URL
- **THEN** bot displays an error message with format examples and keeps `awaiting_input` as `repost_url`

### Requirement: Tweet preview with engagement metrics
The system SHALL fetch the tweet via X API and display a preview before generating, including: author name/username, tweet text (truncated if long), engagement metrics (likes, retweets, quotes), thread indicator if applicable.

#### Scenario: Standalone tweet preview
- **WHEN** bot fetches a standalone tweet successfully
- **THEN** bot displays preview with author info, tweet text, metrics, and action buttons: tone selector row, [Generate] button, [Cancel] button

#### Scenario: Thread tweet preview
- **WHEN** bot fetches a tweet that is part of a thread (self-reply chain)
- **THEN** bot displays preview indicating "Thread (N tweets)" and fetches the full thread text for context

#### Scenario: Tweet fetch fails
- **WHEN** X API returns an error or the tweet doesn't exist
- **THEN** bot displays "Tweet not found or inaccessible" with a retry prompt

### Requirement: Duplicate detection
The system SHALL check if a repost draft or published post already exists for the given tweet ID before generating.

#### Scenario: Existing draft found
- **WHEN** user submits a URL for a tweet that already has a repost draft
- **THEN** bot warns "You already have a repost draft for this tweet" and offers [View Existing Draft] and [Generate Anyway] buttons

#### Scenario: No duplicate found
- **WHEN** user submits a URL for a tweet with no existing repost
- **THEN** bot proceeds to the preview step normally

## Persona

### Requirement: Persona cache table
The system SHALL maintain a `persona_cache` table for storing persona data of non-followed accounts. Columns: id (PK), username (UNIQUE), user_id, display_name, bio, persona, topics, created_at, updated_at.

#### Scenario: Cache entry created after manual repost
- **WHEN** a manual repost is generated for an unknown account
- **THEN** the fetched profile + AI-generated persona is stored in `persona_cache` keyed by username

#### Scenario: Cache entry reused on subsequent repost
- **WHEN** user generates a manual repost for an account that has a cache entry less than 30 days old
- **THEN** the cached persona is used without making new API/AI calls

### Requirement: Persona cache TTL
The system SHALL treat persona cache entries older than 30 days as stale and refresh them on next use.

#### Scenario: Stale cache entry
- **WHEN** a manual repost targets an account whose cache entry is older than 30 days
- **THEN** the system fetches fresh profile data and regenerates the persona, updating the cache entry

#### Scenario: Fresh cache entry
- **WHEN** a manual repost targets an account whose cache entry is less than 30 days old
- **THEN** the cached data is used as-is

### Requirement: Persona generation for unknown accounts
The system SHALL generate a lightweight persona for unknown accounts using: X API profile data (name, bio, description, public metrics, profile_image_url) and Gemini with web search grounding for contextual understanding.

#### Scenario: Successful persona generation
- **WHEN** the system generates a persona for an unknown account
- **THEN** it fetches the user profile via X API (including `profile_image_url`), calls Gemini with web search grounding to understand who this person/company is, and stores the result in persona_cache including the profile image URL

#### Scenario: X API profile fetch fails
- **WHEN** the X API profile lookup fails for an unknown account
- **THEN** generation proceeds with only the tweet text as context (no persona), and no cache entry is created

### Requirement: Followed accounts bypass cache
The system SHALL prefer `twitter_account_overviews` (from followed accounts) over `persona_cache` when both exist.

#### Scenario: Account is followed and has overview
- **WHEN** a manual repost targets an account that is being followed and has a persona overview
- **THEN** the system uses the `twitter_account_overviews` data, not `persona_cache`

#### Scenario: Account is followed but has no overview
- **WHEN** a manual repost targets a followed account without a persona overview
- **THEN** the system falls back to `persona_cache` if available, otherwise generates a new persona and caches it

### Requirement: Persona bootstrap with Gemini web search
The system SHALL provide a function to bootstrap an account persona overview by: fetching the X profile data (bio, name, followers), fetching recent tweets (up to 50), and calling Gemini with web search grounding enabled to research the person/company and generate a structured persona. The result SHALL be stored in `twitter_account_overviews`.

#### Scenario: Bootstrap corporate account
- **WHEN** bootstrap is triggered for @anthropic
- **THEN** Gemini SHALL search the web for "Anthropic", combine with X profile data and recent tweets, and generate persona fields: persona summary, topics array, communication style, notable context, recent themes

#### Scenario: Bootstrap individual developer
- **WHEN** bootstrap is triggered for @somedev
- **THEN** Gemini SHALL use X profile + recent tweets (web search may not find much), and generate persona based primarily on their tweet history

## Media Analysis

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

### Requirement: Multimodal repost generation
When `analyzeMedia` is enabled and a tweet has a `media_url`, the repost generation flow SHALL fetch the image, base64-encode it, and send it as an `inline_data` part alongside the text prompt to Gemini.

#### Scenario: Generation with media enabled and image available
- **WHEN** generating a repost for a tweet that has `media_url` AND `analyzeMedia` is true
- **THEN** the system fetches the image, base64-encodes it, and includes it as a multimodal part in the Gemini API call

#### Scenario: Generation with media enabled but image fetch fails
- **WHEN** generating a repost for a tweet that has `media_url` AND the image fetch fails
- **THEN** the system continues generation with text-only (graceful fallback)

#### Scenario: Generation with media disabled
- **WHEN** generating a repost for a tweet that has `media_url` AND `analyzeMedia` is false
- **THEN** the system generates text-only, ignoring the media

#### Scenario: Manual repost always includes media
- **WHEN** generating via manual `/repost` flow AND the tweet has media
- **THEN** media is always included regardless of account config (no toggle for manual)

### Requirement: Account config analyzeMedia toggle
The `TwitterAccountConfig` SHALL include an `analyzeMedia: boolean` field (default `true`) that controls whether media is sent to the AI during repost generation for that account's tweets. The config SHALL also retain `relevanceThreshold`, `autoApprove`, and `batchPageSize`. Fields `includeHashtags`, `alwaysGenerateImage`, `singleImageProbability`, and `tone` are removed.

#### Scenario: Toggle in account settings
- **WHEN** a user views account configuration for a followed account
- **THEN** an "Analyze Media" toggle button is visible alongside remaining toggles (auto-approve, threshold, batch size)

### Requirement: Prompt awareness of attached images
When media is included in the Gemini call, the repost prompt SHALL inform the AI that an image is attached and instruct it to reference visual content when relevant.

#### Scenario: Prompt includes image note
- **WHEN** an image is included in the Gemini multimodal request
- **THEN** the text prompt includes a note telling the AI the original tweet has an attached image and to consider its content

#### Scenario: Prompt without image note
- **WHEN** no image is included in the request
- **THEN** the prompt does not mention any image

## Content Generation

### Requirement: Dedicated repost content generation prompt
The system SHALL have a dedicated generation prompt in its own file (`ai/repost-prompt.ts`), separate from the existing content generation prompt. It SHALL instruct Gemini to create a quote-tweet response that adds genuine commentary, insight, or value to the original tweet. The prompt SHALL receive: the original tweet text, the account persona overview (if available), and language setting. Tone and hashtag preferences are no longer passed — they are controlled by the skills/identity system.

#### Scenario: Generate with full context
- **WHEN** generation is triggered for a tweet from @vercel
- **THEN** the prompt SHALL include the original tweet, @vercel's persona overview, and language setting

#### Scenario: Generate without persona
- **WHEN** generation is triggered and no persona overview exists for the account
- **THEN** the prompt SHALL still generate content using only the tweet text

### Requirement: AI generation with context
The system SHALL generate a quote-tweet draft using the repost generation prompt, with context including: the tweet text (full thread if applicable), author profile info, persona overview (from account or persona cache), and the selected tone.

#### Scenario: Generation for followed account
- **WHEN** user clicks Generate for a tweet from a followed account
- **THEN** bot uses the stored persona overview and account config, generates content, creates a draft with source='repost', and shows the draft detail with image

#### Scenario: Generation for unknown account
- **WHEN** user clicks Generate for a tweet from an account not being followed
- **THEN** bot fetches/creates persona via X API profile + Gemini web search, caches it, generates content using DEFAULT config (with selected tone override), and shows draft detail

### Requirement: Repost uses user-level language
The `buildRepostUserPrompt()` function SHALL use the user's global language setting (`user.language`) instead of the account-level `config.language` to determine the language instruction sent to Gemini.

#### Scenario: Hebrew user generates repost
- **WHEN** a user with `language='he'` generates a repost
- **THEN** the prompt sent to Gemini SHALL include `- Language: Hebrew`
- **AND** the language SHALL come from `user.language`, not from the account's config

#### Scenario: English user generates repost
- **WHEN** a user with `language='en'` generates a repost
- **THEN** the prompt sent to Gemini SHALL include `- Language: English`

### Requirement: Repost generation uses DB-backed system prompt
The repost generation flow SHALL resolve the system prompt from the database via `getPrompt(env, chatId, 'repost', lang)` instead of using a hardcoded constant.

#### Scenario: User with custom repost prompt
- **WHEN** a user with a custom repost prompt generates a quote-tweet
- **THEN** the custom repost prompt SHALL be used as the system instruction for Gemini

#### Scenario: Default repost prompt
- **WHEN** a user without a custom repost prompt generates a quote-tweet
- **THEN** the global default repost prompt SHALL be used (identical to current hardcoded behavior)

### Requirement: Content generation uses user language
The `generateContent()` function in `gemini.ts` SHALL accept a `language` parameter and include a language instruction in the user prompt sent to Gemini. This ensures PR/commit-based tweet generation respects the user's language preference.

#### Scenario: Hebrew user gets Hebrew tweets
- **WHEN** `generateContent(env, source, repoId, 'he')` is called
- **THEN** the user prompt SHALL include a language instruction telling Gemini to write in Hebrew

#### Scenario: English user gets English tweets (default)
- **WHEN** `generateContent(env, source, repoId, 'en')` is called
- **THEN** the user prompt SHALL include a language instruction telling Gemini to write in English

### Requirement: Tweet history context
The generation prompt SHALL include the last 20-50 tweets from the same account (from `twitter_tweets` table, ordered by `tweeted_at DESC`). This enables the AI to reference past events and maintain context continuity.

#### Scenario: Past reference capability
- **WHEN** the AI generates a quote tweet about a new release
- **THEN** it MAY reference a previous tweet from the same author about related work (e.g., "Following up on their compiler announcement last week...")

#### Scenario: Fewer than 20 stored tweets
- **WHEN** an account has only 5 stored tweets
- **THEN** all 5 SHALL be included as context

### Requirement: Repost draft creation
When a repost draft is generated, the system SHALL create a row in the `drafts` table with: `source='repost'`, `pr_number=0`, `pr_title='@username | first-100-chars'`, `commit_sha=original_tweet_id` (for idempotency), `original_tweet_id`, `original_tweet_url`, `content` as JSON DraftContent, and `status='draft'` (or `'approved'` for auto-approve accounts).

#### Scenario: Draft content structure
- **WHEN** a repost draft is created
- **THEN** `content` SHALL be a JSON DraftContent with `format='single'` (typical) or `format='thread'`, and `tweets` array with the generated text

#### Scenario: Auto-approve draft creation
- **WHEN** the account has `autoApprove=true` and the tweet scores above threshold
- **THEN** the draft SHALL be created with `status='approved'` instead of `'draft'`

### Requirement: Link twitter_tweet to draft after generation
After a draft is created from a scored tweet, the `twitter_tweets` row SHALL have its `status` updated to `'drafted'` and `draft_id` set to the created draft's ID.

#### Scenario: Tweet status after draft creation
- **WHEN** a draft is created for tweet "123"
- **THEN** `twitter_tweets` row "123" SHALL have `status='drafted'` and `draft_id` set

## Post-Generation

### Requirement: Follow prompt after generation
The system SHALL offer to follow an unknown account after successfully generating a repost draft.

#### Scenario: Prompt to follow unknown account
- **WHEN** a repost draft is successfully generated for a tweet from an account the user does not follow
- **THEN** bot sends a separate message: "Want to follow @username for automatic reposts?" with [Follow] and [No thanks] buttons

#### Scenario: User clicks Follow
- **WHEN** user clicks Follow on the prompt
- **THEN** the account is added to followed accounts (same as addAccountAction) and a confirmation is shown

#### Scenario: User clicks No thanks
- **WHEN** user clicks No thanks
- **THEN** the prompt message is edited to "Got it! You can always follow them later from Accounts."

## Profile Data

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
