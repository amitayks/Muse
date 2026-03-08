## ADDED Requirements

### Requirement: Drafts table new columns
The `drafts` table SHALL have the following new columns added via migration `008_instagram_publish.sql`.

#### Scenario: publish_targets column
- **WHEN** the migration runs
- **THEN** `ALTER TABLE drafts ADD COLUMN publish_targets TEXT DEFAULT '{"x":true}'` SHALL be executed
- **AND** existing drafts SHALL default to X-only targeting

#### Scenario: publish_results column
- **WHEN** the migration runs
- **THEN** `ALTER TABLE drafts ADD COLUMN publish_results TEXT DEFAULT '{}'` SHALL be executed

#### Scenario: has_video column
- **WHEN** the migration runs
- **THEN** `ALTER TABLE drafts ADD COLUMN has_video INTEGER DEFAULT 0` SHALL be executed

### Requirement: Users table new columns
The `users` table SHALL have the following new columns added via migration.

#### Scenario: default_publish_targets column
- **WHEN** the migration runs
- **THEN** `ALTER TABLE users ADD COLUMN default_publish_targets TEXT DEFAULT '{"x":true}'` SHALL be executed

#### Scenario: Own profile data columns
- **WHEN** the migration runs
- **THEN** the following SHALL be executed:
  - `ALTER TABLE users ADD COLUMN own_profile_image_url TEXT`
  - `ALTER TABLE users ADD COLUMN own_username_x TEXT`
  - `ALTER TABLE users ADD COLUMN own_display_name_x TEXT`

#### Scenario: Instagram columns added to schema
- **WHEN** the migration runs
- **THEN** the following SHALL be executed (fixing schema gap):
  - `ALTER TABLE users ADD COLUMN instagram_token_enc TEXT`
  - `ALTER TABLE users ADD COLUMN instagram_account_id_enc TEXT`
  - `ALTER TABLE users ADD COLUMN has_instagram INTEGER DEFAULT 0`

### Requirement: Twitter tweets table new columns
The `twitter_tweets` table SHALL have new columns for author profile data.

#### Scenario: Author profile columns
- **WHEN** the migration runs
- **THEN** the following SHALL be executed:
  - `ALTER TABLE twitter_tweets ADD COLUMN author_profile_image_url TEXT`
  - `ALTER TABLE twitter_tweets ADD COLUMN author_display_name TEXT`

### Requirement: Twitter accounts table profile image column
The `twitter_accounts` table SHALL have a `profile_image_url` column.

#### Scenario: Account profile image column
- **WHEN** the migration runs
- **THEN** `ALTER TABLE twitter_accounts ADD COLUMN profile_image_url TEXT` SHALL be executed

### Requirement: Persona cache profile image column
The `persona_cache` table SHALL have a `profile_image_url` column.

#### Scenario: Persona cache profile image column
- **WHEN** the migration runs
- **THEN** `ALTER TABLE persona_cache ADD COLUMN profile_image_url TEXT` SHALL be executed

### Requirement: Published table simplified
The `published` table SHALL have `tweet_ids`, `tweet_url`, and `image_url` columns removed. Per-platform publish results are now stored in `drafts.publish_results`.

#### Scenario: Published table schema
- **WHEN** a new published record is created
- **THEN** it SHALL contain only: `id`, `chat_id`, `draft_id`, `pr_number`, `published_at`
- **AND** the `tweet_ids`, `tweet_url`, and `image_url` columns SHALL NOT be written to

#### Scenario: Old published records
- **WHEN** old published records exist with `tweet_ids`, `tweet_url`, `image_url` data
- **THEN** the columns SHALL remain in the table (SQLite does not support DROP COLUMN easily)
- **AND** new code SHALL NOT read from these columns

### Requirement: Updated TypeScript interfaces
The TypeScript type definitions SHALL be updated to reflect all schema changes.

#### Scenario: Draft interface updated
- **WHEN** the `Draft` interface is defined in `types.ts`
- **THEN** it SHALL include `publish_targets: string` (JSON of PublishTargets), `publish_results: string` (JSON of PublishResults), and `has_video: number` (0 or 1)

#### Scenario: Tweet interface updated
- **WHEN** the `Tweet` interface is defined in `types.ts`
- **THEN** the `mediaKey?: string` and `mediaType?: 'photo'` fields SHALL be replaced with `media?: TweetMedia[]`
- **AND** `TweetMedia` SHALL be defined as `{ key: string, type: 'photo' | 'video', width?: number, height?: number }`

