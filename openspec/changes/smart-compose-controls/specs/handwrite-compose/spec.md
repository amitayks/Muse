## MODIFIED Requirements

### Requirement: Compose mode toggle buttons
The compose status message SHALL include context-aware toggle buttons that adapt based on current state: whether images are attached, whether AI is enabled, and whether an instruction exists.

#### Scenario: No images — show image gen, AI, and instruct buttons
- **WHEN** no tweets have media attached
- **THEN** the button row SHALL show: `[🎨 Image: ON/OFF]` `[✨ AI: ON/OFF]` `[📝 Instruct]`

#### Scenario: Images attached, AI off — show AI and instruct buttons
- **WHEN** at least one tweet has media AND `aiRefine` is `false`
- **THEN** the button row SHALL show: `[✨ AI: OFF]` `[📝 Instruct]`

#### Scenario: Images attached, AI on — show analyze, AI, and instruct buttons
- **WHEN** at least one tweet has media AND `aiRefine` is `true`
- **THEN** the button row SHALL show: `[🔍 Analyze: ON/OFF]` `[✨ AI: ON]` `[📝 Instruct]`

#### Scenario: Toggle image generation on (no images)
- **WHEN** user clicks the "🎨 Image: OFF" button and no images are attached
- **THEN** `HandwriteState.imageGen` SHALL be set to `true`
- **AND** the button text SHALL change to "🎨 Image: ON"

#### Scenario: Toggle AI refine on
- **WHEN** user clicks the "✨ AI: OFF" button
- **THEN** `HandwriteState.aiRefine` SHALL be set to `true`
- **AND** the button text SHALL change to "✨ AI: ON"
- **AND** if images are attached, the "🔍 Analyze" button SHALL appear in the button row

#### Scenario: Toggle AI refine off
- **WHEN** user clicks the "✨ AI: ON" button
- **THEN** `HandwriteState.aiRefine` SHALL be set to `false`
- **AND** `HandwriteState.analyzeImages` SHALL also be set to `false`
- **AND** the analyze button SHALL disappear from the button row

### Requirement: HandwriteState type definition
The system SHALL define `HandwriteState` and `HandwriteTweet` types for the compose buffer, including new fields for instruction and image analysis.

#### Scenario: HandwriteState stored in ChatContext
- **WHEN** compose mode is active
- **THEN** `ChatContext` SHALL contain `awaiting_input: 'handwrite'` and `handwrite: HandwriteState`
- **AND** `HandwriteState` SHALL have fields: `tweets: HandwriteTweet[]`, `imageGen: boolean`, `aiRefine: boolean`, `analyzeImages: boolean`, `statusMessageId: number`, optional `instruction: string`, optional `instructionMessageId: number`, optional `awaitingInstruction: boolean`
- **AND** `HandwriteTweet` SHALL have fields: `messageId: number`, `text: string`, optional `media: TweetMedia[]`, optional `mediaGroupId: string`

### Requirement: Pen Down finalizes compose and creates draft
When the user clicks "Pen Down", the compose session SHALL end and a draft SHALL be created from the buffered tweets. The AI is free to determine tweet count based on skill and identity guidance.

#### Scenario: Pen down with tweets and no AI
- **WHEN** user clicks "Pen Down" with tweets buffered and both toggles OFF
- **THEN** a draft SHALL be created with `source: 'handwrite'`, `pr_number: 0`, `pr_title` as the first tweet text (truncated to 100 chars), and `DraftContent` with the buffered tweets
- **AND** `format` SHALL be `'single'` if 1 tweet, `'thread'` if 2+ tweets
- **AND** `awaiting_input` SHALL be cleared
- **AND** the user SHALL see `renderDraftDetail()` for the new draft

#### Scenario: Pen down with AI refine enabled
- **WHEN** user clicks "Pen Down" with `aiRefine: true`
- **THEN** the bot SHALL send the tweets to Gemini for refinement via the refine skill and identity
- **AND** the AI MAY adjust tweet count based on skill guidance (no hardcoded tweet count constraint)
- **AND** the refined tweets SHALL be used in the draft content

#### Scenario: Pen down with instruction and no tweets
- **WHEN** user clicks "Pen Down" with `instruction` set, `aiRefine: true`, and zero tweets buffered
- **THEN** the AI SHALL generate content from scratch based on the instruction, skill, and identity
- **AND** a draft SHALL be created from the AI-generated content

#### Scenario: Pen down with no tweets and no instruction and no AI
- **WHEN** user clicks "Pen Down" with zero tweets buffered, no instruction, and AI off
- **THEN** the bot SHALL remain in compose mode and show the compose view as a new message

## ADDED Requirements

### Requirement: Compose action handles new toggle callbacks
The compose action handler SHALL route new callback values for the analyze and instruct toggles.

#### Scenario: Toggle analyze callback
- **WHEN** callback data is `compose:toggle_analyze`
- **THEN** `HandwriteState.analyzeImages` SHALL be toggled
- **AND** the compose preview SHALL re-render with updated buttons

#### Scenario: Toggle instruct callback
- **WHEN** callback data is `compose:toggle_instruct`
- **THEN** `HandwriteState.awaitingInstruction` SHALL be set to `true`
- **AND** `HandwriteState.aiRefine` SHALL be auto-enabled
- **AND** the callback SHALL be answered with toast text "Type your instruction next"
- **AND** the compose preview SHALL update to show the awaiting instruction cue
