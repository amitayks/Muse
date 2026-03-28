-- Add Claude as an alternative AI text provider
ALTER TABLE users ADD COLUMN ai_provider TEXT DEFAULT 'gemini';
ALTER TABLE users ADD COLUMN claude_key_enc TEXT;
ALTER TABLE users ADD COLUMN has_claude INTEGER DEFAULT 0;
