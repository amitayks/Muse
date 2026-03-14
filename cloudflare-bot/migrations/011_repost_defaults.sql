-- Migration 011: Add repost default settings to users table
-- fast_generate_image: whether Fast Generate also generates an image (default OFF)
-- analyze_source_image: whether source tweet image is analyzed by AI (default ON)

ALTER TABLE users ADD COLUMN fast_generate_image INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN analyze_source_image INTEGER DEFAULT 1;
