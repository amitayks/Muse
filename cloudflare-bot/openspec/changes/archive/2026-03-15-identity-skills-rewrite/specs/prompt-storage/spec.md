## MODIFIED Requirements

### Requirement: Prompt type constants
The system SHALL define a `PromptType` union type with values `'work-progress' | 'refine' | 'quote' | 'video' | 'know-my-project' | 'persona' | 'what-i-like' | 'who-am-i' | 'image-gen'`. The old types (`content`, `edit`, `repost`, `overview`, `scoring`, `identity`, `handwrite_refine`, `handwrite_image`) SHALL all be replaced with the new names. It SHALL export `USER_EDITABLE_SKILLS` array containing `['work-progress', 'refine', 'quote', 'who-am-i']` (expanded from 3 to 4) and `ALL_SKILLS` containing all 9 types.

#### Scenario: Type safety for prompt operations
- **WHEN** a function accepts a `PromptType` parameter
- **THEN** only the 9 valid prompt type strings SHALL be accepted at compile time

#### Scenario: User-editable list includes identity
- **WHEN** `USER_EDITABLE_SKILLS` is checked
- **THEN** it SHALL contain `['work-progress', 'refine', 'quote', 'who-am-i']`

### Requirement: Default prompts table
The system SHALL have a `default_prompts` table with columns: `prompt_type TEXT`, `language TEXT`, `content TEXT`, `version INTEGER DEFAULT 1`, `updated_at TEXT`. Primary key SHALL be `(prompt_type, language)`.

#### Scenario: All prompt types seeded
- **WHEN** the migration runs
- **THEN** `default_prompts` SHALL contain rows for all 9 types (`work-progress`, `refine`, `quote`, `video`, `know-my-project`, `persona`, `what-i-like`, `who-am-i`, `image-gen`) with language `'en'` and `'he'`, totaling 18 rows

#### Scenario: Identity skill seeded
- **WHEN** the migration seeds `who-am-i` prompt type
- **THEN** the `default_prompts` row for `who-am-i/en` SHALL contain the `/who-am-i` analysis skill prompt (the instructions for generating identity documents)

### Requirement: Prompt resolution with fallback
The system SHALL provide a `getPrompt(env, chatId, type, lang)` function that resolves the active prompt with three-level fallback: (1) user custom prompt, (2) global default in requested language, (3) global default in English.

#### Scenario: User has custom prompt
- **WHEN** `getPrompt(env, '123', 'work-progress', 'he')` is called and user 123 has a custom Hebrew work-progress skill
- **THEN** it SHALL return the user's custom Hebrew prompt text

#### Scenario: User has no custom, default exists
- **WHEN** `getPrompt(env, '123', 'work-progress', 'he')` is called, user 123 has no custom prompt, and a Hebrew default exists
- **THEN** it SHALL return the global default Hebrew work-progress skill

#### Scenario: No custom, no target language default, English fallback
- **WHEN** `getPrompt(env, '123', 'work-progress', 'he')` is called, user has no custom, and no Hebrew default exists
- **THEN** it SHALL fall back to the English default work-progress skill

#### Scenario: Identity resolution
- **WHEN** `getPrompt(env, '123', 'who-am-i', 'en')` is called
- **THEN** it SHALL follow the same three-level fallback: user's identity document → default identity → English default identity

### Requirement: Prompt assembly function
The system SHALL provide a `assembleSystemInstruction(env, chatId, type, lang)` function that builds the complete system instruction for identity-attached skills by concatenating: (1) the skill prompt from `getPrompt(env, chatId, type, lang)`, (2) the user's identity document from `getPrompt(env, chatId, 'who-am-i', lang)`, (3) the task protocol section. For utility skills (`persona`), it SHALL skip the identity layer. For `image-gen`, it is never called standalone — it is appended to the calling skill's assembly.

#### Scenario: Assembly for identity-attached skill
- **WHEN** `assembleSystemInstruction(env, '123', 'work-progress', 'en')` is called
- **THEN** it SHALL return the concatenation of: work-progress skill prompt + user 123's identity document + task protocol

#### Scenario: Assembly for utility skill
- **WHEN** `assembleSystemInstruction(env, '123', 'persona', 'en')` is called
- **THEN** it SHALL return only the persona skill prompt + persona task protocol (no identity layer)

#### Scenario: Assembly without custom identity
- **WHEN** `assembleSystemInstruction()` is called for an identity-attached skill and the user has no custom identity document
- **THEN** it SHALL fall back to the default skeleton identity from `default_prompts` — identity is always present

## ADDED Requirements

### Requirement: Identity-attached skill list constant
The system SHALL export an `IDENTITY_ATTACHED_SKILLS` array containing the prompt types that receive identity injection: `['work-progress', 'refine', 'quote', 'video', 'know-my-project', 'what-i-like']`. This SHALL be used by `assembleSystemInstruction()` to determine whether to include the identity layer.

#### Scenario: Check if skill needs identity
- **WHEN** `assembleSystemInstruction()` determines whether to include identity
- **THEN** it SHALL check `IDENTITY_ATTACHED_SKILLS.includes(type)` to decide

## REMOVED Requirements

### Requirement: handwrite_refine prompt type
The `handwrite_refine` prompt type SHALL be removed from `PromptType` and `ALL_SKILLS`. Its functionality is merged into the `refine` skill type.

**Reason**: The `handwrite_refine` and `edit` prompts perform the same task (refine existing text in the user's voice) with different entry points. Consolidating them into a single `/refine` skill reduces duplication and ensures consistent voice across both flows.

**Migration**: All references to `handwrite_refine` SHALL use `refine` instead. The `default_prompts` row for `handwrite_refine` SHALL be removed after the new `refine` skill is seeded. The `refineHandwrittenContent()` function SHALL call `getPrompt(env, chatId, 'refine', lang)` instead of `getPrompt(env, chatId, 'handwrite_refine', lang)`.
