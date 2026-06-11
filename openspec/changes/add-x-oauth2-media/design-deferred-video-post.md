# Design: Deferred X Video Post (Cron + D1)

## Context

Posting a VIDEO to X via `POST /2/tweets` fails with HTTP 400 `"Your media IDs are invalid"`
even when the v2 chunked upload (initialize → append → finalize → STATUS) reaches
`state="succeeded"`, the bare numeric `data.id` is attached with `media_category=tweet_video`,
auth is OAuth 2.0 user-context (`tweet.write` + `media.write`), and the posting account is X
Premium / verified. Images uploaded the exact same way attach and post instantly.

**Root cause (confirmed with X API support):** an X **video** media object needs **~10–60 s after
STATUS="succeeded"** before `POST /2/tweets` will accept it. The media id itself stays valid for
**hours** — only the **tweet-creation** step must wait.

**Why we cannot wait inline:** publish runs inside a Cloudflare `ctx.waitUntil()` background task
with a ~30 s budget. The upload + processing poll already consume ~25 s; adding a 30 s sleep made
Cloudflare **cancel** the task (`waitUntil() tasks did not complete within the allowed time after
invocation end and have been cancelled`), leaving the draft stuck in `'publishing'`. The delay/retry
MUST be decoupled into a **separate, separately-budgeted execution**.

**Goal:** defer ONLY the `postThread` / `postQuoteTweet` step for X targets that include a video,
retrying on `"Your media IDs are invalid"` (and transient 5xx) over ~2–4 minutes until it works or a
bounded attempt budget is exhausted — integrated cleanly with the existing publish pipeline (draft
status, published record, Telegram notification) WITHOUT regressing text/image X posts (instant —
must stay inline) or Instagram.

## Decision: (A) Cron + D1

**The stack today uses only D1 + R2 + cron** — no Queues, no Durable Objects. Choose (A):

- **(A) Cron + D1** — a frequent `* * * * *` trigger, a `x_pending_posts` D1 table holding due posts,
  each tick scans due rows and retries the tweet-creation. **Reuses the three things this repo already
  runs and operates daily**: the `scheduled()` cron handler, chat-scoped D1 tables, and
  `hydrateEnv(env, chatId)` for the per-user OAuth2 bearer. Zero new Cloudflare products, zero new
  bindings, no new deploy-time registration step. Matches the existing `cronCoordinator`
  `Promise.allSettled` per-user pattern.
- **(B) Cloudflare Queues** — native retry/backoff/dead-letter, but introduces a new product
  (producer + consumer + DLQ bindings), a `queue()` top-level handler, and out-of-band
  `wrangler queues create` setup before deploy. More moving parts than the problem needs.
- **(C) Durable Object alarm** — precise per-post timing + single-writer idempotency, but introduces
  a **brand-new Cloudflare primitive** the team has never deployed: a DO binding + class +
  `[[migrations]]` `new_sqlite_classes` registration that must be gotten right on first deploy, plus a
  new operational failure surface (DO eviction, alarm semantics). Tellingly, a robust (C) design still
  needs a `pending_x_posts` D1 mirror for observability/recovery — paying **both** the DO cost **and**
  a D1 table cost.

**Why (C)'s precision buys nothing here, so the bias toward minimal infra wins:** the readiness
window is 10–60 s and we explicitly retry a few times spread over ~2–4 minutes regardless. Sub-second
alarm precision is functionally irrelevant when every strategy is doing spaced retries across that
window. A `* * * * *` cron's worst-case first-attempt latency (≈60 s after enqueue) lands squarely
inside / just past the readiness window — attempt 1 or 2 succeeds. The every-minute invocation is free
on the Workers plan; the due-row scan is an indexed `SELECT` over a near-empty table (microseconds);
and the heavy 15-min coordinator stays untouched via an `event.cron` dispatch branch. Idempotency is
provided by `UNIQUE(draft_id)` + a pre-post draft re-read guard — no DO needed. (A) is the smallest
operational surface that fully solves the problem.

## Data model

