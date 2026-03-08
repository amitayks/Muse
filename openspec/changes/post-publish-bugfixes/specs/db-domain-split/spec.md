## MODIFIED Requirements

### Requirement: Domain-specific database files
The system SHALL organize database operations into domain-specific files within `src/data/`:
- `draft-db.ts` — drafts table + published table CRUD
- `user-settings-db.ts` — users table operations (chat state, language, timezone, page size)
- `repo-db.ts` — repos table + repo_overviews table CRUD
- `video-db.ts` — video_drafts, video_published, video_presets tables + video settings + video cron helpers
- `twitter-db.ts` — twitter_accounts, twitter_account_overviews, twitter_tweets tables + config parsing
- `persona-db.ts` — persona_cache table CRUD

Each file SHALL contain only functions that operate on its domain's tables.

#### Scenario: Functions grouped by table domain
- **WHEN** a developer looks for draft-related DB operations
- **THEN** all draft and published functions are located in `draft-db.ts`

#### Scenario: Video functions consolidated
- **WHEN** `getStaleGeneratingDraftsByUser` and `getScheduledVideoDraftsByUser` query `video_drafts` table
- **THEN** they SHALL be placed in `video-db.ts`, not `draft-db.ts`

#### Scenario: createPublished accepts multi-platform results
- **WHEN** `createPublished()` is called after a successful publish
- **THEN** it SHALL accept optional parameters: `tweet_ids` (string or null), `tweet_url` (string or null), `instagram_post_id` (string or null), `instagram_url` (string or null)
- **AND** the INSERT statement SHALL include all columns: `id, chat_id, draft_id, pr_number, tweet_ids, tweet_url, instagram_post_id, instagram_url`

#### Scenario: createPublished for Instagram-only publish
- **WHEN** `createPublished()` is called with `tweet_ids = null` and `instagram_post_id = "12345"`
- **THEN** the published record SHALL be inserted successfully with `tweet_ids` as NULL

#### Scenario: createPublished for X-only publish (backward compatible)
- **WHEN** `createPublished()` is called with `tweet_ids = "111,222"` and `instagram_post_id = null`
- **THEN** the published record SHALL be inserted successfully with Instagram columns as NULL

## ADDED Requirements

### Requirement: Published table supports nullable tweet_ids and Instagram columns
The `published` table SHALL allow `tweet_ids` to be NULL and SHALL include columns for Instagram publish results.

#### Scenario: Published table schema for new installations
- **WHEN** the database is created from `schema.sql`
- **THEN** the `published` table SHALL have: `tweet_ids TEXT` (nullable), `instagram_post_id TEXT` (nullable), `instagram_url TEXT` (nullable)

#### Scenario: Migration 010 makes tweet_ids nullable
- **WHEN** migration `010_published_nullable_tweet_ids.sql` runs on an existing database
- **THEN** the `published` table SHALL be recreated using rename-copy-drop:
  1. `ALTER TABLE published RENAME TO published_old`
  2. `CREATE TABLE published` with `tweet_ids TEXT` (no NOT NULL), plus new `instagram_post_id TEXT` and `instagram_url TEXT` columns
  3. `INSERT INTO published (...) SELECT ..., NULL, NULL FROM published_old` to preserve existing data
  4. `DROP TABLE published_old`
- **AND** all existing published records SHALL be preserved with their original `tweet_ids` values
- **AND** new `instagram_post_id` and `instagram_url` columns SHALL be NULL for migrated records

#### Scenario: Published TypeScript type updated
- **WHEN** the `Published` interface in `types.ts` is used
- **THEN** `tweet_ids` SHALL be `string | null`, and `instagram_post_id` and `instagram_url` SHALL be `string | null`
