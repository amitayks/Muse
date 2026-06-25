/**
 * Media pre-warm engine — enqueue + every-minute warm processor
 *
 * Why this exists: publishing pays the slow per-platform media upload at publish time (X chunked video
 * ≈ 25s, Instagram video container processing, LinkedIn upload). Platform media handles are reusable
 * ahead of time (X media_id 24h, IG container 24h, LinkedIn asset URN durable), so we pre-upload
 * ("warm") each media item to its target platforms BEFORE publish and store the handle in media_uploads
 * (data/media-uploads-db.ts). At publish, publishDraft seeds its resumable `progress` from those handles,
 * skips the upload, and posts instantly.
 *
 * This mirrors core/publish-jobs.ts (and core/x-pending.ts): the every-minute processor claims due warm
 * rows on a lease, groups by chat_id, hydrates each user's env ONCE, and runs the SAME per-platform
 * upload primitive the publish path uses (uploadXMediaItem / createInstagramContainer /
 * uploadLinkedInMediaItem) so warm and publish produce byte-identical handles.
 *
 * Warming is BEST-EFFORT and NEVER a correctness dependency: a missing / 'failed' / 'expired' handle
 * just falls back to inline upload at publish (handled by core/publish.ts). On a transient warm failure
 * the row is rescheduled with backoff; on attempts exhausted it is dead-lettered ('failed').
 *
 * Idempotency: each warm run re-reads the draft for ownership/existence; rows for a draft that is gone
 * or already 'published' are deleted (no wasted upload). A row already 'ready' & unexpired is skipped.
 */

import type { Env, Draft, DraftContent, PublishTargets, TweetMedia, MediaWarmPlatform } from '../types';
import { hydrateEnv } from '../data/user-keys';
import { getDraft } from '../data/db';
import { parsePublishTargets } from '../views/platform-toggle';
import { isMediaTargeted } from './media-targets';
import { runPool, uploadXMediaItem } from './publish';
import { createInstagramContainer, formatInstagramCaption, type InstagramContainerKind } from '../services/instagram-publish';
import { uploadLinkedInMediaItem } from '../integrations/linkedin';
import { isHandleUsableAtPublish } from './warm-progress';
import {
    upsertPendingWarm,
    claimDueWarms,
    markWarmReady,
    rescheduleWarm,
    failWarm,
    deleteWarmsForDraft,
    invalidateWarmsByMediaKeys,
    invalidateWarmsByPlatforms,
    invalidateInstagramOnCaption,
    type MediaUploadRow,
    type WarmKey,
} from '../data/media-uploads-db';
import { logInfo, logError } from '../infra/security';

/**
 * Warm-eligibility lead (ms): a scheduled draft is warm-eligible once `now >= scheduled_at − 20h`.
 * Warming sooner would let the handle expire before publish (X/IG cap at 24h). Unscheduled drafts are
 * always eligible. See design Decision 2.
 */
const WARM_LEAD_MS = 20 * 60 * 60 * 1000;

/**
 * Conservative validity set on a freshly-warmed X/IG handle (ms): warm time + 23h, a margin under the
 * 24h platform ceiling so the handle is still valid at publish (the publish path also applies a short
 * expiry safety margin). LinkedIn asset URNs are durable → null expiry. See design Decision 1.
 */
const HANDLE_TTL_MS = 23 * 60 * 60 * 1000;

/** Bounded-pool cap for concurrent warm uploads in one tick (mirrors UPLOAD_POOL_LIMIT in publish.ts). */
const WARM_POOL_LIMIT = 3;

/** Max warm rows claimed per processor tick. */
const WARM_BATCH = 10;

/** Max warm rows a single attach-time inline pass processes (bounded so it fits a request budget). */
const INLINE_WARM_BATCH = 6;

/** The Instagram warm platforms (caption-coupled — caption_hash applies only to these). */
const IG_PLATFORMS: MediaWarmPlatform[] = ['instagram_post', 'instagram_story', 'instagram_reel'];

