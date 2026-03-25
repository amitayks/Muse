-- Repo default settings for new repos
ALTER TABLE users ADD COLUMN repo_auto_overview INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN repo_default_watch_pushes INTEGER DEFAULT 1;
