-- Migration 005: Add language column to users table
-- Phase 1 i18n: Global user-level language setting

ALTER TABLE users ADD COLUMN language TEXT DEFAULT 'en';
