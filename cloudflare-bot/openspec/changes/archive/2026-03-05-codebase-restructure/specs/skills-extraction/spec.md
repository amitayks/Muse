## ADDED Requirements

### Requirement: Individual skill prompt files
Each of the 9 skill types SHALL have its own file in `src/skills/` containing both EN and HE prompt exports. File names SHALL match the skill type kebab-case name (e.g., `work-progress.ts`, `who-am-i.ts`).

#### Scenario: Skill file contains both languages
- **WHEN** a developer opens `src/skills/refine.ts`
- **THEN** the file exports `REFINE_EN` and `REFINE_HE` constants

#### Scenario: All 9 skills have individual files
- **WHEN** listing files in `src/skills/`
- **THEN** there are exactly 9 skill files: `work-progress.ts`, `refine.ts`, `quote.ts`, `video.ts`, `know-my-project.ts`, `persona.ts`, `what-i-like.ts`, `who-am-i.ts`, `image-gen.ts`

### Requirement: Barrel index with re-exports and seeding helper
`src/skills/index.ts` SHALL re-export all 18 prompt constants (9 EN + 9 HE) and SHALL export a `getDefaultPromptTexts()` function returning the array used by `seedDefaultPrompts()`.

#### Scenario: Single import point for prompts.ts
- **WHEN** `prompts.ts` imports skill prompts
- **THEN** it uses a single import from `../skills` (or `../skills/index`)

#### Scenario: getDefaultPromptTexts returns all 18 entries
- **WHEN** `getDefaultPromptTexts()` is called
- **THEN** it returns an array of 18 objects `{ type, language, content }` covering all 9 types x 2 languages

### Requirement: Old monolithic prompt files removed
After migration, `src/services/skill-prompts-en.ts` and `src/services/skill-prompts-he.ts` SHALL be deleted. No references to these files SHALL remain.

#### Scenario: No imports from old files
- **WHEN** searching the codebase for `skill-prompts-en` or `skill-prompts-he`
- **THEN** zero matches are found
