## 1. Types & State

- [x] 1.1 Add `analyzeImages: boolean`, `instruction?: string`, `instructionMessageId?: number`, `awaitingInstruction?: boolean` to `HandwriteState` in `types.ts`

## 2. I18n Strings

- [x] 2.1 Add new i18n strings to `en.ts` and `he.ts`: instruction toast, awaiting instruction cue, instruction preview prefix, analyze button label, instruct button label

## 3. Compose View — Dynamic Buttons

- [x] 3.1 Extend `renderCompose` signature with `options?: { instruction?: string; awaitingInstruction?: boolean; analyzeImages?: boolean }` and update button row logic: no images → [Image, AI, Instruct]; images+AI off → [AI, Instruct]; images+AI on → [Analyze, AI, Instruct]
- [x] 3.2 Add instruction display in compose preview: show "📝 Type your instruction next..." when awaiting, show "📝 <instruction truncated>" when set, above tweet list

## 4. Compose Action — New Toggles

- [x] 4.1 Add `toggle_analyze` case in `composeAction` switch to toggle `handwrite.analyzeImages` and re-render compose
- [x] 4.2 Add `toggle_instruct` case in `composeAction`: set `awaitingInstruction: true`, auto-enable `aiRefine`, answer callback with toast text, return updated compose view
- [x] 4.3 Update existing `toggle_ai` case: when turning AI off, also set `analyzeImages: false`

## 5. Handwrite Input — Instruction Capture

- [x] 5.1 Add instruction capture branch in `handwriteInput`: when `awaitingInstruction && isTextMessage`, store text as `instruction`, store `messageId` as `instructionMessageId`, clear `awaitingInstruction`, auto-enable `aiRefine`
- [x] 5.2 Handle photo-during-awaiting: if `awaitingInstruction && isPhoto`, treat as regular tweet, clear `awaitingInstruction`
- [x] 5.3 Add instruction edit detection: when `isEdit && messageId === instructionMessageId`, update `instruction` text
- [x] 5.4 Auto-disable `imageGen` when first photo is attached: in the new-photo branch, set `handwrite.imageGen = false` if it was `true`
- [x] 5.5 Pass instruction and new flags to `renderCompose` when updating the status message

## 6. AI Pipeline — Remove Tweet Count Constraint

- [x] 6.1 Remove `You MUST return EXACTLY ${content.tweets.length} tweet(s)` from `buildHandwriteRules` and `refineContent` runtime rules in `ai/gemini.ts`
- [x] 6.2 Remove the tweet-count mismatch fallback in `refineContent` (the `if (result.tweets.length !== content.tweets.length)` block)
- [x] 6.3 Update `refineHandwrittenContent` to pass `instruction` through to `refineContent` via options
- [x] 6.4 Handle empty tweets + instruction case in `refineContent`: when tweets array is empty, frame user prompt as "I want to create content like this: <instruction>"

## 7. AI Pipeline — Multimodal Image Analysis

- [x] 7.1 Create `buildImageParts(env, tweets)` helper in `ai/gemini.ts` that fetches images from R2, base64-encodes, and returns `inline_data` Gemini parts
- [x] 7.2 In `handlePenDown`, when `analyzeImages: true`, call `buildImageParts` and pass multimodal prompt (text + image parts) to `refineContent`/`callGeminiText`
- [x] 7.3 Update media re-attachment logic in `handlePenDown`: when AI changes tweet count, attach all original media to the first tweet

## 8. Pen Down — Instruction Integration

- [x] 8.1 Update `handlePenDown` to pass `handwrite.instruction` as `options.instruction` to `refineHandwrittenContent`/`refineContent`
- [x] 8.2 Allow pen down with instruction + no tweets: skip the "no tweets" early return when instruction exists and AI is enabled
- [x] 8.3 Update status message text to reflect instruction-based generation (e.g., "✨ Generating from instruction...")

## 9. Deploy & Test

- [ ] 9.1 Deploy and verify: dynamic buttons adapt correctly based on image/AI state
- [ ] 9.2 Verify instruction capture, editing, and display in compose preview
- [ ] 9.3 Verify AI refinement with instruction produces correct output without hardcoded tweet count
- [ ] 9.4 Verify image analysis sends images to Gemini when enabled