/**
 * True iff the draft is warm-eligible right now: unscheduled, or within WARM_LEAD_MS of its
 * scheduled_at. A far-future scheduled draft is NOT warmed yet (its handle would expire before publish);
 * the cron re-checks each tick and warms it once it crosses into the window. Mirrors the scheduled_at
 * parsing used in handlers/cron.ts (stored as 'YYYY-MM-DD HH:MM:SS' or ISO; treat naive as UTC).
 */
function isWarmEligible(draft: Pick<Draft, 'scheduled_at'>, now: number = Date.now()): boolean {
    if (!draft.scheduled_at) return true;
    const iso = draft.scheduled_at.replace(' ', 'T') + (draft.scheduled_at.includes('Z') ? '' : 'Z');
    const scheduledMs = Date.parse(iso);
    if (Number.isNaN(scheduledMs)) return true; // unparseable → treat as eligible (best-effort)
    return now >= scheduledMs - WARM_LEAD_MS;
}

/** ISO-8601 (UTC, no millis) `now + HANDLE_TTL_MS` — the conservative expiry for a warmed X/IG handle. */
function handleExpiry(now: number = Date.now()): string {
    return new Date(now + HANDLE_TTL_MS).toISOString().replace('.000Z', 'Z');
}

/** SHA-256 hex of a string — the IG caption fingerprint stored in media_uploads.caption_hash. */
async function captionHash(caption: string): Promise<string> {
    const bytes = new TextEncoder().encode(caption);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/** The caption an Instagram container bakes in (same as publishToIGPost / publishToIGReel use). */
function instagramCaption(content: DraftContent): string {
    return formatInstagramCaption(content.tweets.map(t => t.text));
}

/**
 * The set of (media, platform) pairs to warm for a draft: every TweetMedia, for each platform it
 * targets (per MediaTargets; absent ⇒ all) INTERSECT the draft's PublishTargets. instagram_reel only
 * applies to videos (a Reel is a video); instagram_story / instagram_post / x / linkedin take both.
 * Returns one entry per (media, platform); the same media_key can appear for multiple platforms.
 */
function computeWarmSet(content: DraftContent, targets: PublishTargets): Array<{ media: TweetMedia; platform: MediaWarmPlatform }> {
    const out: Array<{ media: TweetMedia; platform: MediaWarmPlatform }> = [];
    const enabled = (Object.keys(targets) as MediaWarmPlatform[]).filter(p => targets[p]);
    for (const tweet of content.tweets) {
        for (const media of tweet.media ?? []) {
            for (const platform of enabled) {
                if (!isMediaTargeted(media, platform)) continue;
                // A Reel is a standalone video — only warm video media for instagram_reel.
                if (platform === 'instagram_reel' && media.type !== 'video') continue;
                out.push({ media, platform });
            }
        }
    }
    return out;
}

/**
 * Enqueue (upsert) a 'pending' warm row for every (media, platform) the draft warrants — when the draft
 * is warm-eligible (unscheduled or within the 20h window). IG rows carry the caption_hash so a later
 * caption edit can invalidate only them. No upload happens here; the every-minute processor (or the
 * attach-time inline pass) performs it. A no-op for an ineligible (far-future scheduled) draft — the
 * cron enqueues it once it crosses into the window.
 *
 * Best-effort: never throws into its callers (the attach-time / edit triggers). Each upsert is
 * independent; a single failure is logged and skipped.
 */
export async function warmDraftMedia(env: Env, draft: Draft): Promise<void> {
    if (!isWarmEligible(draft)) return;

    let content: DraftContent;
    try {
        content = JSON.parse(draft.content) as DraftContent;
    } catch {
        return; // malformed content — nothing to warm
    }
    const targets = parsePublishTargets(draft.publish_targets);
    const warmSet = computeWarmSet(content, targets);
    if (warmSet.length === 0) return;

    // The IG caption fingerprint is shared across all IG rows of this draft (caption is per-draft).
    const igHash = warmSet.some(w => IG_PLATFORMS.includes(w.platform))
        ? await captionHash(instagramCaption(content))
        : null;

    for (const { media, platform } of warmSet) {
        try {
            await upsertPendingWarm(env, {
                draftId: draft.id,
                chatId: draft.chat_id,
                mediaKey: media.key,
                platform,
                mediaKind: media.type,
                captionHash: IG_PLATFORMS.includes(platform) ? igHash : null,
            });
        } catch (err) {
            logError(`[media-warm] enqueue ${draft.id}/${media.key}/${platform} failed:`, err instanceof Error ? err.message : String(err));
        }
    }
}

/**
 * Reconcile warm rows after a draft's CONTENT changes (the webapp PUT, the AI refine, the bot edit).
 * Enforces the invalidation rules so a stale handle is never published (design Decision 5):
 *   1. Media replaced/removed — drop warm rows whose media_key is no longer in the content (orphaned).
 *   2. Instagram caption changed — reset IG rows whose baked caption_hash ≠ the current caption (X and
 *      LinkedIn are caption-independent and survive a caption edit). Only touched when the draft has at
 *      least one IG-targeted media (otherwise there is no IG caption to hash).
 *   3. (Re)create pending rows for the current media via warmDraftMedia (idempotent upsert — an unchanged
 *      'ready' X/LinkedIn row, or an IG row whose caption still matches, is KEPT, not re-warmed).
 *
 * Invalidation runs BEFORE the re-warm so a row we are about to keep is never recreated, and a row we are
 * about to drop is gone before the upsert. Best-effort: never throws into its callers (the edit handlers).
 */
export async function reconcileWarmsAfterContentChange(env: Env, draft: Draft): Promise<void> {
    let content: DraftContent;
    try {
        content = JSON.parse(draft.content) as DraftContent;
    } catch {
        return; // malformed content — nothing to reconcile
    }

    try {
        // 1. Drop rows for media no longer present (replaced/removed). Empty set → all rows deleted.
        const keepKeys = Array.from(new Set(
            content.tweets.flatMap(t => (t.media ?? []).map(m => m.key))
        ));
        await invalidateWarmsByMediaKeys(env, draft.id, keepKeys);

        // 2. Invalidate IG rows whose baked caption changed (X/LinkedIn untouched). Only when the draft
        //    targets an IG platform with media — otherwise there is no IG container caption to compare.
        const targets = parsePublishTargets(draft.publish_targets);
        const hasIgMedia = computeWarmSet(content, targets).some(w => IG_PLATFORMS.includes(w.platform));
        if (hasIgMedia) {
            const igHash = await captionHash(instagramCaption(content));
            await invalidateInstagramOnCaption(env, draft.id, igHash);
        }
    } catch (err) {
        logError(`[media-warm] reconcile content ${draft.id} failed (non-fatal):`, err instanceof Error ? err.message : String(err));
    }

    // 3. (Re)create pending rows for the current media (gated on warm-eligibility inside warmDraftMedia).
    await warmDraftMedia(env, draft);
}

/**
 * Reconcile warm rows after a draft's PUBLISH TARGETS change (the webapp targets PUT, the bot platform
 * toggle). Drops warm rows for platforms the draft no longer targets (orphaned) and creates pending rows
 * for newly-targeted platforms via warmDraftMedia. Best-effort: never throws.
 *
 * Not used by the repost flow: a repost re-publishes an already-'published' draft to extra platforms
 * inline right away (the warm engine deletes warm rows for 'published' drafts anyway), so warming there
 * would be wasted uploads for media posted immediately.
 */
export async function reconcileWarmsAfterTargetsChange(env: Env, draft: Draft): Promise<void> {
    try {
        const targets = parsePublishTargets(draft.publish_targets);
        const keepPlatforms = (Object.keys(targets) as MediaWarmPlatform[]).filter(p => targets[p]);
        await invalidateWarmsByPlatforms(env, draft.id, keepPlatforms);
    } catch (err) {
        logError(`[media-warm] reconcile targets ${draft.id} failed (non-fatal):`, err instanceof Error ? err.message : String(err));
    }

    // Add rows for the newly-targeted platforms (idempotent for already-targeted ones).
    await warmDraftMedia(env, draft);
}

/**
 * Cron entry point ("* * * * *"): claim due warm rows (lease), group by chat_id, hydrate each user's
 * env ONCE, and warm each row through the shared upload primitive (mirrors processPublishJobs /
 * processPendingXPosts). Early-returns when nothing is due (the common case — a single conditional
 * UPDATE that claims none). Each user's rows warm concurrently through a bounded pool.
 */
export async function processMediaWarms(env: Env): Promise<void> {
    const due = await claimDueWarms(env, WARM_BATCH);
    if (due.length === 0) return;

    logInfo(`[media-warm] Processing ${due.length} warm row(s)`);

    // Group claimed rows by chat_id so we hydrate each user's env exactly once.
    const byChat = new Map<string, MediaUploadRow[]>();
    for (const row of due) {
        const list = byChat.get(row.chat_id) || [];
        list.push(row);
        byChat.set(row.chat_id, list);
    }

    const results = await Promise.allSettled(
        Array.from(byChat.entries()).map(async ([chatId, rows]) => {
            const userEnv = await hydrateEnv(env, chatId);
            await warmRowsForUser(userEnv, rows);
        })
    );

    for (const r of results) {
        if (r.status === 'rejected') {
            logError('[media-warm] user batch failed:', r.reason instanceof Error ? r.reason.message : String(r.reason));
        }
    }
}

/**
 * Best-effort first warm pass for ONE draft, kicked from the attach-time `waitUntil` so a now/near-term
 * draft's media is uploaded immediately (not on the next cron tick). Claims+processes this draft's due
 * rows once, bounded, and SWALLOWS all errors — any failure or partial result is recovered by the
 * every-minute processor, and publish falls back to inline upload regardless. `env` may be the global
 * env; this re-hydrates per chat_id like the cron does.
 */
export async function warmDraftMediaInline(env: Env, draft: Draft): Promise<void> {
    try {
        const claimed = await claimDueWarms(env, INLINE_WARM_BATCH);
        const mine = claimed.filter(r => r.draft_id === draft.id);
        if (mine.length === 0) return;
        const userEnv = await hydrateEnv(env, draft.chat_id);
        await warmRowsForUser(userEnv, mine);
    } catch (err) {
        logError(`[media-warm] inline warm ${draft.id} failed (non-fatal):`, err instanceof Error ? err.message : String(err));
    }
}

/**
 * Warm a batch of already-claimed rows for ONE user (env hydrated for that chat_id). Rows are processed
 * concurrently through a bounded pool. Each row is independent — a failure on one never aborts the batch.
 */
async function warmRowsForUser(env: Env, rows: MediaUploadRow[]): Promise<void> {
    await runPool(rows, WARM_POOL_LIMIT, async (row) => {
        try {
            await warmOneRow(env, row);
        } catch (err) {
            logError(`[media-warm] row ${row.draft_id}/${row.media_key}/${row.platform} failed:`, err instanceof Error ? err.message : String(err));
        }
    });
}

/**
 * Warm exactly one media_uploads row: re-read the draft for ownership/existence, run the matching shared
 * upload primitive, and mark the row 'ready' with its handle + expiry. On a draft that is gone or already
 * 'published', delete the draft's rows (no wasted upload). On a transient failure, reschedule with
 * backoff; on attempts exhausted, dead-letter ('failed' → publish falls back to inline upload).
 * Idempotent: a row already 'ready' & unexpired is skipped (the claim only re-leases stale rows).
 */
async function warmOneRow(env: Env, row: MediaUploadRow): Promise<void> {
    const key: WarmKey = { draftId: row.draft_id, mediaKey: row.media_key, platform: row.platform };

    // Idempotency: a row already usable as a handle (ready + unexpired + outside the safety margin) is
    // skipped — the claim may have re-leased a 'processing' row whose prior run actually finished.
    if (isHandleUsableAtPublish(row)) {
        await markWarmReady(env, key, row.handle as string, row.expires_at);
        return;
    }

    // Re-read the draft for ownership/existence. A gone / already-'published' draft → drop ALL its warm
    // rows (no wasted upload; a published draft never republishes). Mirrors the publish-job re-read guard.
    const draft = await getDraft(env, row.draft_id, row.chat_id);
    if (!draft || draft.status === 'published') {
        await deleteWarmsForDraft(env, row.draft_id);
        return;
    }

    const attempt = row.attempts + 1;
    try {
        const { handle, expiresAt } = await uploadHandleForRow(env, row, draft);
        await markWarmReady(env, key, handle, expiresAt);
        logInfo(`[media-warm] ready ${row.draft_id}/${row.media_key}/${row.platform}`);
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        if (attempt < row.max_attempts) {
            await rescheduleWarm(env, key, attempt, msg);
            logInfo(`[media-warm] ${row.draft_id}/${row.media_key}/${row.platform} retry ${attempt}/${row.max_attempts}: ${msg}`);
            return;
        }
        await failWarm(env, key, msg);
        logError(`[media-warm] ${row.draft_id}/${row.media_key}/${row.platform} dead-lettered: ${msg}`);
    }
}

/**
 * Run the shared per-platform upload primitive for a warm row and return its handle + expiry. X media_id
 * and IG container are short-lived (≈ +23h); the LinkedIn asset URN is durable (null expiry). The IG
 * container bakes the caption, so the caption is recomputed from the current draft content (the row's
 * caption_hash was set at enqueue from the same caption). Throws on any upload failure (caller retries).
 */
async function uploadHandleForRow(env: Env, row: MediaUploadRow, draft: Draft): Promise<{ handle: string; expiresAt: string | null }> {
    const workerUrl = env.WORKER_URL;

    switch (row.platform) {
        case 'x': {
            const handle = await uploadXMediaItem(env, row.media_key, row.media_kind);
            return { handle, expiresAt: handleExpiry() };
        }
        case 'linkedin': {
            const handle = await uploadLinkedInMediaItem(env, row.media_key, row.media_kind);
            return { handle, expiresAt: null }; // durable
        }
        case 'instagram_post':
        case 'instagram_story':
        case 'instagram_reel': {
            if (!workerUrl) throw new Error('WORKER_URL not configured');
            const content = JSON.parse(draft.content) as DraftContent;
            const kind = igContainerKind(row.platform, row.media_kind);
            const caption = kind === 'feed_image' || kind === 'reel' ? instagramCaption(content) : '';
            const media = { url: `${workerUrl}/media/${row.media_key}`, type: row.media_kind };
            const handle = await createInstagramContainer(env, media, caption, kind);
            return { handle, expiresAt: handleExpiry() };
        }
    }
}

/**
 * Map an IG warm platform + media kind to the container kind (the unit the publish path also creates):
 *   - instagram_reel        → a standalone video Reel (caption baked in)
 *   - instagram_story       → a Story (image/video, no caption)
 *   - instagram_post photo  → a feed image post (caption baked in)
 *   - instagram_post video  → a carousel child (no caption — a lone video collapses to a Reel at
 *                             publish; a mixed post uses children, which the parent captions)
 */
function igContainerKind(platform: MediaWarmPlatform, mediaKind: 'photo' | 'video'): InstagramContainerKind {
    if (platform === 'instagram_reel') return 'reel';
    if (platform === 'instagram_story') return 'story';
    // instagram_post:
    return mediaKind === 'video' ? 'carousel_child' : 'feed_image';
}
