## MODIFIED Requirements

### Requirement: AI refinement for handwritten content
The system SHALL provide a function to refine handwritten tweets via Gemini, using the refine skill and identity to guide output. The AI is free to determine tweet count and structure.

#### Scenario: Refine handwritten tweets
- **WHEN** AI refinement is requested for handwritten tweets
- **THEN** the system SHALL send the tweets to Gemini with the refine skill prompt and identity document
- **AND** the runtime rules SHALL NOT enforce a specific tweet count (no "MUST return EXACTLY N tweets" constraint)
- **AND** the `≤ 280 chars per tweet` constraint SHALL remain (platform limit)
- **AND** the user's voice and intent SHALL be preserved per the identity document

#### Scenario: Refine with user instruction
- **WHEN** AI refinement is requested with an `options.instruction` parameter
- **THEN** the user prompt SHALL be framed as: "Here's a draft. I want to change it like this: <instruction>"
- **AND** the AI SHALL follow the instruction while respecting the refine skill and identity

#### Scenario: Refine with empty tweets and instruction
- **WHEN** AI refinement is requested with zero tweets and an `options.instruction` provided
- **THEN** the user prompt SHALL be framed as: "I want to create content like this: <instruction>"
- **AND** the AI SHALL generate tweets from scratch based on the instruction, skill, and identity

#### Scenario: Refine generates image prompt alongside
- **WHEN** both AI refinement and image generation are requested
- **THEN** Gemini SHALL return both refined tweets and a structured `ImagePromptData` in a single API call

#### Scenario: Refine with multimodal image input
- **WHEN** AI refinement is requested with `inline_data` image parts in the user prompt
- **THEN** the system SHALL pass the multipart prompt (text + image parts) to `callGeminiText`
- **AND** Gemini SHALL use the images for context when refining text
