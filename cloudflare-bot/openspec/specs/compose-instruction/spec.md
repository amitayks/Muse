## Requirements

### Requirement: Instruction toggle button
The compose view SHALL include a "📝 Instruct" toggle button that enters instruction capture mode. This works in both handwrite and repost compose modes.

#### Scenario: Click instruction toggle when no instruction exists
- **WHEN** user clicks "📝 Instruct" button in compose mode (any mode)
- **THEN** `ComposeState.awaitingInstruction` SHALL be set to `true`
- **AND** `ComposeState.aiRefine` SHALL be auto-enabled (set to `true`)
- **AND** the bot SHALL show a Telegram callback toast via `answerCallbackQuery` with text "Type your instruction next"
- **AND** the compose preview SHALL update to show "📝 Type your instruction next..." above the tweet list

#### Scenario: Click instruction toggle when instruction already exists
- **WHEN** user clicks "📝 Instruct" button and `ComposeState.instruction` is already set
- **THEN** `ComposeState.awaitingInstruction` SHALL be set to `true` (re-enter capture mode to replace)
- **AND** the compose preview SHALL show "📝 Type your instruction next..." replacing the current instruction display

### Requirement: Instruction message capture
When `awaitingInstruction` is `true`, the next text message the user sends SHALL be captured as the instruction, not as a tweet.

#### Scenario: User sends text while awaiting instruction
- **WHEN** user sends a text message and `ComposeState.awaitingInstruction === true`
- **THEN** the message text SHALL be stored in `ComposeState.instruction`
- **AND** the message's `message_id` SHALL be stored in `ComposeState.instructionMessageId`
- **AND** `ComposeState.awaitingInstruction` SHALL be set to `false`
- **AND** the compose preview SHALL update to show the instruction text with a "📝" prefix above the tweet list

#### Scenario: User sends photo while awaiting instruction
- **WHEN** user sends a photo message and `ComposeState.awaitingInstruction === true`
- **THEN** the photo SHALL be treated as a regular tweet (not an instruction)
- **AND** `ComposeState.awaitingInstruction` SHALL be set to `false`
- **AND** the photo SHALL be buffered as a tweet with media following existing media-group logic

### Requirement: Instruction editing via Telegram native edit
The system SHALL handle edits to the instruction message, updating the stored instruction text.

#### Scenario: User edits instruction message
- **WHEN** user edits a message whose `message_id` matches `ComposeState.instructionMessageId`
- **THEN** `ComposeState.instruction` SHALL be updated with the new text
- **AND** the compose preview SHALL update to reflect the edited instruction

### Requirement: Instruction display in compose preview
The compose preview SHALL display the instruction (if present) above the tweet list, in both handwrite and repost modes.

#### Scenario: Compose preview with instruction
- **WHEN** `renderCompose` is called with an instruction string
- **THEN** the preview text SHALL show `📝 <instruction text truncated to 120 chars>` above the tweet list
- **AND** the instruction SHALL be visually distinct from tweets (no numbering, prefixed with 📝)

#### Scenario: Compose preview without instruction
- **WHEN** `renderCompose` is called without an instruction
- **THEN** the preview SHALL show only the tweet list (existing behavior)

### Requirement: Instruction passed to AI refinement
When AI refinement is triggered at pen-down time, the instruction SHALL be passed to the appropriate AI function based on compose mode.

#### Scenario: Pen down with instruction in handwrite mode
- **WHEN** user clicks "Pen Down" in handwrite mode with `instruction` set and `aiRefine: true`
- **THEN** the instruction SHALL be passed to `refineContent` via `options.instruction`
- **AND** the AI user prompt SHALL be framed as: "Here's a draft. I want to change it like this: <instruction>"

#### Scenario: Pen down with instruction in repost mode
- **WHEN** user clicks "Pen Down" in repost mode with `instruction` set and `aiRefine: true`
- **THEN** the instruction SHALL be passed to `buildRepostUserPrompt` as the `instruction` parameter
- **AND** the instruction SHALL appear in the prompt under "WHAT I'M GOING FOR"

#### Scenario: Pen down with instruction only (no tweets) in handwrite mode
- **WHEN** user clicks "Pen Down" in handwrite mode with `instruction` set, `aiRefine: true`, and zero tweets buffered
- **THEN** the system SHALL still call `refineContent` with the instruction and an empty tweets array

#### Scenario: Pen down with instruction only (no tweets) in repost mode
- **WHEN** user clicks "Pen Down" in repost mode with `instruction` set, `aiRefine: true`, and zero tweets buffered
- **THEN** the system SHALL call `generateRepostContent` with the instruction and source tweet context

### Requirement: Auto-enable AI refine on instruction
Setting an instruction SHALL automatically enable AI refinement since the instruction is meaningless without it.

#### Scenario: Instruction captured auto-enables AI
- **WHEN** an instruction message is captured (stored in `ComposeState.instruction`)
- **THEN** `ComposeState.aiRefine` SHALL be set to `true` if not already

### Requirement: Instruction capture works in commit mode
The instruction toggle and capture mechanism SHALL work identically in commit compose mode as it does in handwrite and repost modes.

#### Scenario: Set instruction in commit compose
- **WHEN** user clicks "Instruct" in commit compose mode
- **THEN** `ComposeState.awaitingInstruction` SHALL be set to `true`
- **AND** `ComposeState.aiRefine` SHALL be auto-enabled
- **AND** the next text message SHALL be captured as instruction

#### Scenario: Instruction passed to commit generation
- **WHEN** pen down is triggered in commit mode with `instruction` set
- **THEN** the instruction SHALL be passed to `generateContent` via `options.instruction`
- **AND** the user prompt SHALL include a "WHAT I'M GOING FOR" section

### Requirement: Remove character limit warnings from compose UI
The compose preview and draft detail views SHALL NOT display 280-char warnings or counters.

#### Scenario: Compose preview
- **WHEN** the user is composing a tweet (handwrite or any mode)
- **THEN** the UI SHALL NOT show "X/280" character counters
- **AND** the UI SHALL NOT show warnings about exceeding 280 characters

#### Scenario: Draft detail view
- **WHEN** the user views a draft's tweet content
- **THEN** the UI SHALL NOT display "(N/280)" character counts next to tweets