New D1 table `x_pending_posts` (migration 021 — numbered SQL + guarded `migrate.ts` block mirroring
020 + `schema.sql`). It is the **source of truth** for the deferred-post schedule:

```sql
CREATE TABLE IF NOT EXISTS x_pending_posts (
  draft_id        TEXT PRIMARY KEY,                 -- 1:1 with a draft; idempotency anchor + INSERT OR REPLACE
  chat_id         TEXT NOT NULL,                    -- owner; hydrateEnv + ownership-scoped writes
  payload         TEXT NOT NULL,                    -- JSON PendingXPayload (resolved media ids + content + options + IG results)
  attempts        INTEGER NOT NULL DEFAULT 0,
  max_attempts    INTEGER NOT NULL DEFAULT 6,
  status          TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'done' | 'failed'
  last_error      TEXT,
  next_attempt_at TEXT NOT NULL,                    -- SQLite datetime string; first attempt ~45s out
  created_at      TEXT DEFAULT (datetime('now')),
  updated_at      TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_x_pending_due  ON x_pending_posts(status, next_attempt_at);
CREATE INDEX IF NOT EXISTS idx_x_pending_chat ON x_pending_posts(chat_id);
```

`PendingXPayload` (in `src/data/x-pending-db.ts`) — everything needed to post later WITHOUT
re-uploading media (media ids stay valid for hours):

```ts
interface PendingXPayload {
    draftId: string;
    chatId: string;
    prNumber: number;
    prTitle: string;
    source: string;                 // 'auto' | 'handwrite' | 'repost' | 'commit'
    originalTweetId: string | null; // quote-tweet target for reposts
    originalTweetUrl: string | null;
    content: DraftContent;          // tweet texts + reply-chain order
    media: ResolvedXMedia;          // already-uploaded X media ids (video + photos)
    igResults: Pick<PublishResults, 'instagram_post' | 'instagram_story' | 'instagram_reel' | 'errors' | 'needsInstagramReconnect'>;
}
```

`PublishResults` gains `x_pending?: boolean` (UI badge: "X posting…" while the cron retries; `results.x`
and `results.errors.x` are both absent until the executor resolves it; cleared on terminal outcome).

## Status / partial-success model

**No new `DraftStatus` value.** The draft stays in the existing `'publishing'` for the whole deferral
window; the `x_pending_posts` row is the source of truth for "X deferred." `'publishing'` already
renders as in-flight everywhere (bot views, webapp, the publish guard), so there are zero new
status-switch sites to audit. `publish_results` is written twice:

1. **Inline, when deferring (in `publishDraft`):** Instagram (if any) is published inline now and its
   results are persisted immediately, plus `x_pending: true`. For an X-video-only draft,
   `publish_results = { x_pending: true }`. The draft is left in `'publishing'`. **No `published`
   record yet** (no tweet ids exist). `publishDraft` returns `{ success: true, deferredX: true }` so
   inline callers render "X posting…" rather than a failure, and the `api-v1-drafts.ts` /
   `actions/publish.ts` revert paths do NOT fire.

2. **Terminal, in the cron executor (`runPendingXPost`):**
   - **SUCCESS** → merge `results.x = { tweet_ids, url }`, clear `x_pending`, write `publish_results`,
     `createPublished` (IG ids from `payload.igResults` + tweet ids/url), `updateDraftStatus('published')`,
     send the Telegram success/partial notify (mirroring `publishUserDrafts`), `syncBotMessage`, then
     delete the row.
   - **GIVE-UP / non-retryable** → set `results.errors.x` (and `needsXReconnect` for auth), clear
     `x_pending`. If Instagram succeeded inline → still `createPublished` for IG + `updateDraftStatus('published')`
     (partial: IG live, X failed). If nothing succeeded → `updateDraftStatus('approved')` (user-retryable).
     Notify failure, `syncBotMessage`, delete the row.

The cron executor is the **sole terminal-status writer** for deferred drafts. Because `publishDraft`
returns `success: true` for the deferral, neither the webapp background-publish revert
(`!result.success && !result.deferredX`) nor the bot-action revert fires while the draft is pending.

