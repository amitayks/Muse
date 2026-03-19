## Context

The bot has three content creation flows that produce tweet drafts:

1. **Handwrite compose** (`/handwrite`): User writes tweets, optional AI refine/image gen/instruction, flexible compose session with toggle controls. Uses `refine` skill. State: `HandwriteState` in `ChatContext.handwrite`.

2. **Manual repost** (`/repost`): User provides tweet URL → bot fetches and shows preview → user clicks "Generate" → AI generates quote tweet with `quote` skill → always generates image → creates draft. State: `repost_preview` in `ChatContext`. No user control over AI behavior.

3. **Batch notification generate** (`action:tw_gen:TWEET_ID`): User clicks "Generate @username" on a batch notification → AI generates same as manual repost → creates draft → rebuilds batch message inline. Also no user control.

The handwrite flow was recently upgraded with smart compose controls (instruction mode, dynamic image/analyze buttons, AI toggle). The repost and batch flows were not. This creates:
- **UX inconsistency**: Users learn one interaction pattern for handwrite and a completely different one for repost.
- **Code duplication**: Both flows create drafts, call AI, handle images — but share almost no code.
- **Missing features**: Reposts can't have instructions, user-provided tweets, or toggle controls.

Key existing patterns:
- `HandwriteState` in `types.ts` holds compose session state with `tweets[]`, `imageGen`, `aiRefine`, `analyzeImages`, `instruction`, `awaitingInstruction`
- `renderCompose` in `views/home.ts` renders the compose preview with dynamic button rows
- `composeAction` in `actions/compose.ts` handles all compose callbacks (toggles, pen down, cancel)
- `handwriteInput` in `inputs/handwrite.ts` buffers user messages during compose
- Skills use self-directed writing ("I see this interesting tweet..."), identity is the AI's own voice
- `twitter_tweets` table stores all polled tweet data (text, author, metrics, media_url) — no extra API call needed for batch tweets
- `assembleSystemInstruction` resolves skill + identity from DB with three-level fallback
- `buildRepostUserPrompt` constructs the user-facing prompt for quote generation

## Goals / Non-Goals

**Goals:**
- Single `ComposeState` type that supports both handwrite and repost modes
- Repost enters compose mode directly (no separate preview → generate step)
- All compose controls (image, AI, instruction, message buffering) work in both modes
- Pen down selects skill based on mode (`refine` for handwrite, `quote` for repost)
- User tweets passed to quote skill as "initial thoughts" (self-directed framing)
- Batch notifications offer "Fast Generate" (quick, default AI) and "Edit Repost" (full compose)
- Per-user settings for repost defaults (image gen in fast mode, source image analysis)
- Shared reusable functions for compose initialization, view building, and pen down
- Full thread context passed to AI when source tweet is part of a thread
- Source tweet's "Open Tweet" embedded as hyperlink in message text (no separate button)

**Non-Goals:**
- Changing the refine or quote skill prompts structurally (only adding "initial thoughts" paragraph to quote)
- Modifying the publish pipeline (reposts still create drafts with `source: 'repost'`, publish works the same)
- Per-account repost settings (start with per-user, iterate later)
- Merging the `/handwrite` and `/repost` commands into one (they remain separate entry points)
- Changing the `awaiting_input` value — it stays `'handwrite'` for backward compat with the message handler router
- Video compose integration (separate flow, not affected)
- Auto-approve flow changes (auto-approved tweets skip notification entirely, unchanged)

## Decisions

### 1. `ComposeState` extends `HandwriteState` with mode and source context

Rename `HandwriteState` → `ComposeState` and add:

```typescript
interface ComposeState {
    mode: 'handwrite' | 'repost';
    tweets: ComposeTweet[];
    imageGen: boolean;
    aiRefine: boolean;
    analyzeImages: boolean;
    statusMessageId: number;
    instruction?: string;
    instructionMessageId?: number;
    awaitingInstruction?: boolean;

    // Repost-specific (only when mode === 'repost')
    sourceTweet?: {
        tweetId: string;
        username: string;
        displayName?: string;
        text: string;
        threadText?: string;       // full thread if applicable
        mediaUrl?: string;
        isThread: boolean;
        metrics?: { likes: number; retweets: number; replies: number; quotes: number };
        tweetUrl: string;
    };
    sourceAccountId?: string;
    batchTweetId?: string;          // links back to twitter_tweets row when opened from batch
}
```

`ChatContext.handwrite` is renamed to `ChatContext.compose`. The `awaiting_input` value stays `'handwrite'` — changing it would require updating the message handler router, input handler registration, and all existing in-flight chat states. The field name change in `ChatContext` is safe because it's serialized as JSON.

