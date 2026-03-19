## MODIFIED Requirements

### Requirement: Grok generates structured JSON image prompt
The system prompt for content generation SHALL instruct Gemini to return `imagePrompt` as a structured JSON object matching the `ImagePromptData` schema, with each field meaningfully derived from the commit messages, file names, and the repo overview's visual_theme (when available). When a visual_theme is present, the `environment.color_palette` and `composition.style` fields SHALL reflect the repo's brand identity for visual consistency across posts.

#### Scenario: Generated imagePrompt uses repo visual theme
- **WHEN** Gemini generates content from commit messages and file names with a repo overview containing visual_theme "Warm earth tones, minimalist, Bauhaus-inspired"
- **THEN** the returned `imagePrompt.environment.color_palette` SHALL incorporate the specified color direction
- **AND** `imagePrompt.composition.style` SHALL align with the specified visual style

#### Scenario: Generated imagePrompt without repo visual theme
- **WHEN** Gemini generates content from commit messages and file names without a repo overview
- **THEN** the returned `imagePrompt` object SHALL contain `concept`, `composition`, `environment`, and `technical` categories with meaningful values derived solely from the code change (current behavior preserved)
