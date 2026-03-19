## Context

The bot currently creates posts exclusively from GitHub activity (PR merges, commits). Users want to author their own tweets/threads directly in Telegram and use the bot's AI refinement, image generation, scheduling, and publishing pipeline. The existing architecture uses a single `awaiting_input` state for one-shot text processing, but handwrite mode requires multi-message accumulation with edit tracking — a fundamentally different interaction pattern.

Key constraints:
- Telegram Bot API supports `edited_message` updates for tracking user edits
- Photo messages can have captions edited but not the photo itself
- Telegram file download links expire after ~1 hour, so media must be stored immediately
- The bot's single-message dashboard pattern means the status message scrolls up as the user sends tweets
- D1 database with R2 for media storage (existing infrastructure)

## Goals / Non-Goals

**Goals:**
- Natural thread-writing experience: user sends messages sequentially, each becomes a tweet
- Silent accumulation with counter on status message (Option B from explore)
- Native message editing via `edited_message` handler
- Photo attachment per tweet, stored in R2 immediately on receive
- Optional AI refinement (polish, not rewrite) and image generation toggles
- Character count warnings for tweets exceeding 280 chars
- New "Handwritten" draft category alongside existing auto/approved/scheduled
- Handwritten drafts enter the same lifecycle as auto-generated drafts
- Slash commands typed during compose mode cancel the session

**Non-Goals:**
- Video attachment support (deferred to future change — requires chunked X upload)
- Inline AI suggestions while composing (deferred — adds latency per message)
- Thread reordering UI (edit messages or clear and restart)
- Tweet deletion from buffer (user can edit to different text)
- Multi-chat compose sessions (one compose session per chat)

## Decisions

### 1. Buffer storage: ChatContext JSON field

**Decision**: Store the handwrite buffer (in-progress tweets) in the existing `ChatContext` JSON stored in the `context` column of `chat_state`.

**Rationale**: The buffer is ephemeral — it only exists during an active compose session and is cleared on pen-down or cancel. Using the existing JSON context field avoids schema changes for temporary state. The data is small (tweet texts + R2 keys, not media bytes).

**Alternatives considered**:
- New `handwrite_buffer` table: Cleaner separation but adds schema complexity for ephemeral data that never persists beyond a session. Overkill.
- In-memory state: Not possible — Cloudflare Workers are stateless between requests.

**Structure**:
```typescript
interface HandwriteState {
    tweets: HandwriteTweet[];
    imageGen: boolean;
    aiRefine: boolean;
    statusMessageId: number;  // the bot's status message to update counter
}

interface HandwriteTweet {
    messageId: number;    // Telegram message ID for edit tracking
    text: string;
    mediaKey?: string;    // R2 key if photo attached
    mediaType?: 'photo';  // extensible for video later
}
```

### 2. Draft source: New `source` column on drafts table

**Decision**: Add a `source TEXT DEFAULT 'auto'` column to the `drafts` table. Values: `'auto'` (webhook/generate) and `'handwrite'`.

**Rationale**: Cleanly separates content origin from lifecycle status. Enables filtering in draft categories without conflating source and status. The default `'auto'` means existing drafts don't need migration — they implicitly have the right value.

**Alternatives considered**:
- Sentinel values (pr_number=0): Fragile, doesn't scale to future sources.
- New status value: Mixes orthogonal concepts (source vs lifecycle).

### 3. Edited message handling: New update type in worker entry

**Decision**: Handle `edited_message` as a new update type in `index.ts`, routing to a dedicated handler that checks if the chat is in handwrite mode and updates the buffer.

**Rationale**: `edited_message` has the same shape as `message` but arrives as a separate field in the Telegram update. It only matters during handwrite compose mode — at all other times it should be silently ignored.

### 4. Media download pipeline: Immediate R2 storage on receive

**Decision**: When a photo message arrives during compose, immediately call Telegram's `getFile` API, download the file, and store in R2 at `handwrite/{chatId}/{messageId}.{ext}`. Store the R2 key in the buffer.

**Rationale**: Telegram file links expire after ~1 hour. Since compose sessions can last indefinitely, we must persist immediately. R2 is already used for draft images, so the infrastructure exists. On pen-down, the R2 keys are transferred to the draft's media references.

### 5. Compose mode cancellation: Recognized commands exit, unknown text is a tweet

**Decision**: During handwrite mode, if a message starts with `/` and matches a registered command, cancel compose (discard buffer) and execute the command. Unknown `/whatever` is treated as tweet text.

**Rationale**: Deliberate command entry signals intent to leave compose mode. But users might legitimately start a tweet with `/` (e.g., referencing a URL path). Only recognized commands like `/start`, `/help`, `/drafts` trigger exit.

### 6. AI refinement approach: Polish same structure, don't rewrite

**Decision**: When AI refine is toggled on, send the user's tweets to Gemini with instructions to polish grammar, clarity, and impact while preserving the exact tweet count, order, and voice. Return the same `DraftContent` structure.

**Rationale**: The user chose to write manually — they want their voice preserved. The AI should act as an editor, not a ghostwriter. Same tweet count ensures media-to-tweet mapping is preserved.

### 7. Per-tweet media in publish pipeline

**Decision**: Extend `DraftContent.tweets` with an optional `mediaKey` field per tweet. During publish, each tweet can have its own media attachment (not just the first tweet).

**Rationale**: Handwritten threads may have photos on any tweet, not just the first. The current pipeline attaches media only to tweet[0]. Extending to per-tweet media makes the publish pipeline more capable for both auto and handwritten drafts.

### 8. Status message counter update (Option B)

**Decision**: The bot's initial compose message (with pen-down/toggle buttons) gets edited after each user message to update the tweet count. The bot does NOT send new messages between user tweets.

**Rationale**: Preserves the natural thread-reading flow. The counter update happens on a message that's already scrolled up, so it's invisible during active composing but confirms tracking when the user scrolls up to pen-down.

## Risks / Trade-offs

- **[Large ChatContext]** → Buffer grows with tweet count. Mitigated: tweets are short text + R2 keys, not media bytes. Even 20 tweets is well under D1 row size limits.
- **[Orphaned R2 media]** → If user cancels compose, R2 media from photos persists. Mitigated: Use `handwrite/` prefix for easy cleanup. Could add periodic cleanup later.
- **[Race condition on rapid messages]** → Two messages arriving simultaneously could create a race on ChatContext reads/writes. Mitigated: D1 transactions are serialized per database. Cloudflare Workers handle one request at a time per isolate for the same chat (Telegram delivers updates sequentially per chat).
- **[280 char warning noise]** → Constant warnings could be annoying for intentionally long tweets (X premium allows longer). Mitigated: Warning is informational only (in counter message), not blocking.
- **[Compose session abandoned]** → User starts compose, never pen-downs, comes back days later. Mitigated: On any non-compose interaction (command, callback), check and clear stale handwrite state.
