-- Migration 006: Prompt storage tables
-- Phase 2: Move hardcoded system prompts into DB with per-language variants and user customization

CREATE TABLE IF NOT EXISTS default_prompts (
  prompt_type TEXT NOT NULL,
  language TEXT NOT NULL,
  content TEXT NOT NULL,
  version INTEGER DEFAULT 1,
  updated_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (prompt_type, language)
);

CREATE TABLE IF NOT EXISTS user_prompts (
  chat_id TEXT NOT NULL,
  prompt_type TEXT NOT NULL,
  language TEXT NOT NULL,
  content TEXT NOT NULL,
  based_on_version INTEGER DEFAULT 1,
  updated_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (chat_id, prompt_type, language),
  FOREIGN KEY (chat_id) REFERENCES users(chat_id)
);