**Rationale**: Extending rather than creating a parallel type avoids duplicating all compose logic. The `mode` field is the single branching point.

**Alternative considered**: Keeping `HandwriteState` and creating a separate `RepostComposeState` — rejected because it would require duplicating `renderCompose`, `composeAction`, `handwriteInput`, and all toggle handlers.

### 2. Repost flow enters compose directly — no preview step

Current flow:
```
/repost → URL input → fetch tweet → renderRepostPreview → [Generate] → AI → draft
```

New flow:
```
/repost → URL input → fetch tweet → renderCompose (with sourceTweet) → compose session → [Pen Down] → AI → draft
```

The `repostUrlInput` handler is modified to:
1. Parse URL, fetch tweet (same as today)
2. Check for duplicates (same as today)
3. Build `ComposeState` with `mode: 'repost'`, `sourceTweet` from fetched data, `aiRefine: true` (default ON for repost), `imageGen: false` (default OFF)
4. Send compose message via `sendMessage` (not edit — same as current behavior)
5. Set `awaiting_input: 'handwrite'` and store `ComposeState` in context

If a duplicate exists, the compose view shows a warning banner at top (same as current) with [View Existing] button added to the button row.

**Rationale**: One fewer step in the flow. The user sees the source tweet and has immediate control. If they want the "old" behavior (just generate), they hit Pen Down immediately.

**Alternative considered**: Keeping the preview as a confirmation step before entering compose — rejected because it adds friction without value. The compose view already shows all the source tweet info.

### 3. `renderCompose` extended with optional source tweet header

The existing `renderCompose` signature gains source tweet context via the existing `options` pattern:

```typescript
interface ComposeOptions {
    instruction?: string;
    awaitingInstruction?: boolean;
    analyzeImages?: boolean;
    // NEW
    sourceTweet?: ComposeState['sourceTweet'];
    existingDraftId?: string;
}
```

When `sourceTweet` is present, the compose view renders a header section above the tweet buffer:

```
📌 @username · 2.1K ❤️ · 342 🔁
"Tweet text truncated to 80 chars..."

────────────────────
(compose controls + tweet buffer below)
```

The tweet text is wrapped as a hyperlink to the source tweet URL (`<a href="...">tweet text</a>`). This replaces the separate "Open Tweet" button.

If `existingDraftId` is set, a warning line and [View Existing] button are added.

The empty state instructions text is different for repost mode vs handwrite mode. Repost shows: "Add your own tweets, attach images, or tap Pen Down to generate." Handwrite shows the existing instructions.

**Rationale**: Extending `ComposeOptions` keeps `renderCompose` backward-compatible. The source tweet header is visually distinct (pinned + separator) so users understand the context.

### 4. Pen down branches on mode for skill selection

`handlePenDown` currently always uses the `refine` skill. Updated logic:

```
if mode === 'repost':
    if aiRefine:
        skill = 'quote'
        prompt = buildRepostUserPrompt(sourceTweet, { userTweets, instruction })
        systemPrompt = assembleSystemInstruction(env, chatId, 'quote', lang)
        // Pass source tweet image if available (always analyzed)
        // Pass user images if analyzeImages is on
    else:
        // No AI — save user's tweets as-is as a quote-tweet draft
        // Source tweet stored as original_tweet_id/url on draft

if mode === 'handwrite':
    // Existing logic unchanged
    if aiRefine:
        skill = 'refine'
        prompt = buildRefineUserPrompt(tweets, { instruction })
        systemPrompt = assembleSystemInstruction(env, chatId, 'refine', lang)
    else:
        // Save as-is
```

For repost mode, when no user tweets are provided and AI is on, it behaves identically to the current `rpGenAction` — generating from scratch using the quote skill. When user tweets ARE provided, they're passed as "initial thoughts" in the prompt.

For repost mode with AI off, user tweets become the draft content directly — the user is writing their own quote tweet manually.

**Rationale**: The mode → skill mapping is clean and explicit. No hybrid skills needed.

### 5. Quote skill gains "initial thoughts" paragraph

Add to the `quote` skill (both EN and HE), after the identity section:

```
Sometimes I already have rough thoughts forming — a half-drafted reaction, an angle I started
sketching out. When that happens, those initial thoughts are my jumping-off point. I don't copy
them word for word — I use them as raw material and reshape them through my voice. They show the
direction I'm leaning, not where I must land.
```

This maintains the self-directed perspective. The AI reads it as "sometimes I have initial thoughts" — a natural part of the creative process, not an external instruction.