## Trigger / dispatch

**No new binding/product.** `wrangler.toml` `[triggers]` adds a second cron expression:

```toml
crons = ["*/15 * * * *", "* * * * *"]  # 15-min coordinator + every-minute deferred-X processor
```

`index.ts` `scheduled(event, env, ctx)` branches on the cron expression so the frequent tick NEVER
runs the heavy 15-min coordinator:

```ts
async scheduled(event, env, ctx) {
    if (event.cron === '* * * * *') {
        await processPendingXPosts(env);            // separately-budgeted execution
        return;
    }
    await cronCoordinator(env, ctx);                // unchanged 15-min path
}
```

`processPendingXPosts(env)` (new `src/core/x-pending.ts`):

1. `SELECT * FROM x_pending_posts WHERE status='pending' AND next_attempt_at <= datetime('now') ORDER BY next_attempt_at LIMIT N` (N≈10). Early-return when none due (the common case — a microsecond indexed scan).
2. Group due rows by `chat_id`; `hydrateEnv(env, chatId)` ONCE per user (the fresh OAuth2 bearer).
3. Process each user's rows via `Promise.allSettled` (mirrors `cronCoordinator`).

Each every-minute invocation gets a **fresh ~30 s budget** — the entire point of decoupling.

## Producer change (`core/publish.ts`)

`publishToX` is split into the steps we reuse:

- `resolveXMedia(env, draft, content) → ResolvedXMedia` — uploads ALL media (video chunked upload +
  photos) inline; fits the ~25 s budget; only the tweet-creation is ever deferred.
- `postResolvedX(env, content, draft, media) → { tweet_ids, url }` — pure tweet-creation over
  already-resolved media ids; reused inline (text/image) AND by the cron executor (video).
- `hasVideoTarget(content) → boolean` — true iff any tweet carries `media.type === 'video'`.

In `publishDraft`:

- `const xIsVideo = targets.x && hasVideoTarget(content)`.
- If `targets.x`: `xMedia = await resolveXMedia(...)` always inline. If `!xIsVideo`, post inline via
  `postResolvedX` exactly as before. If `xIsVideo`, hold `xMedia` (do NOT post yet).
- Run the Instagram branches inline as before.
- **Deferral block** (after IG): if `xIsVideo && xMedia`, set `results.x_pending = true`,
  `updateDraftPublishResults`, `enqueuePendingXPost(env, payload)` (INSERT OR REPLACE on `draft_id`),
  leave the draft `'publishing'`, and `return { success: true, results, url: primaryUrl, deferredX: true }`.
- The upload-failed `catch` clears `xMedia` so nothing is deferred (→ `errors.x` via the existing path).

`PublishResult.deferredX?: boolean` already exists and stays.

## Deferred executor (`core/x-pending.ts`)

```ts
export async function processPendingXPosts(env: Env): Promise<void>   // dispatch: select due → group by chat → hydrate → Promise.allSettled
export async function runPendingXPost(env: Env, row: XPendingRow): Promise<void>  // one row (env already hydrated)
export function isMediaNotReadyError(error: unknown): boolean
```

`runPendingXPost(userEnv, row)`:

1. **Idempotency re-read:** load the draft. If missing, or `status !== 'publishing'`, or a `published`
   record already exists for it → delete the row and return (orphan / already-resolved; never double-post).
2. `postResolvedX(userEnv, payload.content, { source, original_tweet_id, original_tweet_url }, payload.media)`.
3. **SUCCESS** → `finalizeSuccess` (merge results, `createPublished`, `'published'`, notify,
   `syncBotMessage`) → `deletePendingXPost(draftId)`.
