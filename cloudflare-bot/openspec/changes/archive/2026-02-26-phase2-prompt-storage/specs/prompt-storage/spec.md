## ADDED Requirements

### Requirement: Default prompts table
The system SHALL have a `default_prompts` table with columns: `prompt_type TEXT`, `language TEXT`, `content TEXT`, `version INTEGER DEFAULT 1`, `updated_at TEXT`. Primary key SHALL be `(prompt_type, language)`.

#### Scenario: Default prompt exists for content/en
- **WHEN** the system queries `default_prompts` for type `'content'` and language `'en'`
- **THEN** it SHALL return the seeded content generation system prompt text with version 1

#### Scenario: All 7 prompt types seeded in English
- **WHEN** the migration runs
- **THEN** `default_prompts` SHALL contain rows for all 7 types (`content`, `edit`, `repost`, `video`, `overview`, `persona`, `scoring`) with language `'en'`

### Requirement: User prompts table
The system SHALL have a `user_prompts` table with columns: `chat_id TEXT`, `prompt_type TEXT`, `language TEXT`, `content TEXT`, `based_on_version INTEGER DEFAULT 1`, `updated_at TEXT`. Primary key SHALL be `(chat_id, prompt_type, language)`. Foreign key on `chat_id` references `users(chat_id)`.

#### Scenario: User has customized content prompt
- **WHEN** a user has saved a custom content prompt in English
- **THEN** `user_prompts` SHALL contain a row with their `chat_id`, `prompt_type='content'`, `language='en'`, and their custom text

#### Scenario: User has not customized any prompt
- **WHEN** a new user has never edited prompts
- **THEN** `user_prompts` SHALL have zero rows for that user's `chat_id`

### Requirement: Prompt resolution with fallback
The system SHALL provide a `getPrompt(env, chatId, type, lang)` function that resolves the active prompt with three-level fallback: (1) user custom prompt, (2) global default in requested language, (3) global default in English.

#### Scenario: User has custom prompt
- **WHEN** `getPrompt(env, '123', 'content', 'he')` is called and user 123 has a custom Hebrew content prompt
- **THEN** it SHALL return the user's custom Hebrew prompt text

#### Scenario: User has no custom, default exists
- **WHEN** `getPrompt(env, '123', 'content', 'he')` is called, user 123 has no custom prompt, and a Hebrew default exists
- **THEN** it SHALL return the global default Hebrew content prompt

#### Scenario: No custom, no target language default, English fallback
- **WHEN** `getPrompt(env, '123', 'content', 'he')` is called, user has no custom, and no Hebrew default exists
- **THEN** it SHALL fall back to the English default content prompt

### Requirement: Prompt type constants
The system SHALL define a `PromptType` union type with values `'content' | 'edit' | 'repost' | 'video' | 'overview' | 'persona' | 'scoring'`. It SHALL also export `USER_EDITABLE_PROMPTS` array containing `['content', 'edit', 'repost']` and `ALL_PROMPTS` containing all 7 types.

#### Scenario: Type safety for prompt operations
- **WHEN** a function accepts a `PromptType` parameter
- **THEN** only the 7 valid prompt type strings SHALL be accepted at compile time

### Requirement: Save user prompt
The system SHALL provide a `saveUserPrompt(env, chatId, type, lang, content)` function that upserts a row in `user_prompts` with the current default version as `based_on_version`.

#### Scenario: First-time save
- **WHEN** `saveUserPrompt(env, '123', 'content', 'en', 'My custom prompt')` is called and no existing row exists
- **THEN** a new row SHALL be inserted with `based_on_version` set to the current `default_prompts.version` for that type/lang

#### Scenario: Update existing custom prompt
- **WHEN** `saveUserPrompt()` is called and a row already exists
- **THEN** the row SHALL be updated with new content and refreshed `based_on_version` and `updated_at`

### Requirement: Delete user prompt (reset to default)
The system SHALL provide a `deleteUserPrompt(env, chatId, type, lang)` function that removes the user's custom prompt, reverting them to the global default.

#### Scenario: Reset custom prompt
- **WHEN** `deleteUserPrompt(env, '123', 'content', 'en')` is called
- **THEN** the row SHALL be deleted from `user_prompts`
- **AND** subsequent `getPrompt()` calls SHALL return the global default

### Requirement: Update default prompt with version bump
The system SHALL provide an `updateDefaultPrompt(env, type, lang, content)` function that updates the default prompt content and increments the `version` by 1.

#### Scenario: Admin pushes new default
- **WHEN** `updateDefaultPrompt(env, 'content', 'en', 'Updated prompt...')` is called with current version 3
- **THEN** the row SHALL be updated with new content, `version` set to 4, and `updated_at` refreshed

### Requirement: User prompt staleness check
The system SHALL provide a `getUserPromptStatus(env, chatId, type, lang)` function that returns whether the user has a custom prompt and whether it's stale (based on older default version).

#### Scenario: User has stale custom prompt
- **WHEN** user's `based_on_version` is 2 and current default version is 4
- **THEN** `getUserPromptStatus()` SHALL return `{ isCustom: true, isStale: true, basedOnVersion: 2, currentVersion: 4 }`

#### Scenario: User has up-to-date custom prompt
- **WHEN** user's `based_on_version` equals the current default version
- **THEN** `getUserPromptStatus()` SHALL return `{ isCustom: true, isStale: false, ... }`

#### Scenario: User has no custom prompt
- **WHEN** no `user_prompts` row exists for the user/type/lang
- **THEN** `getUserPromptStatus()` SHALL return `{ isCustom: false, isStale: false, basedOnVersion: 0, currentVersion: N }`