**Rationale**: Small, non-disruptive change. The skill already handles the case of "no initial thoughts" naturally (the paragraph simply doesn't apply when no user tweets are in the prompt).

**Alternative considered**: Creating a separate `quote-with-draft` skill — rejected as over-engineering. The skill should handle both cases organically.

### 6. `buildRepostUserPrompt` extended with optional sections

Current signature returns the user prompt string. Extended:

```typescript
buildRepostUserPrompt(params: {
    originalTweet: string;
    authorUsername: string;
    isThread: boolean;
    language: string;
    persona?: string | null;
    recentTweets?: string[];
    hasImage?: boolean;
    // NEW
    threadText?: string;         // full thread context if isThread
    userTweets?: string[];       // user's initial thoughts
    instruction?: string;        // self-directed instruction
}): string
```

New sections appended when present:

```
FULL THREAD CONTEXT:
[Thread tweet texts, ordered]

MY INITIAL THOUGHTS:
[User's tweet texts, numbered]

WHAT I'M GOING FOR:
[Instruction text]
```

**Rationale**: Optional prompt sections that are only included when data exists. The AI naturally ignores absent sections.

### 7. Batch notification buttons: "Fast Generate" and "Edit Repost"

Current per-tweet buttons:
```
[⚡ Generate @username] [🔗 Open]
```

New per-tweet buttons:
```
[⚡ Fast] [✏️ Edit]
```

**Fast Generate** (`action:fast_gen:TWEET_ID`):
1. Fetches tweet from `twitter_tweets` (already stored, no API call)
2. Reads user's repost default settings (image gen, source image analysis)
3. Calls `generateRepostContent` with defaults (AI on, no user tweets, no instruction)
4. If user setting `fast_generate_image` is on: calls `ensureImage` after draft creation
5. Creates draft with `source: 'repost'`
6. Updates tweet status to `'drafted'`
7. Rebuilds batch message inline (`rebuildBatchMessage`) — tweet row now shows `[✅ Generated]`
8. Sends separate "draft ready" notification with `[View Draft]`

**Edit Repost** (`action:edit_rp:TWEET_ID`):
1. Fetches tweet from `twitter_tweets`
2. Builds `ComposeState` with `mode: 'repost'`, `sourceTweet` from DB data, `batchTweetId` set
3. Sends NEW compose message (does not touch batch message)
4. Sets `awaiting_input: 'handwrite'`
5. User is now in compose mode for this tweet

When the user completes pen down from an edit-repost session, the handler checks for `batchTweetId` and updates the tweet's status to `'drafted'` and sets `draft_id` — same as fast generate. The batch message is NOT rebuilt at this point (user has moved on).

**Rationale**: Clean split between speed and control. Fast Generate is the "power user" path — one click, done. Edit Repost is the "I want to shape this" path.

**Alternative considered**: Three buttons (Fast / Edit / Open) — rejected per user preference. The tweet text in the batch notification is wrapped as a link to the original tweet.

### 8. Batch notification tweet text as embedded link

In `buildBatchPage`, the tweet text preview is rendered as a hyperlink:

```html
<a href="https://x.com/username/status/ID">Tweet text preview truncated...</a>
```

This replaces the `[🔗 Open]` URL button. Users can click the text to view the original tweet directly.

**Rationale**: Saves a button slot, cleaner layout, the text naturally communicates "this is the tweet" and clicking it opens it.

### 9. User settings for repost defaults

Two new columns on `users` table:

```sql
ALTER TABLE users ADD COLUMN fast_generate_image INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN analyze_source_image INTEGER DEFAULT 1;
```

- `fast_generate_image`: Whether "Fast Generate" in batch also generates an image (0=off, 1=on). Default off for speed.
- `analyze_source_image`: Whether the source tweet's image is sent to Gemini during repost generation (1=on by default — current behavior for manual repost).

Settings view gains a "Repost Defaults" section:

```
🔄 Repost Defaults
[🎨 Fast Image: OFF/ON] [📷 Source Analysis: ON/OFF]
```

These defaults also apply when entering compose mode via `/repost` — the `imageGen` toggle is initialized from `fast_generate_image`, and source image analysis behavior comes from `analyze_source_image`.

**Rationale**: Per-user is simpler than per-account. Users who always want images can toggle it on. Users who want speed keep it off.

### 10. Full thread context for manual repost

Current `repostUrlInput` detects threads but only passes the single tweet text. Updated:

When the source tweet's `conversation_id` !== `tweetId` (it's a reply to another tweet by the same author), the handler:
1. Calls X API to fetch the conversation thread (up to the parent tweets)
2. Concatenates thread tweets in order as `threadText`
3. Stores in `ComposeState.sourceTweet.threadText`

