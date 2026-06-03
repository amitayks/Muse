## Purpose

Defines the `PromptType` union and the user/admin/all editable-skill sets, tracks whether a user's stored prompt is stale relative to the default version (excluding identity from the stale count), and resolves identity injection in `assembleSystemInstruction` from the `identity` prompt type so the user's identity document is used rather than the `who-am-i` analysis skill.

## Requirements

### Requirement: Prompt type constants
The system SHALL define a `PromptType` union type with values `'work-progress' | 'refine' | 'quote' | 'video' | 'know-my-project' | 'persona' | 'what-i-like' | 'who-am-i' | 'identity' | 'image-gen'`. It SHALL export `USER_EDITABLE_SKILLS` array containing `['work-progress', 'refine', 'quote', 'identity']`, `ADMIN_EDITABLE_SKILLS` containing all 10 types, and `ALL_SKILLS` containing all 10 types. `IDENTITY_ATTACHED_SKILLS` SHALL resolve identity via `'identity'` prompt type (not `'who-am-i'`).

#### Scenario: Type safety for prompt operations
- **WHEN** a function accepts a `PromptType` parameter
- **THEN** only the 10 valid prompt type strings SHALL be accepted at compile time

#### Scenario: Identity is user-editable
- **WHEN** checking `USER_EDITABLE_SKILLS`
- **THEN** it SHALL include `'identity'`

#### Scenario: Identity and who-am-i are both admin-editable
- **WHEN** checking `ADMIN_EDITABLE_SKILLS`
- **THEN** it SHALL include both `'identity'` and `'who-am-i'`

### Requirement: User prompt staleness check
The system SHALL provide a `getUserPromptStatus(env, chatId, type, lang)` function that returns whether the user has a custom prompt and whether it's stale (based on older default version). The `countStalePrompts` function SHALL exclude `prompt_type = 'identity'` from the stale count.

#### Scenario: User has stale custom prompt
- **WHEN** user's `based_on_version` is 2 and current default version is 4
- **THEN** `getUserPromptStatus()` SHALL return `{ isCustom: true, isStale: true, basedOnVersion: 2, currentVersion: 4 }`

#### Scenario: User has up-to-date custom prompt
- **WHEN** user's `based_on_version` equals the current default version
- **THEN** `getUserPromptStatus()` SHALL return `{ isCustom: true, isStale: false, ... }`

#### Scenario: User has no custom prompt
- **WHEN** no `user_prompts` row exists for the user/type/lang
- **THEN** `getUserPromptStatus()` SHALL return `{ isCustom: false, isStale: false, basedOnVersion: 0, currentVersion: N }`

#### Scenario: Stale identity excluded from count
- **WHEN** user has a `user_prompts` row for `identity` with outdated `based_on_version`, and a stale `work-progress` prompt
- **THEN** `countStalePrompts()` SHALL return 1 (only counting work-progress, not identity)


### Requirement: System instruction resolves identity from identity prompt type
The `assembleSystemInstruction` function SHALL resolve identity injection using `getPrompt(env, chatId, 'identity', lang)` instead of `getPrompt(env, chatId, 'who-am-i', lang)`. This ensures the user's identity document (or skeleton default) is injected, never the analysis skill.

#### Scenario: Identity-attached skill assembles with user's analyzed identity
- **WHEN** `assembleSystemInstruction(env, chatId, 'work-progress', 'en')` is called and user has an analyzed identity in `user_prompts(chatId, 'identity', 'en')`
- **THEN** the system instruction SHALL contain the skill prompt + the user's analyzed identity document

#### Scenario: Identity-attached skill assembles with skeleton default
- **WHEN** `assembleSystemInstruction(env, chatId, 'work-progress', 'en')` is called and user has NO `user_prompts` row for `identity/en`
- **THEN** the system instruction SHALL contain the skill prompt + the skeleton default from `default_prompts('identity', 'en')`

#### Scenario: Assembly never includes analysis skill as identity
- **WHEN** `assembleSystemInstruction` resolves identity for any user
- **THEN** the resolved identity text SHALL never be the `who-am-i` analysis skill content from `default_prompts`