4. **FAILURE** → classify:
   - retryable (`isMediaNotReadyError || isTransient5xx`) and `attempts+1 < max_attempts` → `reschedulePendingXPost`
     (`attempts++`, new `next_attempt_at` per backoff, store `last_error`, stay `pending`).
   - retryable but budget exhausted → `finalizeFailure(error = 'media_not_ready_timeout')` → delete row.
   - `XReconnectError` (auth) → `finalizeFailure(needsXReconnect)` → delete row.
   - any other 4xx / permanent → `finalizeFailure(errors.x = message)` → delete row.

`finalizeSuccess` / `finalizeFailure` mirror `publishUserDrafts` exactly: build `PublishResults`,
`updateDraftPublishResults`, `createPublished` (success, or partial when IG succeeded),
`updateDraftStatus`, then a best-effort `sendMessage` (success/partial/failure shapes with
`platformEmoji` / `formatPlatformSummary`) + `syncBotMessage(env, chatId, draftId)`.

## Retry policy

Owned by the executor. `BACKOFF_SECS = [45, 45, 60, 60, 90]`, `max_attempts = 6` (~5 min total —
comfortably past the 10–60 s window). First attempt scheduled at enqueue: `next_attempt_at = now + 45s`.

- **Retry IFF** `isMediaNotReadyError(error)` (`/your media ids? (?:is|are) invalid/i` against the 400 body
  surfaced by `postTweet` as `X API error 400: <body>`) **OR** transient 5xx (`/X API error 5\d\d:/`).
- **Do NOT retry:** `XReconnectError` → terminal + `needsXReconnect`; any other permanent 4xx (401/403/404/422)
  → terminal `errors.x`. (The 403 quote-not-allowed case self-heals inside `postQuoteTweet`'s URL-embed
  fallback, so it never surfaces here.)
- **Exhausted attempts** → terminal `errors.x = last_error || 'media_not_ready_timeout'`.
- **Idempotency:** `UNIQUE(draft_id)` + `INSERT OR REPLACE` on enqueue (one row per draft, no doubles);
  the pre-post draft re-read guard (step 1 above) skips/deletes rows whose draft already moved on.

## Migration plan

- **`migrations/021_x_pending_posts.sql`** — `CREATE TABLE IF NOT EXISTS x_pending_posts (...)` + the two
  indexes (full DDL above).
- **`routes/migrate.ts`** — the guarded 021 block creates `x_pending_posts` + indexes, idempotent
  (`CREATE TABLE/INDEX IF NOT EXISTS`), same try/catch `logInfo` style as 020.
- **`schema.sql`** — the `x_pending_posts` table + indexes.
- Additive only (D1 has no `ALTER COLUMN`); `CREATE TABLE IF NOT EXISTS` is safe to re-run.

## Risks

1. **Minute-cron cost** — one extra Worker invocation/min. Mitigated by the `event.cron` dispatch branch
   (never runs the coordinator), an indexed due-row `SELECT`, and early-return when nothing is due.
2. **First-attempt latency up to the next minute edge** — fine for a 10–60 s readiness window that we
   already retry across 2–4 min; attempt 1 or 2 succeeds. `max_attempts = 6` over ~5 min covers it with
   margin, then gives up cleanly with `errors.x` + a failure notice rather than hanging.
3. **Orphan rows** (draft deleted mid-pending) — the executor's pre-post re-read (draft missing / not
   `'publishing'` / already published) deletes the orphan. It never re-reads R2, so a GC'd video is
   harmless (the media ids are already uploaded to X).
4. **Double-post** — prevented by `UNIQUE(draft_id)` + `INSERT OR REPLACE` enqueue and the pre-post
   draft-status/published re-read guard.
5. **Partial-success accounting** — IG results are snapshotted into `payload.igResults` at enqueue, so
   the deferred `createPublished` carries both IG ids and tweet ids; the draft reaches `'published'`
   only once the deferred X step terminates (success, or partial when IG succeeded).
6. **Bearer expiry by post time** — `hydrateEnv` refreshes proactively and `xFetch` refreshes once on
   401; an unrecoverable failure surfaces as `XReconnectError` → non-retryable terminal + `needsXReconnect`.

DID NOT deploy, migrate a remote DB, run a dev server, or run git (per the hard rules).
