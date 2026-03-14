## MODIFIED Requirements

### Requirement: Multi-perspective system prompt for content generation
The system prompt for `generateContent()` SHALL be completely rewritten as the `/work-progress` skill using first-person self-narrative framing. Instead of instructing Gemini to "think from the perspective of" external experts (Tech Influencer, Copywriter, Growth Marketer, etc.), the skill SHALL frame the task as self-directed reflection: "I'm looking at my recent work and deciding what to share with my followers." The multi-perspective expert approach SHALL be replaced by the user's own Identity Document which provides authentic voice, tone, and perspective. When a repo overview is provided, it SHALL be framed as "my project" context, not external data.

#### Scenario: System prompt uses first-person self-narrative
- **WHEN** the `/work-progress` skill prompt is sent to Gemini for content generation
- **THEN** it SHALL be written in first-person ("I share my work because I genuinely care about what I build") with no second-person instructions or external expert perspective references

#### Scenario: Identity replaces multi-perspective experts
- **WHEN** the `/work-progress` skill is assembled with a user's Identity Document
- **THEN** the user's identity SHALL serve as the source of tone, perspective, and creative direction — replacing the former Tech Influencer, Copywriter, Growth Marketer, Community Manager, and Storyteller perspectives

#### Scenario: System prompt works without identity
- **WHEN** the `/work-progress` skill is assembled for a user with no Identity Document
- **THEN** it SHALL use the skill's self-narrative alone (neutral human voice, not corporate AI tone)

#### Scenario: Project overview framed as "my project"
- **WHEN** a repo overview is available during content generation
- **THEN** it SHALL be injected into the user prompt as "my project" context, not as external reference data

### Requirement: Perspective-based prompting pattern
The system prompt SHALL use first-person self-directed thinking ("I'm looking at my commits and thinking about what matters to my followers") rather than the previous pattern of "Think from the perspective of X — what would they prioritize?". There SHALL be no synthesis step from multiple external perspectives — the single authentic voice from the Identity Document SHALL be the only perspective.

#### Scenario: Prompt uses self-directed framing
- **WHEN** the `/work-progress` skill prompt text is examined
- **THEN** it SHALL use language like "I look at my recent work and decide what's worth sharing" rather than "think from the perspective of" any external role

#### Scenario: No multi-perspective synthesis
- **WHEN** the skill prompt is examined
- **THEN** there SHALL be no instruction to synthesize insights from multiple expert perspectives — the identity IS the perspective

### Requirement: Response format is strict JSON
The `/work-progress` task protocol SHALL instruct Gemini to respond ONLY with valid JSON containing `format` (single/thread), `tweets` (array of {text, index}), and `overviewUpdates` (field-level patch object or null). When the `/image-gen` skill is attached, the JSON SHALL also include `imagePrompt` (ImagePromptData object). When `/image-gen` is NOT attached, the response SHALL NOT include `imagePrompt`. No prose, no markdown, no explanation outside the JSON.

#### Scenario: Valid JSON response without image generation
- **WHEN** Gemini responds to a `/work-progress` call without `/image-gen` attached
- **THEN** the response SHALL be valid JSON with `format`, `tweets`, and `overviewUpdates` only — no `imagePrompt` field

#### Scenario: Valid JSON response with image generation
- **WHEN** Gemini responds to a `/work-progress` call with `/image-gen` attached
- **THEN** the response SHALL be valid JSON with `format`, `tweets`, `imagePrompt`, and `overviewUpdates`

#### Scenario: overviewUpdates absent when no overview provided
- **WHEN** Gemini responds to a content generation prompt without a repo overview
- **THEN** `overviewUpdates` SHALL be `null` or absent

### Requirement: Edit prompt uses same self-perspective approach
The `/refine` skill (formerly `editContent()`) SHALL use the same first-person self-narrative approach as the `/work-progress` skill, adapted for the refinement context. Instead of multi-perspective editing, the skill SHALL frame editing as self-editing: "Here's a draft. I want to rewrite it so it sounds like me."

#### Scenario: Refine skill uses self-perspective
- **WHEN** the `/refine` skill is invoked for editing
- **THEN** it SHALL use first-person framing ("I got this text, and I want to rewrite it in my own voice") with identity-driven voice matching

### Requirement: Content generation uses DB-backed system prompt
The `generateContent()` function SHALL resolve the system prompt from the database via `assembleSystemInstruction(env, chatId, 'content', lang)` which includes skill prompt + identity document + task protocol. The function SHALL accept `chatId` and `lang` parameters for prompt resolution.

#### Scenario: User with custom content skill
- **WHEN** `generateContent()` is called for a user who has customized their `/work-progress` skill
- **THEN** the custom skill SHALL be used as part of the system instruction, combined with their identity document

#### Scenario: User without custom skill
- **WHEN** `generateContent()` is called for a user without a custom skill
- **THEN** the global default `/work-progress` skill SHALL be used, combined with their identity document

### Requirement: Edit refinement uses DB-backed system prompt
The `editContent()` and `refineHandwrittenContent()` functions SHALL both resolve the system prompt from the database via `assembleSystemInstruction(env, chatId, 'edit', lang)` — using the unified `/refine` skill.

#### Scenario: Custom refine skill
- **WHEN** a user with a custom `/refine` skill refines a draft
- **THEN** the custom refine skill SHALL be used, combined with their identity document

### Requirement: Overview patch generation instructions in system prompt
The system prompt SHALL instruct Gemini to analyze the commit changes against the current overview and return field-level patches when the changes represent meaningful project evolution. The framing SHALL be self-directed: "I want to check if my recent work changes how I'd describe my project." The prompt SHALL specify the patch format and instruct Gemini to return `null` for unchanged fields.

#### Scenario: Breaking change triggers overview patch
- **WHEN** commit messages indicate a major feature addition or architectural change
- **THEN** Gemini SHALL return `overviewUpdates` with patches to relevant fields

#### Scenario: Minor fix does not trigger overview patch
- **WHEN** commit messages indicate a small bug fix or typo correction
- **THEN** Gemini SHALL return `overviewUpdates: null`

#### Scenario: Recent changes always updated
- **WHEN** any content is generated with a repo overview present
- **THEN** `overviewUpdates.recent_changes` SHALL include a brief description of the current change
