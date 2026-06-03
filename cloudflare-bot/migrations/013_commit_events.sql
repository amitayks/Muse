-- Commit events table — stores webhook and /generate events before AI generation
-- Mirrors twitter_tweets role: store source data, let user decide when to generate
CREATE TABLE IF NOT EXISTS commit_events (
  id TEXT PRIMARY KEY,
  repo_id TEXT NOT NULL,
  chat_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  commit_sha TEXT NOT NULL,
  pr_number INTEGER,
  title TEXT NOT NULL,
  author TEXT NOT NULL,
  branch TEXT NOT NULL,
  files_changed INTEGER DEFAULT 0,
  additions INTEGER DEFAULT 0,
  deletions INTEGER DEFAULT 0,
  commit_count INTEGER DEFAULT 1,
  source_data TEXT NOT NULL,
  status TEXT DEFAULT 'notified',
  draft_id TEXT,
  message_id INTEGER,
  event_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(chat_id, commit_sha)
);

CREATE INDEX IF NOT EXISTS idx_commit_events_chat ON commit_events(chat_id);
CREATE INDEX IF NOT EXISTS idx_commit_events_repo ON commit_events(repo_id);
CREATE INDEX IF NOT EXISTS idx_commit_events_status ON commit_events(status);
CREATE INDEX IF NOT EXISTS idx_commit_events_sha ON commit_events(chat_id, commit_sha);

-- Add event_id to drafts for linking back to source commit event
ALTER TABLE drafts ADD COLUMN event_id TEXT;
