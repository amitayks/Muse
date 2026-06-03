-- Migration 007: Rename prompt types to skill names + add who-am-i identity skill
-- Part of the identity-skills-rewrite change

-- ===== Rename prompt_type values in default_prompts =====
UPDATE default_prompts SET prompt_type = 'work-progress' WHERE prompt_type = 'content';
UPDATE default_prompts SET prompt_type = 'refine' WHERE prompt_type = 'edit';
UPDATE default_prompts SET prompt_type = 'quote' WHERE prompt_type = 'repost';
UPDATE default_prompts SET prompt_type = 'know-my-project' WHERE prompt_type = 'overview';
UPDATE default_prompts SET prompt_type = 'what-i-like' WHERE prompt_type = 'scoring';
UPDATE default_prompts SET prompt_type = 'image-gen' WHERE prompt_type = 'handwrite_image';
-- persona and video stay unchanged

-- Remove handwrite_refine (merged into refine)
DELETE FROM default_prompts WHERE prompt_type = 'handwrite_refine';

-- ===== Rename prompt_type values in user_prompts =====
UPDATE user_prompts SET prompt_type = 'work-progress' WHERE prompt_type = 'content';
UPDATE user_prompts SET prompt_type = 'refine' WHERE prompt_type = 'edit';
UPDATE user_prompts SET prompt_type = 'quote' WHERE prompt_type = 'repost';
UPDATE user_prompts SET prompt_type = 'know-my-project' WHERE prompt_type = 'overview';
UPDATE user_prompts SET prompt_type = 'what-i-like' WHERE prompt_type = 'scoring';
UPDATE user_prompts SET prompt_type = 'image-gen' WHERE prompt_type = 'handwrite_image';

-- Remove handwrite_refine user customizations (merged into refine)
DELETE FROM user_prompts WHERE prompt_type = 'handwrite_refine';

-- ===== Insert who-am-i skeleton defaults =====
INSERT OR IGNORE INTO default_prompts (prompt_type, language, content, version, updated_at)
VALUES ('who-am-i', 'en', 'I''m a tech professional who shares my work online. I prefer clear, direct communication. [No specific patterns analyzed yet — using neutral baseline until identity is built.]', 1, datetime('now'));

INSERT OR IGNORE INTO default_prompts (prompt_type, language, content, version, updated_at)
VALUES ('who-am-i', 'he', 'אני איש/אשת טכנולוגיה שמשתף/ת את העבודה שלי אונליין. אני מעדיף/ה תקשורת ברורה וישירה. [עדיין לא נותחו דפוסים ספציפיים — משתמש/ת בבסיס ניטרלי עד שהזהות תיבנה.]', 1, datetime('now'));
