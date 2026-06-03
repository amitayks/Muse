-- Migration 010: Make published.tweet_ids nullable, add Instagram result columns
-- SQLite doesn't support ALTER COLUMN, so we recreate the table.

-- Step 1: Rename existing table
ALTER TABLE published RENAME TO published_old;

-- Step 2: Create new table with tweet_ids nullable and Instagram columns
CREATE TABLE IF NOT EXISTS published (
  id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL,
  draft_id TEXT NOT NULL,
  pr_number INTEGER NOT NULL,
  tweet_ids TEXT,
  tweet_url TEXT,
  image_url TEXT,
  instagram_post_id TEXT,
  instagram_url TEXT,
  published_at TEXT DEFAULT (datetime('now'))
);

-- Step 3: Copy existing data (new columns default to NULL)
INSERT INTO published (id, chat_id, draft_id, pr_number, tweet_ids, tweet_url, image_url, published_at)
SELECT id, chat_id, draft_id, pr_number, tweet_ids, tweet_url, image_url, published_at
FROM published_old;

-- Step 4: Drop old table
DROP TABLE published_old;

-- Step 5: Recreate index
CREATE INDEX IF NOT EXISTS idx_published_pr ON published(pr_number);
