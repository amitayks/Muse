-- Migration 019: Identity analysis depth
-- Adds identity_tweet_count column controlling how many tweets the identity
-- analysis reads (allowed values 100, 200, 400; default 200).

ALTER TABLE users ADD COLUMN identity_tweet_count INTEGER DEFAULT 200;
