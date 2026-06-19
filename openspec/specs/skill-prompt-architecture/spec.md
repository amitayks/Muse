## Purpose

Defines the first-person self-narrative skill architecture in which each skill prompt combines a self-narrative with a task protocol and is assembled at runtime from three independently editable layers (skill prompt, identity document, task protocol), renames and consolidates prompt types to slash-named skills (e.g. `/work-progress`, `/refine`, `/quote`, `/who-am-i`), specifies per-skill identity attachment and the user/admin editable subsets, and removes tweet character-limit constraints from AI prompts.

## Requirements

### Requirement: First-person self-narrative skill format
Every skill prompt (system prompt) SHALL be written in first-person inner monologue. Skills SHALL use "I am...", "I write...", "I care about..." framing instead of "You are...", "You should...", "Write for the user...". No skill SHALL reference "the user" — all instructions SHALL be self-directed. This eliminates the director-actor meta-layer and produces authentic voice continuation from the model.

#### Scenario: Skill prompt language examination
- **WHEN** any skill prompt text is examined
- **THEN** it SHALL be written predominantly in first-person ("I share my work because I care about what I build") with no second-person instructions ("You should write posts about work")

#### Scenario: No "the user" references
- **WHEN** any identity-attached skill prompt text is examined
- **THEN** it SHALL contain zero references to "the user", "the person", or "on behalf of" — all actions are self-directed

### Requirement: Two-part skill structure
Each skill prompt SHALL have two distinct parts: (1) Self-Narrative (~80%) — the psychological framing written as inner monologue that establishes identity, mindset, and approach for the specific task, and (2) Task Protocol (~20%) — neutral/technical specifications for output format, JSON structure, field constraints, and character limits. The self-narrative creates the mind; the task protocol tells that mind what format to express itself in.

#### Scenario: Content skill structure
- **WHEN** the `/work-progress` skill prompt is examined
- **THEN** the first ~80% SHALL be self-narrative ("I look at my recent commits and think about what to share...") and the last ~20% SHALL be technical output specs (JSON format, field names, character limits)

#### Scenario: Task protocol doesn't break immersion
- **WHEN** the task protocol section is encountered during generation
- **THEN** it SHALL be clearly separated from the self-narrative (e.g., by a section break) and use neutral technical language that doesn't contradict the first-person framing

### Requirement: Three-layer runtime assembly
Each Gemini API call for identity-attached skills SHALL assemble the system instruction from three distinct, never-merged layers: (1) SKILL_PROMPT — the skill prompt resolved from `default_prompts` or `user_prompts` by type and language, (2) IDENTITY_DOCUMENT — the user's identity resolved from `user_prompts` where `prompt_type = 'identity'`, (3) TASK_PROTOCOL — output format and JSON structure constraints. These layers SHALL remain editable independently — editing identity SHALL NOT affect the skill, and editing a skill SHALL NOT affect the identity.

#### Scenario: Assembly for content generation
- **WHEN** `generateContent()` assembles the system instruction
- **THEN** it SHALL concatenate: skill prompt (from `getPrompt(env, chatId, 'content', lang)`) + identity document (from `getPrompt(env, chatId, 'identity', lang)`) + task protocol section

#### Scenario: Assembly without custom identity
- **WHEN** a user has no custom identity document stored
- **THEN** the assembly SHALL fall back to the default skeleton identity from `default_prompts` via the standard three-level fallback — identity is always present, never skipped

#### Scenario: Utility skill assembly (persona)
- **WHEN** `/persona` is assembled
- **THEN** the assembly SHALL use only skill prompt + task protocol (no identity layer)

### Requirement: Skill type consolidation
The system SHALL consolidate prompt types with these merges: `edit` + `handwrite_refine` SHALL merge into a single `/refine` skill stored as prompt type `edit`. The `handwrite_refine` prompt type SHALL be deprecated. When invoked from the handwrite flow, the `/refine` skill SHALL receive no edit instruction (just "rewrite in my voice"). When invoked from the edit flow, the `/refine` skill SHALL receive the user's edit instruction framed as Gemini's own thought ("I got this text, and I want to change it like [instruction]").

