-- Migration 014: Identity prompt type separation
-- Adds identity_lang_notified column for one-time language switch notification tracking.
-- The 'identity' prompt type rows in default_prompts are seeded via seedDefaultPrompts().

ALTER TABLE users ADD COLUMN identity_lang_notified TEXT DEFAULT '';
