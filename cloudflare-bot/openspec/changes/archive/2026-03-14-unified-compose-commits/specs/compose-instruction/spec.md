## MODIFIED Requirements

### Requirement: Instruction capture works in commit mode
The instruction toggle and capture mechanism SHALL work identically in commit compose mode as it does in handwrite and repost modes.

#### Scenario: Set instruction in commit compose
- **WHEN** user clicks "📝 Instruct" in commit compose mode
- **THEN** `ComposeState.awaitingInstruction` SHALL be set to `true`
- **AND** `ComposeState.aiRefine` SHALL be auto-enabled
- **AND** the next text message SHALL be captured as instruction

#### Scenario: Instruction passed to commit generation
- **WHEN** pen down is triggered in commit mode with `instruction` set
- **THEN** the instruction SHALL be passed to `generateContent` via `options.instruction`
- **AND** the user prompt SHALL include a "WHAT I'M GOING FOR" section