#### Scenario: Refine from handwrite mode
- **WHEN** a user toggles "refine" on a handwritten post
- **THEN** the system SHALL invoke the `/refine` skill (prompt type `edit`) with the post text and NO edit instruction — the skill's default behavior is "rewrite this in my voice"

#### Scenario: Refine from edit button
- **WHEN** a user clicks edit on an existing draft and provides an instruction
- **THEN** the system SHALL invoke the `/refine` skill (prompt type `edit`) with the post text AND the instruction, framed as self-directed: "I got this text, and I want to change it like [instruction]"

#### Scenario: Backward compatibility of edit prompt type
- **WHEN** the `edit` prompt type is queried via `getPrompt()`
- **THEN** it SHALL return the new `/refine` skill prompt (the consolidated version)

### Requirement: Skill rename across all systems
The system SHALL rename all prompt type references to the new skill slash-names across both frontend and backend. No backward compatibility is needed — this is a clean rename. The new names SHALL be used everywhere: database `prompt_type` values, API parameters, WebApp display, and internal code references. The mapping is: `content` → `work-progress`, `edit` → `refine`, `repost` → `quote`, `video` → `video`, `overview` → `know-my-project`, `persona` → `persona`, `scoring` → `what-i-like`, `identity` → `who-am-i`, `handwrite_image` → `image-gen`.

#### Scenario: User WebApp displays skill names
- **WHEN** the user opens the prompt editor WebApp
- **THEN** the tabs/dropdown SHALL show "/work-progress", "/refine", "/quote", and "/who-am-i" (the 4 user-editable skills)

#### Scenario: Admin WebApp displays all skill names
- **WHEN** the admin opens the prompt editor WebApp
- **THEN** the dropdown SHALL show all skill names: "/who-am-i", "/work-progress", "/refine", "/quote", "/video", "/know-my-project", "/persona", "/what-i-like", "/image-gen"

#### Scenario: Database uses new names
- **WHEN** the `prompt_type` column is queried
- **THEN** the stored values SHALL use the new names: `work-progress`, `refine`, `quote`, `video`, `know-my-project`, `persona`, `what-i-like`, `who-am-i`, `image-gen`

#### Scenario: Migration renames existing data
- **WHEN** the migration runs
- **THEN** all existing rows in `default_prompts` and `user_prompts` SHALL have their `prompt_type` values updated to the new names

### Requirement: /work-progress skill (replaces content)
The `/work-progress` skill SHALL frame content generation as self-directed thought: "I'm looking at my recent work and deciding what to share." The skill SHALL instruct Gemini to write from its own perspective about its own achievements, challenges, and progress — NOT as an AI generating social media content for someone. The full Identity Document SHALL be attached.

#### Scenario: Work progress generation
- **WHEN** the `/work-progress` skill receives commit data and project overview
- **THEN** Gemini SHALL generate tweets as if reflecting on its own work ("just rewired the alert pipeline...") rather than reporting on someone else's work ("The team shipped a new alert pipeline...")

#### Scenario: Emotional grounding from identity
- **WHEN** the user's identity describes excitement about technical achievements
- **THEN** the generated post SHALL reflect that emotional pattern naturally, not as forced enthusiasm

### Requirement: /quote skill (replaces repost)
The `/quote` skill SHALL frame quote-tweet generation as self-directed reaction: "This caught my attention, here's what I think." The skill SHALL receive both the full Identity Document (as self) AND the persona of the quoted author (as context about the other person). Gemini SHALL react FROM its identity TO the other person's post.

#### Scenario: Quote with identity and persona
- **WHEN** the `/quote` skill receives a tweet, the user's identity, and the author's persona
- **THEN** Gemini SHALL generate a quote-tweet that reflects how the user (as self) would genuinely react to that specific author's post

