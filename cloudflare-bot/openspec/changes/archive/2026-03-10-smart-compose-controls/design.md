## Context

The handwrite compose flow currently has two static toggle buttons (Image Gen, AI Refine) and no way to provide meta-instructions to the AI. The multi-image-compose change added media group support, but the AI pipeline ignores attached images. Users have no control over AI behavior beyond on/off.

Key existing patterns:
- `HandwriteState` in `types.ts` holds compose session state
- `renderCompose` in `views/home.ts` renders the compose preview and buttons
- `composeAction` in `actions/compose.ts` handles toggle callbacks
- `handwriteInput` in `inputs/handwrite.ts` buffers messages
- `refineContent` in `ai/gemini.ts` does AI refinement with self-directed prompt framing
- `callGeminiText` already accepts multimodal `inline_data` parts
- Telegram `answerCallbackQuery` supports toast notifications

## Goals / Non-Goals

**Goals:**
- Dynamic button row that adapts to context (images attached, AI state)
- User instruction capture via toggle + next-message pattern
- Auto-enable AI when instruction is set
- Send user images to Gemini when analyze mode is on
- Remove hardcoded tweet count constraint from runtime rules
- Toast + compose preview notification for instruction mode
- Follow project patterns: reusable functions, i18n strings, existing toggle pattern

**Non-Goals:**
- Changing the refine/identity skill prompts (those are DB-managed, not code)
- Modifying the publish pipeline (per-tweet media already works)
- Supporting video analysis (photos only for now)
- Instruction history or templates

## Decisions

### 1. Button state computed from derived flags, not stored modes

The button row is computed at render time from `HandwriteState` fields:

```
hasImages = tweets.some(t => (t.media?.length ?? 0) > 0)

No images:      [🎨 Image: ON/OFF]  [✨ AI: ON/OFF]  [📝 Instruct]
Images, AI off:                      [✨ AI: OFF]     [📝 Instruct]
Images, AI on:  [🔍 Analyze: ON/OFF] [✨ AI: ON]     [📝 Instruct]
```

**Rationale**: No extra "mode" state needed. The `hasImages` flag is derived from the tweets array on each render. The `imageGen` flag is auto-disabled when images arrive, keeping state clean.

**Alternative considered**: Storing a `buttonMode` enum — rejected because it duplicates information already in the state.

### 2. Instruction captured via state flag, not special message format

When user clicks "Instruct", set `awaitingInstruction: true`. The next text message in `handwriteInput` checks this flag and routes to instruction storage instead of tweet buffer.

```
handwriteInput flow:
  if awaitingInstruction && isTextMessage:
    store as instruction, clear flag
  elif awaitingInstruction && isPhoto:
    treat as tweet (photos can't be instructions), clear flag
  elif isEdit && messageId === instructionMessageId:
    update instruction text
  else:
    existing tweet buffering logic
```

**Rationale**: Clean separation — no parsing of message content needed, no magic markers. The flag-based approach follows the same pattern as `awaiting_input` in the router.

**Alternative considered**: Parsing `**instruction**...**end**` markers from message text — rejected as fragile and bad UX.

### 3. Instruction auto-enables AI refine

Setting an instruction always enables `aiRefine = true`. The instruction has no effect without AI, so this prevents a confusing state.

Turning AI off does NOT clear the instruction — the user might want to toggle AI off temporarily and back on. The instruction persists until explicitly replaced.

### 4. Toast notification via answerCallbackQuery + preview update

When "Instruct" is clicked:
1. `answerCallbackQuery(env, callbackId, 'Type your instruction next')` — shows Telegram's native toast (~5s)
2. Compose preview re-renders with "📝 Type your instruction next..." text above tweets

This is option 1+3 from exploration. The compose action returns a `ViewResult` with the updated preview AND uses the `callbackId` to fire the toast. The callback handler in `callback.ts` already passes `callbackId` to action handlers.

### 5. Remove hardcoded tweet count from runtime rules

In `refineContent` and `buildHandwriteRules`, remove:
```
- You MUST return EXACTLY ${content.tweets.length} tweet(s) in the same order
```

Keep only the platform constraint:
```
- Each tweet MUST be ≤ 280 characters
```

The refine skill prompt (DB-managed) already guides output structure. The AI is free to merge, split, or create tweets as the instruction and skill dictate.

**Impact on media re-attachment**: When tweet count changes, the 1:1 `content.tweets[i].media = original[i].media` re-attachment breaks. When `analyzeImages` is off, we need a smarter strategy: attach all original media to the first tweet(s) or let them float. Decision: when AI changes tweet count, all original media attaches to the first tweet. When `analyzeImages` is on, media references are preserved since the AI sees the images and can reference them contextually.

### 6. Multimodal image assembly as a reusable utility

Create a helper function to build multimodal Gemini prompt parts from tweet media:

```typescript
// ai/gemini.ts or a shared util
async function buildImageParts(
  env: Env,
  tweets: { media?: TweetMedia[] }[]
): Promise<Array<{ inline_data: { mime_type: string; data: string } }>>
```

This fetches images from R2, converts to base64, and returns Gemini-compatible parts. Reusable for any future multimodal AI call (video generation, image description, etc.).

### 7. renderCompose signature extension

Add optional parameters to `renderCompose`:

```typescript
renderCompose(
  tweets: ComposeTweet[],
  charWarnings: number[],
  imageGen: boolean,
  aiRefine: boolean,
  lang: Lang,
  options?: {
    instruction?: string;
    awaitingInstruction?: boolean;
    analyzeImages?: boolean;
  }
)
```

**Rationale**: Keeps backward compatibility. The options object groups the new compose-specific flags without bloating the parameter list.

## Risks / Trade-offs

- **[Risk] AI returns unexpected tweet count** → The draft is created from whatever the AI returns. Worst case: too many tweets for a single post. Mitigation: the `≤ 280 chars` constraint and publish-time per-tweet media limits still apply.
- **[Risk] Media re-attachment when tweet count changes** → First-tweet-gets-all-media is imperfect but simple. Mitigation: when `analyzeImages` is on, the AI sees the images and can reference them intelligently.
- **[Risk] Base64 image size in Gemini request** → 4 photos could be ~4MB base64. Gemini supports this but it's slower and more expensive. Mitigation: `analyzeImages` is off by default — explicit opt-in.
- **[Trade-off] Instruction persists when AI is toggled off** → Could confuse users who forgot they set an instruction. Mitigation: instruction is always visible in the compose preview with 📝 prefix.