For batch "Edit Repost", thread data is already available — sibling tweets in the same `conversation_id` are in `twitter_tweets`. The handler queries them and concatenates.

`buildRepostUserPrompt` includes the `FULL THREAD CONTEXT` section when `threadText` is provided.

**Rationale**: Thread context significantly improves AI output quality for quote-tweeting threads. The data is either already in DB (batch) or one API call away (manual).

### 11. Shared compose initialization function

Extract a reusable `enterComposeMode` function:

```typescript
async function enterComposeMode(
    env: Env,
    chatId: string,
    lang: Lang,
    options: {
        mode: 'handwrite' | 'repost';
        sourceTweet?: ComposeState['sourceTweet'];
        sourceAccountId?: string;
        batchTweetId?: string;
        existingDraftId?: string;
        defaults?: { imageGen?: boolean; aiRefine?: boolean };
    }
): Promise<void>
```

This function:
1. Builds initial `ComposeState` with mode, defaults, and optional source context
2. Renders `renderCompose` with appropriate options
3. Sends the message via `sendMessage`
4. Updates chat state with `awaiting_input: 'handwrite'` and `compose: state`

Both `handwriteCommand` and `repostUrlInput` (and `editRepostAction`) call this function instead of duplicating initialization logic.

**Rationale**: Three entry points that all need to initialize a compose session. DRY.

### 12. Deprecation of old repost preview flow

The `rpGenAction`, `rpCancelAction`, `renderRepostPreview`, and `renderRepostGenerating` functions are deprecated but NOT removed immediately. They continue to work for any in-flight `repost_preview` contexts that may exist in chat states. After one deployment cycle, they can be removed.

The `repost_preview` field in `ChatContext` remains but is no longer populated by new code. Old chat states with `repost_preview` will still trigger the old handlers if users interact with them.

**Rationale**: Graceful deprecation avoids breaking existing conversations.

## Risks / Trade-offs

- **[Risk] Telegram message length for repost compose** → Source tweet header + instruction + user tweets + buttons could exceed 4096 chars. Mitigation: Truncate source tweet to 80 chars, instruction to 120 chars, user tweets to 60 chars each, show max 5 tweets with "...and N more" indicator.

- **[Risk] Compose session conflict** → User clicks "Edit Repost" while already in compose mode. Mitigation: If `awaiting_input === 'handwrite'`, the handler sends a new compose message anyway (same as slash commands during compose — current behavior cancels and starts new). Document this in UX.

- **[Risk] Stale batch messages** → After "Edit Repost" + pen down, the batch message still shows the old buttons. Mitigation: Acceptable — the tweet's DB status is updated, and next batch page rebuild will show `[✅ Generated]`. Not worth the complexity of cross-message updates.

- **[Trade-off] `awaiting_input` stays `'handwrite'` for repost compose** → Slightly confusing in code, but avoids touching router, input handler registration, and migrating existing chat states. The input handler function is the same (`handwriteInput`) for both modes — it doesn't need to know the mode.

- **[Trade-off] Fast Generate doesn't open compose** → Users who always want the same behavior get one click. Users who want control use Edit Repost. If a user wants "fast but with image", they configure the setting. No middle ground (e.g., "fast with preview").

- **[Risk] Thread fetch for manual repost adds latency** → One extra API call to get conversation thread. Mitigation: Only fetched when `is_thread` is detected. Failing to fetch thread degrades gracefully to single-tweet context.

- **[Trade-off] Source tweet image always analyzed in repost mode** → User can't disable it for repost mode (only for fast generate via settings). Rationale: The source image is fundamental context for generating a good quote tweet. Making it optional adds complexity with little benefit.

## Migration Plan

1. **DB migration**: Add `fast_generate_image` and `analyze_source_image` columns to `users` table (both have defaults, non-breaking)
2. **Code changes**: All changes are backward-compatible. No breaking API changes.
3. **Deployment**: Single deployment. Old repost preview handlers remain for in-flight states.
4. **Cleanup**: After 1 week, remove deprecated `rpGenAction`, `rpCancelAction`, `renderRepostPreview`, `renderRepostGenerating`, and `repost_preview` from `ChatContext`.
5. **Skill update**: Quote skill text update is a DB seed change — applied via migration or seed script.

## Open Questions

- **Thread fetch depth**: For manual repost, how many parent tweets should we fetch for thread context? Suggest: up to 10 tweets in the conversation, same cap as polling.
- **Fast Generate image timing**: Should fast generate wait for image generation before responding, or generate lazily on View Draft? Current batch generate does lazy (image on View Draft). Suggest: keep lazy for fast generate too — speed is the point.