#### Scenario: Quote without persona
- **WHEN** no persona is available for the quoted author
- **THEN** the `/quote` skill SHALL still generate from the user's identity, reacting to the tweet content alone

### Requirement: /know-my-project skill (replaces overview)
The `/know-my-project` skill SHALL frame project analysis as self-reflection: "I want to understand my project better — what I built, what I achieved, what matters to me." The output SHALL be emotionally grounded first-person understanding, not dry facts extraction. The full Identity Document SHALL be attached so the analysis reflects what matters to THIS person.

#### Scenario: Project analysis with identity
- **WHEN** the `/know-my-project` skill analyzes a README and PR history
- **THEN** the output SHALL describe the project in first person ("This is my monitoring dashboard — I built it because I got tired of...") with emotional context grounded in the user's identity

#### Scenario: Project analysis feeds back to identity
- **WHEN** a new project is analyzed via `/know-my-project`
- **THEN** the output MAY include suggestions for identity updates (new interests, skills, or topics discovered from the project)

### Requirement: /what-i-like skill (replaces scoring)
The `/what-i-like` skill SHALL frame tweet scoring as subjective self-evaluation: "Do I like this post? How much? Would I want to quote this?" The full Identity Document SHALL be attached so scoring reflects the user's interests, not objective quality metrics. The output SHALL include both a numeric score AND a brief self-reflective reason.

#### Scenario: Scoring with identity
- **WHEN** the `/what-i-like` skill scores a batch of tweets with the user's identity attached
- **THEN** scores SHALL reflect the user's personal interests and engagement patterns, not generic "social media quality" metrics

#### Scenario: Score includes intent signals
- **WHEN** a tweet is scored
- **THEN** the reason SHALL include subjective reaction signals ("right up my alley but the take is lukewarm" or "I'd want to quote this immediately")

### Requirement: /video skill (unchanged scope, new format)
The `/video` skill SHALL be rewritten in the first-person self-narrative skill format. The scope and functionality SHALL remain unchanged (admin-only, HeyGen video scripts). The full Identity Document SHALL be attached.

#### Scenario: Video script with identity
- **WHEN** the `/video` skill generates a script
- **THEN** the script SHALL reflect the user's communication style and personality from their identity, adapted for spoken/presented format

### Requirement: /persona skill (utility, no identity)
The `/persona` skill SHALL be rewritten in the new skill format but SHALL NOT receive the user's Identity Document. It remains a utility for researching X accounts. The framing shifts from "you are a researcher" to the skill format but the task is fundamentally about analyzing others, not expressing self.

#### Scenario: Persona skill format
- **WHEN** the `/persona` skill prompt is examined
- **THEN** it SHALL follow the new skill template structure but without identity injection

### Requirement: /image-gen skill (standalone, identity-attached)
The `/image-gen` skill SHALL instruct the model on **how** to create an image that accompanies a specific tweet, and SHALL NOT prescribe **what** to create. It SHALL be written in the first-person self-narrative format used by every other skill (e.g. "I'm making an image to go alongside this post…"), framing the task as producing an image for a specific tweet at its position in the thread — the same way `/refine` and `/work-progress` frame their tasks. It SHALL teach the model to choose an image that complements and amplifies the post (not restate its text) and to be concrete and specific (a vague prompt yields a muddy, forgettable image), while reading clearly at a glance in a feed. It SHALL NOT prescribe a subject, and SHALL NOT impose any genre or photographic style — no fashion/portrait framework, no camera/lighting/film-stock vocabulary, and no fixed category schema; the model decides both the subject and the look. It SHALL receive the user's Identity Document at runtime (it remains in the identity-attached skill set) so taste comes from identity, and SHALL be invoked as a standalone call dedicated to image-prompt generation — not appended to a content skill's output. Its output SHALL be a single top-level JSON image prompt with model-chosen fields (no required schema), not an `imagePrompt` field embedded inside another skill's JSON. The skill SHALL be maintained in a single language (English); the attached identity and tweet supply voice and content.

