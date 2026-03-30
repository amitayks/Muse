## ADDED Requirements

### Requirement: Thumbnail prompt skill registration
A new `thumbnail` prompt type SHALL be registered in the skill/prompt system. The skill SHALL be added to:
- `PromptType` union type in `ai/prompts.ts`
- `ALL_SKILLS` array in `ai/prompts.ts`
- `USER_EDITABLE_SKILLS` array in `ai/prompts.ts` (so users can customize it via the webapp)
- `ADMIN_EDITABLE_SKILLS` array in `ai/prompts.ts`
- `getDefaultPromptTexts()` in `skills/index.ts` (for seeding)

The skill SHALL NOT be added to `IDENTITY_ATTACHED_SKILLS` — the thumbnail prompt does not receive identity injection.

#### Scenario: Thumbnail skill in editable list
- **WHEN** the user opens the webapp skills editor
- **THEN** the "thumbnail" skill is listed as an editable skill

#### Scenario: Thumbnail skill NOT identity-attached
- **WHEN** `assembleSystemInstruction()` is called with type `thumbnail`
- **THEN** no identity document is appended to the prompt

### Requirement: Default thumbnail prompt template
The default prompt for the `thumbnail` skill SHALL contain the full thumbnail generation prompt with four placeholders: `[TITLE]`, `[GLOW_COLOR]`, `[ICONS]`, `[ASPECT]`. The prompt SHALL be stored in English only (the prompt instructs an image model and is always in English regardless of user language).

The default prompt content is the user-provided prompt covering: design philosophy, warm studio color grade, cinematic edge gradient, title text placement with Space Grotesk, floating tech icons, subtle branding mark, composition rules, and a DO NOT list.

#### Scenario: Default prompt seeded on migration
- **WHEN** the migration/seed process runs
- **THEN** a `default_prompts` row is created with `prompt_type='thumbnail'`, `language='en'`, and the full prompt content

#### Scenario: Prompt contains all four placeholders
- **WHEN** the default thumbnail prompt is loaded
- **THEN** it contains the literal strings `[TITLE]`, `[GLOW_COLOR]`, `[ICONS]`, `[ASPECT]`

### Requirement: Prompt placeholder substitution
When composing the final prompt for Gemini, the system SHALL load the `thumbnail` skill prompt via `getPrompt(env, chatId, 'thumbnail', 'en')` and replace placeholders with the user's input values:
- `[TITLE]` → the title from the compose state
- `[GLOW_COLOR]` → the color from the compose state
- `[ICONS]` → the icons from the compose state
- `[ASPECT]` → the aspect ratio from the compose state (e.g., `16:9`)

The substitution SHALL use global replacement (all occurrences of each placeholder).

#### Scenario: All placeholders replaced
- **WHEN** title="Building a CLI", color="blue", icons="terminal, rust", ratio="16:9"
- **THEN** every occurrence of `[TITLE]` in the prompt is replaced with "Building a CLI"
- **AND** every occurrence of `[GLOW_COLOR]` is replaced with "blue"
- **AND** every occurrence of `[ICONS]` is replaced with "terminal, rust"
- **AND** every occurrence of `[ASPECT]` is replaced with "16:9"

### Requirement: User-customizable prompt
Users SHALL be able to edit the thumbnail prompt via the webapp skills editor, just like other editable skills (work-progress, refine, quote, identity). The customized prompt is stored per-user in `user_prompts` and takes precedence over the default.

#### Scenario: User edits thumbnail prompt
- **WHEN** the user saves a custom thumbnail prompt via the webapp
- **THEN** subsequent thumbnail generations use the custom prompt
- **AND** the custom prompt is stored in `user_prompts` with `prompt_type='thumbnail'`

#### Scenario: User resets to default prompt
- **WHEN** the user deletes their custom thumbnail prompt
- **THEN** subsequent generations fall back to the default prompt from `default_prompts`

### Requirement: No identity or additional skill injection
When building the prompt for thumbnail generation, the system SHALL load ONLY the `thumbnail` skill prompt. It SHALL NOT call `assembleSystemInstruction()` or append any identity document, image-gen skill, or other skill content. The Gemini API call receives only the composed prompt text and the user's base image.

#### Scenario: Gemini call contains only prompt and image
- **WHEN** the bot calls the Gemini image model for thumbnail generation
- **THEN** the request contains exactly one text part (the composed prompt) and one inline_data part (the base image)
- **AND** no identity or skill content is present beyond the thumbnail prompt itself
