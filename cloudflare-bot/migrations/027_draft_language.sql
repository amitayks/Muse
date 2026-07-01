-- Migration 027: Add per-draft content language
-- A draft remembers the content language it was authored in (langOverride ?? globalLang)
-- so AI refine respects it instead of defaulting to English. Nullable, no backfill:
-- legacy NULL rows fall back to content detection then the user's global language at refine time.
ALTER TABLE drafts ADD COLUMN language TEXT;
