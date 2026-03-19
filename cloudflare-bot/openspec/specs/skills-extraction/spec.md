## MODIFIED Requirements

### Requirement: Individual skill prompt files
Each of the 10 skill types SHALL have its own file in `src/skills/` containing both EN and HE prompt exports. File names SHALL match the skill type kebab-case name (e.g., `work-progress.ts`, `who-am-i.ts`, `identity-default.ts`).

#### Scenario: Skill file contains both languages
- **WHEN** a developer opens `src/skills/refine.ts`
- **THEN** the file exports `REFINE_EN` and `REFINE_HE` constants

#### Scenario: Identity default file exists with skeleton content
- **WHEN** a developer opens `src/skills/identity-default.ts`
- **THEN** the file exports `IDENTITY_DEFAULT_EN` and `IDENTITY_DEFAULT_HE` constants containing first-person skeleton identity text (NOT analysis instructions)

#### Scenario: All 10 skills have individual files
- **WHEN** listing files in `src/skills/`
- **THEN** there are exactly 10 skill files: `work-progress.ts`, `refine.ts`, `quote.ts`, `video.ts`, `know-my-project.ts`, `persona.ts`, `what-i-like.ts`, `who-am-i.ts`, `image-gen.ts`, `identity-default.ts`

### Requirement: Barrel index with re-exports and seeding helper
`src/skills/index.ts` SHALL re-export all 20 prompt constants (10 EN + 10 HE) and SHALL export a `getDefaultPromptTexts()` function returning the array used by `seedDefaultPrompts()`.

#### Scenario: Single import point for prompts.ts
- **WHEN** `prompts.ts` imports skill prompts
- **THEN** it uses a single import from `../skills` (or `../skills/index`)

#### Scenario: getDefaultPromptTexts returns all 20 entries
- **WHEN** `getDefaultPromptTexts()` is called
- **THEN** it returns an array of 20 objects `{ type, language, content }` covering all 10 types x 2 languages, with the `identity-default.ts` content mapped to prompt type `'identity'`
