-- Add commit default settings to users table
ALTER TABLE users ADD COLUMN commit_fast_image INTEGER DEFAULT 1;
ALTER TABLE users ADD COLUMN commit_fast_ai INTEGER DEFAULT 1;
