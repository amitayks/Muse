## Context

The handwrite compose flow (`inputs/handwrite.ts`) buffers incoming Telegram messages as `HandwriteTweet[]` entries. Each message creates one tweet. When a user sends multiple photos as a single Telegram message, Telegram delivers them as separate webhook updates sharing the same `media_group_id`. Currently the bot has no awareness of this field — each update creates a separate tweet, splitting the user's intended single-tweet multi-image post.

The X API v2 supports up to 4 images per tweet via `media.media_ids: ["id1", "id2", "id3", "id4"]`. The `postTweet` function already accepts `mediaIds: string[]` but the publish pipeline only ever passes a single ID. Instagram supports up to 10 carousel images and already collects all per-tweet media into one array.

## Goals / Non-Goals

**Goals:**
- Group photos from the same Telegram media group into a single tweet's `media[]` array
- Show per-image indicators and platform-aware warnings in the compose preview
- Upload and attach up to 4 images per tweet when publishing to X
- Maintain backward compatibility with existing single-image compose flow
- Follow project patterns: reuse existing types, extend rather than rewrite

**Non-Goals:**
- Image deletion/removal during compose (Telegram doesn't notify bots of message deletions; would require complex button UI)
- Overflow/reflow of images across tweets (too complex, user controls intent)
- Video media group support (Telegram sends videos individually, not in groups)

## Decisions

### Decision 1: Append to last tweet on matching `mediaGroupId`

When a message arrives with `media_group_id`, check if the last tweet in `handwrite.tweets[]` has the same `mediaGroupId`. If so, append the photo to that tweet's `media[]`. If not, create a new tweet.

**Why:** Telegram delivers group photos sequentially (same batch or back-to-back). Checking only the last tweet is sufficient and avoids scanning the entire array. This is the simplest approach that works within the stateless Cloudflare Workers model — no timers, no buffering, no Durable Objects.

**Alternative considered:** Store media groups separately and compute tweets at render time. Rejected — would require restructuring `HandwriteState` and adds complexity for edge cases (overflow, reflow) we're explicitly not supporting.

### Decision 2: Silent truncation at publish time, warnings at compose time

At compose time, show warnings when images exceed platform limits (X: 4/tweet, IG: 10/thread). At publish time, silently take the first N images within limits. The user can cancel and re-compose if they want fewer images.

**Why:** No deletion support means the user can't remove images after sending. Warnings give visibility; truncation ensures publishing always works. This matches the existing pattern where 280-char warnings are shown but don't block saving.

### Decision 3: Change `perTweetMediaIds` from `(string | null)[]` to `(string[] | null)[]`

The X publish pipeline currently uses `(string | null)[]` — one media ID per tweet. Change to `(string[] | null)[]` — array of media IDs per tweet. The `postThread` function in `x.ts` already accepts `mediaIds?: string[]`, so only the pipeline's data preparation and `postThread` signature need updating.

**Why:** Minimal change that naturally extends the existing pattern. The X API already supports the array — we just need to fill it.

### Decision 4: Extend existing types in-place

Add `mediaGroupId?: string` to `HandwriteTweet`. Add `media_group_id?: string` to `TelegramMessage`. Change `ComposeTweet.hasMedia` from `boolean` to `mediaCount: number`. These are additive, non-breaking changes.

**Why:** Follows the project's existing pattern of extending interfaces. No migration needed, no breaking changes to existing data.

### Decision 5: Camera emoji count for image indicators

Show one 📷 emoji per image (e.g., `📷📷📷` for 3 images) capped at 4 emojis, then `📷×N` for 5+. Platform warnings appear as separate lines below the tweet.

**Why:** Camera emojis give instant visual feedback matching the user's request. The cap at 4 prevents long emoji strings for edge cases. Platform warnings (e.g., `⚠️ 𝕏: 5/4`) follow the existing pattern of character count warnings.

## Risks / Trade-offs

**[Race condition] Telegram delivers group photos as separate updates that may interleave with other user messages** → Mitigation: Telegram guarantees ordering within a chat. Group messages arrive consecutively. The "check last tweet" approach handles this correctly.

**[Caption on first message only] Telegram only sends the caption on the first photo in a media group** → Mitigation: Already handled — the first update creates the tweet with caption text, subsequent updates append media to the same tweet.

**[No undo for extra images] Users can't remove images after sending** → Mitigation: Clear warning in compose preview. User can cancel and re-compose. This matches the project's philosophy of not over-engineering deletion for a compose flow that's inherently append-only.

**[X upload limits] Each image upload is a separate API call; 4 uploads per tweet could hit rate limits on large threads** → Mitigation: X rate limit for media upload is 415/15min. Even a 10-tweet thread with 4 images each = 40 uploads, well within limits. Add delay between uploads if needed (existing 1s delay between tweets already helps).
