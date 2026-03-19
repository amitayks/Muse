## Why

The handwrite compose flow has static AI controls that don't adapt to context. The "Image Gen" button is irrelevant when the user has attached their own photos, AI refinement uses hardcoded tweet-count constraints that override the AI skill's creative judgment, and there's no way for users to provide meta-instructions (tone, topic, structure) to guide the AI — they can only write tweets and hope the refine skill gets it right.

## What Changes

- **Dynamic image button**: The image gen button transforms into an "Analyze Images" toggle when user-attached images are detected, allowing Gemini to see the photos for context-aware text refinement
- **AI instruction mode**: New toggle button lets users provide a free-text instruction that guides AI refinement (tone, structure, topic), captured as a special message separate from tweets
- **Remove hardcoded tweet count constraint**: The runtime `MUST return EXACTLY N tweets` rule is removed — tweet count is now governed entirely by the refine skill prompt and identity, giving the AI creative freedom
- **Auto-enable AI on instruction**: Setting an instruction automatically enables AI refinement since the instruction is meaningless without it
- **Instruction notification UX**: Uses Telegram callback toast (answerCallbackQuery) plus compose preview update to indicate "next message = instruction" mode

## Capabilities

### New Capabilities
- `compose-instruction`: User instruction capture, storage, editing, and integration with AI refinement pipeline
- `compose-image-analysis`: Dynamic image/analyze button logic and multimodal Gemini calls with user-attached images

### Modified Capabilities
- `handwrite-compose`: New button states, instruction display in preview, awaiting-instruction mode
- `publish-pipeline`: Remove hardcoded tweet count constraint from runtime rules in refineContent/refineHandwrittenContent

## Impact

- **Types**: `HandwriteState` gains `instruction`, `instructionMessageId`, `awaitingInstruction`, `analyzeImages` fields
- **Views**: `renderCompose` button row becomes dynamic based on image/AI state; instruction shown in preview
- **Inputs**: `handwriteInput` handles instruction capture mode and instruction edits
- **Actions**: `composeAction` handles new toggle callbacks (`toggle_analyze`, `toggle_instruct`)
- **AI**: `refineContent` / `refineHandwrittenContent` accept instruction and multimodal image parts; hardcoded tweet count rules removed
- **Strings**: New i18n entries for instruction UI, analyze button, toast messages
