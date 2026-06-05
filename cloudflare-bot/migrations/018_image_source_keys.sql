-- Migration 018: Multi-image image drafts (source_image_keys)
-- Image create compose can now use multiple reference images per generation.
-- Store all source image R2 keys as a JSON-encoded array so delete can clean up
-- every source image from R2. The legacy single-value source_image_key column is
-- retained for back-compat (first key). Additive only (D1 has no ALTER COLUMN).

ALTER TABLE image_drafts ADD COLUMN source_image_keys TEXT;