#### Scenario: User interface updated
- **WHEN** the `User` interface is defined in `types.ts`
- **THEN** it SHALL include `default_publish_targets: string`, `own_profile_image_url: string | null`, `own_username_x: string | null`, `own_display_name_x: string | null`

#### Scenario: TwitterTweet interface updated
- **WHEN** the `TwitterTweet` interface is defined in `types.ts`
- **THEN** it SHALL include `author_profile_image_url: string | null` and `author_display_name: string | null`

#### Scenario: TwitterAccount interface updated
- **WHEN** the `TwitterAccount` interface is defined in `types.ts`
- **THEN** it SHALL include `profile_image_url: string | null`

#### Scenario: PersonaCache interface updated
- **WHEN** the `PersonaCache` interface is defined in `types.ts`
- **THEN** it SHALL include `profile_image_url: string | null`

#### Scenario: Published interface simplified
- **WHEN** the `Published` interface is defined in `types.ts`
- **THEN** it SHALL contain `id`, `chat_id`, `draft_id`, `pr_number`, `published_at`
- **AND** `tweet_ids`, `tweet_url`, `image_url` fields SHALL be removed

#### Scenario: PublishTargets type defined
- **WHEN** `PublishTargets` is defined in `types.ts`
- **THEN** it SHALL be `{ x: boolean, instagram_post: boolean, instagram_story: boolean, instagram_reel: boolean }`

#### Scenario: PublishResults type defined
- **WHEN** `PublishResults` is defined in `types.ts`
- **THEN** it SHALL have optional per-platform result objects: `x?: { tweet_ids: string[], url: string }`, `instagram_post?: { post_id: string, url: string }`, `instagram_story?: { post_id: string, url: null }`, `instagram_reel?: { post_id: string, url: string }`, `errors?: Record<string, string>`

### Requirement: Schema.sql updated
The `schema.sql` file SHALL be updated to include all new columns and fix the existing Instagram column gap.

#### Scenario: Schema file reflects current state
- **WHEN** a developer reads `schema.sql`
- **THEN** it SHALL include all columns from the migration (publish_targets, publish_results, has_video on drafts; default_publish_targets, own_profile_image_url, own_username_x, own_display_name_x, instagram_token_enc, instagram_account_id_enc, has_instagram on users; author_profile_image_url, author_display_name on twitter_tweets; profile_image_url on twitter_accounts and persona_cache)

### Requirement: Draft DB functions updated
The `draft-db.ts` SHALL be updated to handle new columns in CRUD operations.

#### Scenario: createDraft includes publish_targets
- **WHEN** `createDraft()` is called
- **THEN** it SHALL accept and store `publish_targets` (defaulting to user's `default_publish_targets`)

#### Scenario: updateDraftPublishTargets function
- **WHEN** `updateDraftPublishTargets(env, draftId, chatId, targets)` is called
- **THEN** it SHALL UPDATE the `publish_targets` column on the specified draft

#### Scenario: updateDraftPublishResults function
- **WHEN** `updateDraftPublishResults(env, draftId, chatId, results)` is called
- **THEN** it SHALL UPDATE the `publish_results` column on the specified draft

#### Scenario: getDraft returns new columns
- **WHEN** `getDraft(env, draftId, chatId)` is called
- **THEN** the returned `Draft` object SHALL include `publish_targets`, `publish_results`, and `has_video`

### Requirement: R2 storage new namespaces
The R2 IMAGES bucket SHALL support new key namespaces for tweet cards, profile images, and font/emoji assets.

#### Scenario: Tweet card storage
- **WHEN** a tweet card image is stored
- **THEN** the R2 key SHALL follow the pattern `tweet-cards/{draftId}/{index}.png`

#### Scenario: Profile image storage
- **WHEN** a profile image is cached
- **THEN** the R2 key SHALL follow the pattern `profiles/{username}.jpg`

#### Scenario: Font storage
- **WHEN** font files are stored for Satori
- **THEN** the R2 keys SHALL be `fonts/inter-regular.woff2` and `fonts/inter-bold.woff2`

#### Scenario: Emoji SVG storage
- **WHEN** Twemoji SVGs are cached
- **THEN** the R2 keys SHALL follow the pattern `emoji/{codepoint}.svg`