#### Scenario: Skill tells how, not what
- **WHEN** the `/image-gen` skill text is examined
- **THEN** it SHALL describe how to approach an accompanying image (complement the post, be concrete and specific) without naming any subject
- **AND** it SHALL contain no prescribed genre, photographic-style framework, camera/lighting/film-stock vocabulary, or fixed category schema

#### Scenario: First-person self-narrative format
- **WHEN** the `/image-gen` skill text is examined
- **THEN** it SHALL be written in first-person inner monologue ("I'm making an image to go with this post…"), consistent with the other skills, and SHALL NOT use second-person imperative ("Generate…", "You specify…")

#### Scenario: Image-gen is identity-attached and standalone
- **WHEN** the system assembles the image-generation call
- **THEN** the system instruction SHALL be the `/image-gen` skill plus the user's Identity Document
- **AND** `/image-gen` SHALL be invoked on its own for image-prompt generation, not appended to `/work-progress`, `/refine`, or `/quote`

#### Scenario: Output is a standalone JSON prompt with model-chosen fields
- **WHEN** the `/image-gen` call returns
- **THEN** the response SHALL be a single JSON image prompt object whose fields are chosen by the model (no fixed five-category schema), not an `imagePrompt` field inside a content skill's JSON

### Requirement: User-editable skill subset
Users SHALL be able to edit 4 skills through the WebApp: identity info (`who-am-i`), work-progress (`work-progress`), refine (`refine`), and quote (`quote`). This expands the current 3 user-editable prompts to 4 by adding identity.

#### Scenario: User edits work-progress skill
- **WHEN** a user edits the "/work-progress" skill in the WebApp
- **THEN** the change is saved to `user_prompts` with `prompt_type = 'work-progress'`

#### Scenario: User edits identity info
- **WHEN** a user edits their identity in the WebApp
- **THEN** the change is saved to `user_prompts` with `prompt_type = 'who-am-i'`
- **AND** this edits the Identity Document content, NOT the `/who-am-i` analysis skill

### Requirement: Admin-editable skill set
The admin SHALL be able to edit all skills including: the `/who-am-i` analysis skill itself (the instructions that generate identity documents), `/video`, `/know-my-project`, `/persona`, `/what-i-like`, `/image-gen`, and all user-editable skills.

#### Scenario: Admin edits identity analysis skill
- **WHEN** the admin edits the `/who-am-i` skill via the admin WebApp
- **THEN** the admin is editing the `default_prompts` entry for `prompt_type = 'identity'` — the instructions that generate identity documents for all users

#### Scenario: Admin pushes updated skill
- **WHEN** the admin clicks "Save & Push to Users" for any skill
- **THEN** the `default_prompts` version is bumped, and users with custom versions see the stale notification

### Requirement: Remove character limit from AI prompts
All AI prompt instructions SHALL NOT include tweet character length constraints. The AI should generate content at natural social media length without artificial truncation.

#### Scenario: Content generation prompts
- **WHEN** the system generates tweet content via Gemini
- **THEN** the prompt SHALL NOT include "≤ 280 characters" or similar char-limit rules
- **AND** response parsing SHALL NOT truncate tweet text to 280 characters

#### Scenario: AI refinement prompts
- **WHEN** the system refines tweet content via Gemini
- **THEN** the prompt SHALL NOT include character length constraints

#### Scenario: Quote skill prompts
- **WHEN** the quote skill generates content (English and Hebrew)
- **THEN** the prompt SHALL NOT include "<=280 characters" constraints

#### Scenario: Video script prompts
- **WHEN** the video skill generates scripts with Twitter captions
- **THEN** the prompt SHALL NOT describe Twitter captions as "max 280 chars"
