## MODIFIED Requirements

### Requirement: buildContentPrompt accepts optional user context
The `buildContentPrompt` function SHALL accept optional `userTweets` and `instruction` parameters and append corresponding sections to the user prompt when present.

#### Scenario: Prompt with user initial thoughts
- **WHEN** `options.userTweets` is provided and non-empty
- **THEN** the prompt SHALL include a "MY INITIAL THOUGHTS:" section with numbered user tweets
- **AND** the section SHALL appear after the commit/file data and before the language instruction

#### Scenario: Prompt with instruction
- **WHEN** `options.instruction` is provided and non-empty
- **THEN** the prompt SHALL include a "WHAT I'M GOING FOR:" section with the instruction text
- **AND** the section SHALL appear after the initial thoughts section (if present)

#### Scenario: Prompt without user context
- **WHEN** neither `userTweets` nor `instruction` is provided
- **THEN** the prompt SHALL remain identical to the current format (backward compatible)

### Requirement: generateContent accepts optional user context
The `generateContent` function SHALL accept optional parameters for user tweets, instruction, and image parts via an options object.

#### Scenario: Generate with user tweets and instruction
- **WHEN** `generateContent` is called with `options.userTweets` and `options.instruction`
- **THEN** these SHALL be passed through to `buildContentPrompt`
- **AND** the `work-progress` skill SHALL handle the initial thoughts through its "initial thoughts" paragraph

#### Scenario: Generate with user image parts
- **WHEN** `generateContent` is called with `options.userImageParts`
- **THEN** the user prompt SHALL be built as a multimodal prompt with text + image parts
- **AND** the images SHALL be appended after the text prompt for Gemini analysis

#### Scenario: Generate with default options (backward compatible)
- **WHEN** `generateContent` is called without options
- **THEN** behavior SHALL be identical to current implementation

### Requirement: Shared prompt section builder utility
A reusable `buildPromptSections` utility SHALL construct the "MY INITIAL THOUGHTS" and "WHAT I'M GOING FOR" sections from optional parameters.

#### Scenario: Build sections for repost prompt
- **WHEN** `buildPromptSections` is called with `userTweets` and `instruction`
- **THEN** it SHALL return formatted section strings identical to the sections in `buildRepostUserPrompt`

#### Scenario: Build sections for commit prompt
- **WHEN** `buildPromptSections` is called with `userTweets` and `instruction`
- **THEN** it SHALL return the same formatted sections
- **AND** `buildContentPrompt` SHALL use this utility instead of inline formatting

#### Scenario: Build sections with empty inputs
- **WHEN** both `userTweets` and `instruction` are empty/undefined
- **THEN** `buildPromptSections` SHALL return an empty string
