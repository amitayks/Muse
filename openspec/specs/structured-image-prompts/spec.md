## Requirements

### Requirement: ImagePromptData type for structured image prompts
The system SHALL define an `ImagePromptData` interface with four categories: `concept` (main_subject, symbolic_elements, mood), `composition` (style, perspective, focal_point), `environment` (setting, lighting, color_palette), and `technical` (medium, quality, negative).

#### Scenario: Type definition exists
- **WHEN** the codebase is compiled
- **THEN** `ImagePromptData` is a valid TypeScript interface importable from `types.ts`

### Requirement: DraftContent.imagePrompt uses ImagePromptData
The `DraftContent.imagePrompt` field SHALL accept `ImagePromptData | string | undefined` to support both new structured prompts and backwards compatibility with existing drafts stored in the database.

#### Scenario: New draft has structured imagePrompt
- **WHEN** Grok generates content for a new draft
- **THEN** `DraftContent.imagePrompt` contains an `ImagePromptData` object

#### Scenario: Old draft has string imagePrompt
- **WHEN** an existing draft with a string imagePrompt is loaded from the database
- **THEN** the system handles it without errors

### Requirement: Grok generates structured JSON image prompt
The system prompt for content generation SHALL instruct Gemini to return `imagePrompt` as a structured JSON object matching the `ImagePromptData` schema, with each field meaningfully derived from the commit messages, file names, and the repo overview's visual_theme (when available). When a visual_theme is present, the `environment.color_palette` and `composition.style` fields SHALL reflect the repo's brand identity for visual consistency across posts.

#### Scenario: Generated imagePrompt has all four categories
- **WHEN** Grok generates content from commit messages and file names
- **THEN** the returned `imagePrompt` object contains `concept`, `composition`, `environment`, and `technical` categories with meaningful values related to the actual code change

#### Scenario: Generated imagePrompt uses repo visual theme
- **WHEN** Gemini generates content from commit messages and file names with a repo overview containing visual_theme "Warm earth tones, minimalist, Bauhaus-inspired"
- **THEN** the returned `imagePrompt.environment.color_palette` SHALL incorporate the specified color direction
- **AND** `imagePrompt.composition.style` SHALL align with the specified visual style

#### Scenario: Generated imagePrompt without repo visual theme
- **WHEN** Gemini generates content from commit messages and file names without a repo overview
- **THEN** the returned `imagePrompt` object SHALL contain `concept`, `composition`, `environment`, and `technical` categories with meaningful values derived solely from the code change (current behavior preserved)

### Requirement: Image prompt consolidation to prose
The `generateImage()` function SHALL convert structured `ImagePromptData` into a prose description via `consolidateImagePrompt()` before sending to the image API. This produces better results than raw JSON as the image model interprets descriptive text more effectively.

#### Scenario: Image generation with structured prompt
- **WHEN** `generateImage()` receives a `DraftContent` with an `ImagePromptData` object
- **THEN** it calls `consolidateImagePrompt(imagePrompt)` to convert the structured data to a descriptive prose string
- **AND** sends the prose string as the prompt to the image API

#### Scenario: Image generation with legacy string prompt
- **WHEN** `generateImage()` receives a `DraftContent` with a string `imagePrompt`
- **THEN** it sends the string directly as the prompt (backwards compatibility)

### Requirement: Fallback image prompt produces ImagePromptData
The `buildImagePrompt()` fallback function SHALL return an `ImagePromptData` object (not a string) when Grok fails to produce a valid structured image prompt.

#### Scenario: Grok omits imagePrompt
- **WHEN** Grok's response does not include an imagePrompt field
- **THEN** `buildImagePrompt()` generates a default `ImagePromptData` object based on the tweet text content

#### Scenario: Grok returns invalid imagePrompt
- **WHEN** Grok returns an imagePrompt that is not a valid ImagePromptData object
- **THEN** the system falls back to `buildImagePrompt()` to generate a valid `ImagePromptData`
