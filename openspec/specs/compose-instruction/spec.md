## ADDED Requirements

### Requirement: Instruction toggle button
The compose view SHALL include a "📝 Instruct" toggle button that enters instruction capture mode.

#### Scenario: Click instruction toggle when no instruction exists
- **WHEN** user clicks "📝 Instruct" button in compose mode
- **THEN** `HandwriteState.awaitingInstruction` SHALL be set to `true`
- **AND** `HandwriteState.aiRefine` SHALL be auto-enabled (set to `true`)
- **AND** the bot SHALL show a Telegram callback toast via `answerCallbackQuery` with text "Type your instruction next"
- **AND** the compose preview SHALL update to show "📝 Type your instruction next..." above the tweet list

#### Scenario: Click instruction toggle when instruction already exists
- **WHEN** user clicks "📝 Instruct" button and `HandwriteState.instruction` is already set
- **THEN** `HandwriteState.awaitingInstruction` SHALL be set to `true` (re-enter capture mode to replace)
- **AND** the compose preview SHALL show "📝 Type your instruction next..." replacing the current instruction display

### Requirement: Instruction message capture
When `awaitingInstruction` is `true`, the next text message the user sends SHALL be captured as the instruction, not as a tweet.

#### Scenario: User sends text while awaiting instruction
- **WHEN** user sends a text message and `HandwriteState.awaitingInstruction === true`
- **THEN** the message text SHALL be stored in `HandwriteState.instruction`
- **AND** the message's `message_id` SHALL be stored in `HandwriteState.instructionMessageId`
- **AND** `HandwriteState.awaitingInstruction` SHALL be set to `false`
- **AND** the compose preview SHALL update to show the instruction text with a "📝" prefix above the tweet list

#### Scenario: User sends photo while awaiting instruction
- **WHEN** user sends a photo message and `HandwriteState.awaitingInstruction === true`
- **THEN** the photo SHALL be treated as a regular tweet (not an instruction)
- **AND** `HandwriteState.awaitingInstruction` SHALL be set to `false`
- **AND** the photo SHALL be buffered as a tweet with media following existing media-group logic

### Requirement: Instruction editing via Telegram native edit
The system SHALL handle edits to the instruction message, updating the stored instruction text.

#### Scenario: User edits instruction message
- **WHEN** user edits a message whose `message_id` matches `HandwriteState.instructionMessageId`
- **THEN** `HandwriteState.instruction` SHALL be updated with the new text
- **AND** the compose preview SHALL update to reflect the edited instruction

### Requirement: Instruction display in compose preview
The compose preview SHALL display the instruction (if present) above the tweet list.

#### Scenario: Compose preview with instruction
- **WHEN** `renderCompose` is called with an instruction string
- **THEN** the preview text SHALL show `📝 <instruction text truncated to 120 chars>` above the tweet list
- **AND** the instruction SHALL be visually distinct from tweets (no numbering, prefixed with 📝)

#### Scenario: Compose preview without instruction
- **WHEN** `renderCompose` is called without an instruction
- **THEN** the preview SHALL show only the tweet list (existing behavior)

### Requirement: Instruction passed to AI refinement
When AI refinement is triggered at pen-down time, the instruction SHALL be passed to `refineContent` as the `options.instruction` parameter.

#### Scenario: Pen down with instruction and AI enabled
- **WHEN** user clicks "Pen Down" with `instruction` set and `aiRefine: true`
- **THEN** the instruction SHALL be passed to `refineContent` via `options.instruction`
- **AND** the AI user prompt SHALL be framed as: "Here's a draft. I want to change it like this: <instruction>"
- **AND** the AI is free to adjust tweet count based on the instruction and skill guidance

#### Scenario: Pen down with instruction only (no tweets)
- **WHEN** user clicks "Pen Down" with `instruction` set, `aiRefine: true`, and zero tweets buffered
- **THEN** the system SHALL still call `refineContent` with the instruction and an empty tweets array
- **AND** the AI SHALL generate tweets from scratch based on the instruction, skill, and identity

#### Scenario: Pen down with instruction but AI disabled
- **WHEN** user clicks "Pen Down" with `instruction` set but `aiRefine: false`
- **THEN** this state SHALL NOT occur because setting an instruction auto-enables AI refine

### Requirement: Auto-enable AI refine on instruction
Setting an instruction SHALL automatically enable AI refinement since the instruction is meaningless without it.

#### Scenario: Instruction captured auto-enables AI
- **WHEN** an instruction message is captured (stored in `HandwriteState.instruction`)
- **THEN** `HandwriteState.aiRefine` SHALL be set to `true` if not already
