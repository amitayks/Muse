/**
 * Multi-Platform Publish Pipeline
 *
 * Orchestrates publishing to X (Twitter) and Instagram platforms.
 * Each platform is independently tried — partial failures don't block others.
 * Results are stored per-platform on the draft's publish_results column.
 */

import type { Env, Draft, DraftContent, PublishTargets, PublishResults, PublishProgress } from '../types';
import { postThread, postQuoteTweet, uploadMediaFromBuffer, uploadMedia, uploadVideoToX, XReconnectError } from '../integrations/x';
import { updateDraftStatus, updateDraftPublishResults, createPublished } from '../data/db';
import { enqueuePendingXPost, type PendingXPayload } from '../data/x-pending-db';
import { publishToInstagramPost, publishToInstagramCarousel, publishToInstagramReel, publishToInstagramStory, formatInstagramCaption, InstagramPublishError, parseGraphError, type InstagramMediaItem } from '../services/instagram-publish';
import { publishVideoToInstagram } from '../services/video-publish';
import { postToLinkedIn, uploadImageToLinkedIn, uploadLinkedInMediaItem, LinkedInPublishError, LINKEDIN_MAX_COMMENTARY, type LinkedInMedia } from '../integrations/linkedin';
// Rendering now delegates to the render-worker via the RENDER service binding; this is a
// thin client (no satori/wasm at module-eval), so a plain static import is safe here.
import { renderTweetCard, renderThreadCards, renderQuoteTweetCard, createStoryImage, storeTweetCard, storeStoryImage, getTweetCard } from '../services/tweet-card';
import { publishContainer } from '../services/instagram-publish';
import { parsePublishTargets } from '../views/platform-toggle';
import { getUser } from '../data/user-db';
import { isMediaTargeted, collectTargetedMedia } from './media-targets';
import { getReadyHandlesForDraft, type MediaUploadRow } from '../data/media-uploads-db';
import { seedProgressFromWarmHandles, mapInstagramWarmHandles, isHandleUsableAtPublish, type InstagramWarmHandle } from './warm-progress';

export interface PublishResult {
    success: boolean;
    results: PublishResults;
    /** Primary URL for backward compat (X URL or first successful platform URL) */
    url: string;
    /**
     * Updated progress map: every media upload completed so far, keyed by platform + tweet/media
     * index. The publish-job processor (core/publish-jobs.ts) persists this between cron chunks so a
     * resumable re-entry skips uploads already done. Always returned (a fresh map when none passed in).
     */
    progress: PublishProgress;
    /**
     * False iff the soft `deadline` was hit mid-upload and the publish could NOT finish all uploads
     * this chunk: terminal finalization (createPublished → updateDraftStatus, or scheduled→approved)
     * was skipped and the job must be re-claimed to continue. True for a completed (or deferred-X)
     * publish — i.e. when the caller may treat the publish as finished. Defaults true so an
     * un-migrated caller (no deadline) always finalizes.
     */
    done: boolean;
    /**
     * Set when the X target is a video and its tweet-creation was deferred to the every-minute
     * cron processor (core/x-pending.ts). The draft is left in 'publishing' with a row in
     * x_pending_posts; the processor finalizes status, creates the published record, and sends
     * the success/failure notification when the freshly-uploaded video media becomes attachable.
     * Inline callers should treat this as "X posting…" (not a failure) and MUST NOT revert the
     * draft status.
     */
    deferredX?: boolean;
}

/**
 * Bounded-concurrency pool: run `fn` over `items` with at most `limit` in flight at once, preserving
 * result order (results[i] corresponds to items[i]). Used so multiple media uploads (per-tweet,
 * per-carousel, per-image) run in parallel without exceeding Worker subrequest/memory limits.
 * Rejections propagate (like Promise.all) — callers wrap individual uploads in try/catch where a
 * single failure must be skipped rather than fail the batch.
 */
export async function runPool<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
    const results = new Array<R>(items.length);
    let next = 0;
    const workers: Promise<void>[] = [];
    const worker = async (): Promise<void> => {
        while (true) {
            const i = next++;
            if (i >= items.length) return;
            results[i] = await fn(items[i], i);
        }
    };
    const n = Math.min(Math.max(1, limit), items.length);
    for (let w = 0; w < n; w++) workers.push(worker());
    await Promise.all(workers);
    return results;
}

/** Bounded-pool concurrency cap for media uploads (design Decision 3 / Open Question: start at 3). */
const UPLOAD_POOL_LIMIT = 3;

/** True iff any tweet in the draft carries media of type 'video' (X-video target). */
export function hasVideoTarget(content: DraftContent): boolean {
    return content.tweets.some(t => t.media?.some(m => m.type === 'video'));
}

/**
 * True iff EVERY X-targeted video in the draft has a usable PRE-WARMED X handle (a 'ready', unexpired
 * media_uploads row for platform 'x'). When true, the X branch posts the tweet INLINE instead of
 * deferring via x_pending — a pre-warmed media_id was uploaded hours ago, so X attachability (the
 * ~10–60s post-upload wait that forces the cold deferral) has already elapsed.
 *
 * Decided from the WARM ROWS directly, NOT from seeded `progress`: a media id in progress.x can also come
 * from a prior-chunk COLD upload (seconds old, not yet attachable), which must still defer. Only an
 * actual warm handle proves the attachability window has elapsed. Conservative: any X-video without a
 * usable warm handle ⇒ false, so the whole X post keeps the deferred path (a thread posts atomically).
 */
function isXVideoFullyWarmed(content: DraftContent, warmedRows: MediaUploadRow[]): boolean {
    const warmedXKeys = new Set(
        warmedRows.filter(r => r.platform === 'x' && isHandleUsableAtPublish(r)).map(r => r.media_key)
    );
    if (warmedXKeys.size === 0) return false;
    for (const tweet of content.tweets) {
        for (const media of tweet.media || []) {
            if (media.type !== 'video' || !isMediaTargeted(media, 'x')) continue;
            if (!warmedXKeys.has(media.key)) return false; // a cold X video remains → defer
        }
    }
    return true;
}

/**
 * Sentinel thrown by an upload helper when the soft `deadline` was reached before starting a new
 * heavy upload. It is NOT a publish failure: the platform branch catches it, records no error, and
 * flags the publish "needs more" so the job processor reschedules and resumes from saved `progress`.
 */
class DeadlineReachedError extends Error {
    constructor() {
        super('publish budget deadline reached');
        this.name = 'DeadlineReachedError';
    }
}

/** True iff the soft budget deadline has been hit — checked before starting any new heavy upload. */
function deadlinePassed(deadline: number): boolean {
    return Date.now() >= deadline;
}

/**
 * Extract only the per-platform SUCCESS markers from a results object (drops errors + reconnect
 * flags). Stored in progress.posted so a resumed chunk skips already-posted platforms and merges
 * their results into the final published record — a failed platform is NOT carried, so it retries.
 */
function pickPostedSuccesses(results: PublishResults): PublishResults {
    const posted: PublishResults = {};
    if (results.x) posted.x = results.x;
    if (results.x_pending) posted.x_pending = results.x_pending;
    if (results.instagram_post) posted.instagram_post = results.instagram_post;
    if (results.instagram_story) posted.instagram_story = results.instagram_story;
    if (results.instagram_reel) posted.instagram_reel = results.instagram_reel;
    if (results.linkedin) posted.linkedin = results.linkedin;
    return posted;
}

/**
 * Publish a draft to all targeted platforms — concurrent, resumable, and idempotent.
 *
 * Each platform is tried independently (a bounded `Promise.allSettled` over async thunks) so partial
 * failures don't block others; per-tweet/per-carousel media uploads inside each branch run through a
 * bounded pool (cap UPLOAD_POOL_LIMIT) so several videos upload in parallel without exceeding limits.
 *
 * Resumable: `progress` carries the media uploads already completed in a prior chunk (keyed by
 * platform + tweet/media index). A branch SKIPS any upload already present and RECORDS each new one
 * into `progress` (mutated in place). `deadline` is an epoch-ms soft cap: before starting a new heavy
 * upload a branch checks it and, if passed, stops starting new uploads and signals "needs more" via
 * DeadlineReachedError — no upload runs twice across a chunk boundary.
 *
 * Returns `{ success, results, url, progress, done, deferredX }`. Terminal DB finalization
 * (createPublished → updateDraftStatus, or scheduled→approved on all-fail) happens only when
 * `done === true`. `done` defaults true (no deadline / nothing deferred) so an un-migrated caller
 * still finalizes. Returns `{ success: false, … }` rather than throwing on platform failures.
 */
export async function publishDraft(
    env: Env,
    chatId: string,
    draft: Draft,
    progress: PublishProgress = {},
    deadline: number = Infinity
): Promise<PublishResult> {
    const content = JSON.parse(draft.content) as DraftContent;
    const targets = parsePublishTargets(draft.publish_targets);
    // Resume-aware: seed results with platforms that already POSTED in an earlier chunk (persisted in
    // progress.posted) so each branch can skip itself and we never re-post on resume.
    const results: PublishResults = progress.posted ? { ...progress.posted } : {};

    // ==================== Pre-warmed media handles (optimization) ====================

    // Load any media handles pre-uploaded by the warm engine (core/media-prewarm.ts) and SEED the
    // resumable `progress` from the valid ones (status 'ready', outside the publish-time expiry safety
    // margin — see warm-progress.ts). Each branch's existing skip-if-present logic then skips the upload
    // and posts directly. X + LinkedIn seed straight into `progress`; Instagram handles are FINISHED
    // container ids surfaced separately (igWarm*) because progress.instagram_* are posted-markers, not
    // container slots. Warming is BEST-EFFORT: a missing/expired/failed handle leaves the slot unseeded,
    // so the branch uploads inline exactly as today (warmedRows defaults empty on any load failure).
    // Already-passed-in progress (a resumed chunk) is never overwritten — warm handles only fill gaps.
    let warmedRows: MediaUploadRow[] = [];
    try {
        warmedRows = await getReadyHandlesForDraft(env, draft.id, chatId);
        if (warmedRows.length > 0) seedProgressFromWarmHandles(content, warmedRows, progress);
    } catch (error) {
        console.error('[publish] loading pre-warmed handles failed (falling back to inline upload):', error instanceof Error ? error.message : String(error));
        warmedRows = [];
    }
    // Warmed IG container ids per branch (publish-only step: media_publish the FINISHED container,
    // skipping the slow create+process). Empty ⇒ that branch creates+processes inline as today.
    const igPostWarm = warmedRows.length > 0 ? mapInstagramWarmHandles(content, warmedRows, 'instagram_post') : [];
    const igStoryWarm = warmedRows.length > 0 ? mapInstagramWarmHandles(content, warmedRows, 'instagram_story') : [];
    const igReelWarm = warmedRows.length > 0 ? mapInstagramWarmHandles(content, warmedRows, 'instagram_reel') : [];

    // X video posts are deferred: X video media needs ~10–60s after upload before
    // POST /2/tweets accepts it (see add-x-oauth2-media/design-deferred-video-post.md).
    // We upload the media inline (fits the budget) but DEFER the tweet-creation to the
    // every-minute cron processor (core/x-pending.ts). Text/image-only X posts and ALL
    // Instagram stay inline. EXCEPTION: a warmed X video media_id has been attachable for hours
    // (uploaded ahead of publish), so it posts inline — see xVideoFullyWarmed below.
    const xIsVideo = targets.x && hasVideoTarget(content);
    // A cold X video must STILL defer; a fully pre-warmed X video posts inline. Decided from the warm
    // rows directly (not seeded progress) so a prior-chunk cold upload is never mistaken for warmed.
    const xVideoFullyWarmed = xIsVideo && isXVideoFullyWarmed(content, warmedRows);
    let xMedia: ResolvedXMedia | undefined;

    // Set true by any branch that stopped early because the soft deadline was hit mid-upload. When
    // true we persist `progress` and DEFER finalization (done=false) so a later chunk resumes.
    let deadlineHit = false;

    // Build one async thunk per targeted platform; they run concurrently via Promise.allSettled.
    // Each thunk owns the SAME independent try/catch + `results` aggregation as the old sequential
    // branches — only the ordering changed (concurrent), so partial-failure semantics are identical.
    const branches: Array<() => Promise<void>> = [];

    // ==================== X (Twitter) Publishing ====================

    if (targets.x) {
        branches.push(async () => {
            // Resume guard: X already posted (or its video was already deferred) in an earlier chunk.
            if (results.x || results.x_pending) return;
            try {
                // Upload all media up-front (video chunked upload + photos). Always inline —
                // this fits the ~25s budget; only the tweet-creation step is ever deferred. Skips
                // any media already in progress.x and records new uploads back into it.
                xMedia = await resolveXMedia(env, draft, content, progress, deadline);
                if (!xIsVideo || xVideoFullyWarmed) {
                    // Text/image X: post inline exactly as before. ALSO a fully PRE-WARMED X video:
                    // its media_id was uploaded hours ahead (attachability has elapsed), so the tweet
                    // posts inline instead of deferring via x_pending — no wait needed.
                    const xResult = await postResolvedX(env, content, draft, xMedia);
                    results.x = xResult;
                    if (xIsVideo) xMedia = undefined; // posted inline → nothing to defer below
                }
                // xIsVideo (cold): media is uploaded; the deferred post is enqueued AFTER all branches
                // settle (below) so the IG/LinkedIn results are available to carry into its payload.
            } catch (error) {
                if (error instanceof DeadlineReachedError) {
                    // Out of budget mid-upload — not a failure. Resume next chunk from progress.
                    deadlineHit = true;
                    xMedia = undefined;
                    return;
                }
                const msg = error instanceof Error ? error.message : String(error);
                console.error('[publish] X publishing failed:', msg);
                if (error instanceof XReconnectError) {
                    results.errors = { ...results.errors, x: 'needs_x_reconnect' };
                    results.needsXReconnect = true;
                } else {
                    results.errors = { ...results.errors, x: msg };
                }
                // Upload failed → nothing to defer.
                xMedia = undefined;
            }
        });
    }

    // ==================== Instagram Post Publishing ====================

    if (targets.instagram_post) {
        branches.push(async () => {
            if (results.instagram_post) return; // resume guard: already posted in an earlier chunk
            try {
                const igResult = await publishToIGPost(env, chatId, draft, content, progress, deadline, igPostWarm);
                if (igResult) {
                    results.instagram_post = igResult;
                }
            } catch (error) {
                if (error instanceof DeadlineReachedError) { deadlineHit = true; return; }
                const msg = error instanceof Error ? error.message : String(error);
                console.error('[publish] Instagram Post publishing failed:', msg);
                results.errors = { ...results.errors, instagram_post: msg };
                if (error instanceof InstagramPublishError && error.isAuthError) results.needsInstagramReconnect = true;
            }
        });
    }

    // ==================== Instagram Story Publishing ====================

    if (targets.instagram_story) {
        branches.push(async () => {
            if (results.instagram_story) return; // resume guard: already posted in an earlier chunk
            try {
                const storyResult = await publishToIGStory(env, chatId, draft, content, igStoryWarm);
                if (storyResult) {
                    results.instagram_story = storyResult;
                }
            } catch (error) {
                if (error instanceof DeadlineReachedError) { deadlineHit = true; return; }
                const msg = error instanceof Error ? error.message : String(error);
                console.error('[publish] Instagram Story publishing failed:', msg);
                results.errors = { ...results.errors, instagram_story: msg };
                if (error instanceof InstagramPublishError && error.isAuthError) results.needsInstagramReconnect = true;
            }
        });
    }

    // ==================== Instagram Reel Publishing ====================

    if (targets.instagram_reel && draft.has_video) {
        branches.push(async () => {
            if (results.instagram_reel) return; // resume guard: already posted in an earlier chunk
            try {
                const reelResult = await publishToIGReel(env, draft, igReelWarm);
                if (reelResult) {
                    results.instagram_reel = reelResult;
                }
            } catch (error) {
                if (error instanceof DeadlineReachedError) { deadlineHit = true; return; }
                const msg = error instanceof Error ? error.message : String(error);
                console.error('[publish] Instagram Reel publishing failed:', msg);
                results.errors = { ...results.errors, instagram_reel: msg };
                if (error instanceof InstagramPublishError && error.isAuthError) results.needsInstagramReconnect = true;
            }
        });
    }

    // ==================== LinkedIn Publishing ====================

    // Reshape the draft into ONE native LinkedIn member post: thread text merged into a single
    // commentary, photos combined (or one video) as the post media. Independent of X/Instagram —
    // its failure is isolated and never blocks the other platforms. Captured even when X video is
    // deferred (the deferred-X enqueue below runs only after this branch settles).
    if (targets.linkedin) {
        branches.push(async () => {
            if (results.linkedin) return; // resume guard: already posted in an earlier chunk
            try {
                console.log(`[publish] LinkedIn: starting for draft ${draft.id} (connected=${!!env.LINKEDIN_ACCESS_TOKEN}, urn=${env.LINKEDIN_PERSON_URN ? 'set' : 'missing'})`);
                const linkedinResult = await publishToLinkedIn(env, draft, content, progress, deadline);
                results.linkedin = linkedinResult;
                console.log(`[publish] LinkedIn: published draft ${draft.id} → ${linkedinResult.url}`);
            } catch (error) {
                if (error instanceof DeadlineReachedError) { deadlineHit = true; return; }
                const msg = error instanceof Error ? error.message : String(error);
                console.error('[publish] LinkedIn publishing failed:', msg);
                results.errors = { ...results.errors, linkedin: msg };
                if (error instanceof LinkedInPublishError && error.isAuthError) results.needsLinkedInReconnect = true;
            }
        });
    }

    // Run all platform branches concurrently; each owns its own try/catch so a rejection is
    // impossible here, but allSettled keeps us robust to any unexpected throw.
    await Promise.allSettled(branches.map(fn => fn()));

    // Compute the primary URL deterministically by platform priority (X → IG post → reel →
    // LinkedIn → story), independent of concurrent settle order — matches the old precedence.
    const primaryUrl =
        results.x?.url
        || results.instagram_post?.url
        || results.instagram_reel?.url
        || results.linkedin?.url
        || '';

    // ==================== Budget exhausted mid-upload ====================

    // A branch stopped early on the soft deadline → persist what we have and DEFER finalization.
    // No published record, no status transition; the job processor reschedules and resumes from
    // `progress`. Nothing was double-uploaded (each upload is skipped when already in progress).
    if (deadlineHit) {
        await updateDraftPublishResults(env, draft.id, chatId, results);
        // Carry the platforms that already POSTED into progress so the resumed chunk skips them
        // (no re-post) and can merge their results into the final published record.
        progress.posted = pickPostedSuccesses(results);
        const anyDone = !!(results.x || results.instagram_post || results.instagram_story || results.instagram_reel || results.linkedin);
        return { success: anyDone, results, url: primaryUrl, progress, done: false };
    }

    // ==================== Deferred X video post ====================

    // X target is a COLD video and its media uploaded successfully → enqueue a pending row so the
    // every-minute cron processor (core/x-pending.ts) posts the tweet once the media becomes
    // attachable. Instagram (if any) has already published inline above; its results are carried
    // into the payload so the processor can build the final published record. The draft stays in
    // 'publishing' until the processor resolves it. A fully PRE-WARMED X video posts inline in the
    // branch above and clears xMedia, so it never reaches here (no deferral).
    if (xIsVideo && xMedia) {
        results.x_pending = true; // UI badge: "X posting…" while the cron processor retries
        await updateDraftPublishResults(env, draft.id, chatId, results);
        await enqueueDeferredXPost(env, chatId, draft, content, xMedia, results);
        // Leave the draft in 'publishing' (already set by callers); success=true so inline callers
        // render "X posting…" rather than a failure. The cron processor sends the final
        // notification and creates the published record on X success. done=true: the upload/post
        // work of THIS job is complete (the X-attachability wait is the x_pending processor's job).
        return { success: true, results, url: primaryUrl, progress, done: true, deferredX: true };
    }

    // ==================== Status Transition ====================

    const anySuccess = !!(results.x || results.instagram_post || results.instagram_story || results.instagram_reel || results.linkedin);

    // Store publish results on draft
    await updateDraftPublishResults(env, draft.id, chatId, results);

    if (anySuccess) {
        // Extract platform results for published record
        const igResult = results.instagram_post || results.instagram_story || results.instagram_reel;
        // Create published record FIRST — if this fails, draft stays in current status
        await createPublished(env, chatId, {
            draft_id: draft.id,
            pr_number: draft.pr_number,
            tweet_ids: results.x?.tweet_ids?.join(',') ?? null,
            tweet_url: results.x?.url ?? null,
            instagram_post_id: igResult?.post_id ?? null,
            instagram_url: (results.instagram_post?.url || results.instagram_reel?.url) ?? null,
        });
        await updateDraftStatus(env, draft.id, chatId, 'published');
    } else {
        // All failed — move back to approved (or stay approved if was scheduled)
        if (draft.status === 'scheduled') {
            await updateDraftStatus(env, draft.id, chatId, 'approved');
        }
    }

    return { success: anySuccess, results, url: primaryUrl, progress, done: true };
}

// ==================== X (Twitter) Branch ====================

/**
 * Resolved X media ready to attach to POST /2/tweets — the output of the upload step,
 * separated from the post step so the post can be deferred (for video) while the upload
 * always runs inline within the publish budget.
 */
export interface ResolvedXMedia {
    /** Per-tweet media id arrays (handwritten drafts). null entries = no media for that tweet. */
    perTweetMediaIds?: (string[] | null)[];
    /** Single draft-level media id (legacy auto-generated drafts). */
    mediaId?: string;
}

/**
 * Upload ONE media item (by R2 key) to X and return its `media_id`. The single source of truth for
 * the X upload encoding, shared by BOTH `resolveXMedia` (publish) and the warm engine
 * (core/media-prewarm.ts) so a warmed handle is byte-identical to one produced inline at publish.
 *
 * Photos use the simple `uploadMediaFromBuffer` (reads the R2 object first); videos use the chunked
 * `uploadVideoToX` (which reads R2 by key itself). Throws if a photo's R2 object is missing or any
 * upload step fails — the caller decides whether that's fatal (video) or skippable (photo).
 */
export async function uploadXMediaItem(env: Env, mediaKey: string, mediaKind: 'photo' | 'video'): Promise<string> {
    if (mediaKind === 'video') {
        return uploadVideoToX(env, mediaKey);
    }
    const r2Object = await env.IMAGES.get(mediaKey);
    if (!r2Object) throw new Error(`Photo media missing from storage: ${mediaKey}`);
    const buffer = await r2Object.arrayBuffer();
    return uploadMediaFromBuffer(env, buffer);
}

/**
 * Upload all X media for a draft and return the resolved media ids.
 * Photo uploads are best-effort (skip failures); a VIDEO upload failure throws.
 * This is the slow step (video chunked upload + processing poll, ~25s) but it fits the
 * publish budget — only the subsequent tweet-creation is deferred for video posts.
 *
 * Resumable: per-tweet uploads run through a bounded pool (UPLOAD_POOL_LIMIT) so several videos
 * upload in parallel; any tweet already resolved in `progress.x.perTweetMediaIds` is reused (no
 * re-upload). Before starting a NEW per-tweet upload the soft `deadline` is checked — if passed we
 * throw DeadlineReachedError (caught by publishDraft) so the chunk stops and resumes later. Each
 * completed tweet's ids are recorded into `progress.x` immediately so a mid-thread stop is durable.
 */
export async function resolveXMedia(
    env: Env,
    draft: Draft,
    content: DraftContent,
    progress: PublishProgress = {},
    deadline: number = Infinity
): Promise<ResolvedXMedia> {
    // Handle media upload
    const hasPerTweetMedia = content.tweets.some(t => t.media?.length);
    const prior = progress.x ?? {};

    if (hasPerTweetMedia) {
        // Per-tweet media: a tweet has EITHER exactly 1 video OR up to 4 photos
        // (X's exclusivity rule; the editor enforces it, we enforce it defensively here).
        // Photo uploads are best-effort (skip failures); a VIDEO upload failure throws and
        // fails X publishing — caught by publishDraft's per-platform try/catch (→ errors.x).
        const resolved: (string[] | null)[] = (prior.perTweetMediaIds ?? []).slice();
        // Persist incrementally so a mid-thread deadline stop leaves durable progress.
        progress.x = { ...prior, perTweetMediaIds: resolved };

        await runPool(content.tweets, UPLOAD_POOL_LIMIT, async (tweet, index) => {
            // Skip a tweet whose media was already uploaded in a prior chunk (resume).
            if (resolved[index] !== undefined) return;
            // Budget guard: stop BEFORE starting a new heavy upload once the deadline passed.
            if (deadlinePassed(deadline)) throw new DeadlineReachedError();

            // Only media targeted to X is attached; a tweet with no X-targeted media → text-only.
            const items = (tweet.media || []).filter(m => isMediaTargeted(m, 'x'));
            const video = items.find(m => m.type === 'video');
            if (video) {
                // Video wins: upload exactly one video, ignore any photos on this tweet.
                const videoMediaId = await uploadXMediaItem(env, video.key, 'video');
                resolved[index] = [videoMediaId];
                return;
            }
            // Photos: up to 4 for X — silently truncate the rest, skip individual failures.
            const photos = items.filter(m => m.type === 'photo').slice(0, 4);
            if (photos.length === 0) { resolved[index] = null; return; }
            const ids: string[] = [];
            for (const media of photos) {
                try {
                    const id = await uploadXMediaItem(env, media.key, 'photo');
                    ids.push(id);
                } catch {
                    // Skip failed photo uploads, continue with others
                }
            }
            resolved[index] = ids.length > 0 ? ids : null;
        });

        return { perTweetMediaIds: resolved };
    }

    // Draft-level image for auto-generated drafts (best-effort — publish without on failure).
    if (prior.mediaId !== undefined) return { mediaId: prior.mediaId };
    let mediaId: string | undefined;
    try {
        if (draft.image_url && draft.image_url.startsWith('drafts/')) {
            const r2Object = await env.IMAGES.get(draft.image_url);
            if (r2Object) {
                const imageBuffer = await r2Object.arrayBuffer();
                mediaId = await uploadMediaFromBuffer(env, imageBuffer);
            }
        } else if (draft.image_url) {
            mediaId = await uploadMedia(env, draft.image_url);
        }
        // No forced image generation at publish time — if compose didn't
        // generate an image, we publish without one.
    } catch {
        // Continue without image
        mediaId = undefined;
    }

    if (mediaId !== undefined) progress.x = { ...prior, mediaId };
    return { mediaId };
}

/**
 * Post the X thread / quote-tweet using ALREADY-RESOLVED media ids.
 * Pure tweet-creation — no uploads. Used inline for text/image X posts and by the every-minute
 * cron processor (core/x-pending.ts) for deferred video posts (the media ids stay valid for hours).
 */
export async function postResolvedX(
    env: Env,
    content: DraftContent,
    draft: Pick<Draft, 'source' | 'original_tweet_id' | 'original_tweet_url'>,
    media: ResolvedXMedia
): Promise<{ tweet_ids: string[]; url: string }> {
    const { perTweetMediaIds, mediaId } = media;

    // Quote tweet for reposts
    if (draft.source === 'repost' && draft.original_tweet_id) {
        const firstTweetText = content.tweets[0]?.text || '';
        // Prefer media attached to the commentary tweet in the webapp (photos or a video);
        // fall back to the draft-level image for legacy auto-generated reposts.
        const mediaIds = perTweetMediaIds?.[0] ?? (mediaId ? [mediaId] : undefined);
        const quoteTweetId = await postQuoteTweet(env, firstTweetText, draft.original_tweet_id, { mediaIds, originalTweetUrl: draft.original_tweet_url || undefined });
        const url = `https://x.com/i/status/${quoteTweetId}`;
        return { tweet_ids: [quoteTweetId], url };
    }

    // Regular thread post
    const { tweetIds, url } = await postThread(env, content, mediaId, perTweetMediaIds);
    return { tweet_ids: tweetIds, url };
}

/**
 * Enqueue a pending row so the every-minute cron processor (core/x-pending.ts) posts a deferred
 * X video tweet once the uploaded media becomes attachable. Carries the resolved media ids +
 * content + quote info + any already-published Instagram results so the processor can build the
 * final published record. INSERT OR REPLACE on draft_id makes the enqueue idempotent.
 */
async function enqueueDeferredXPost(
    env: Env,
    chatId: string,
    draft: Draft,
    content: DraftContent,
    media: ResolvedXMedia,
    igResults: PublishResults
): Promise<void> {
    const payload: PendingXPayload = {
        draftId: draft.id,
        chatId,
        prNumber: draft.pr_number,
        prTitle: draft.pr_title,
        source: draft.source,
        originalTweetId: draft.original_tweet_id,
        originalTweetUrl: draft.original_tweet_url,
        content,
        media,
        // The non-X portions already produced inline (Instagram + LinkedIn); X is not yet posted.
        igResults: {
            instagram_post: igResults.instagram_post,
            instagram_story: igResults.instagram_story,
            instagram_reel: igResults.instagram_reel,
            linkedin: igResults.linkedin,
            errors: igResults.errors,
            needsInstagramReconnect: igResults.needsInstagramReconnect,
            needsLinkedInReconnect: igResults.needsLinkedInReconnect,
        },
    };

    await enqueuePendingXPost(env, payload);
    console.log(`[publish] Deferred X video post enqueued for draft ${draft.id}`);
}

// ==================== Instagram Post Branch ====================

async function publishToIGPost(
    env: Env,
    chatId: string,
    draft: Draft,
    content: DraftContent,
    progress: PublishProgress = {},
    deadline: number = Infinity,
    igWarm: InstagramWarmHandle[] = []
): Promise<{ post_id: string; url: string } | null> {
    const workerUrl = env.WORKER_URL;
    if (!workerUrl) throw new Error('WORKER_URL not configured');

    // Already published in a prior chunk → reuse (resume; never re-post the carousel). The IG post
    // publish is one atomic step in the service (no per-image id surfaced back), so progress records
    // it all-or-nothing as `mediaIds = [post_id, url]` — a non-empty slot means "already posted".
    const priorIds = progress.instagram_post?.mediaIds;
    if (priorIds && priorIds[0]) return { post_id: priorIds[0], url: priorIds[1] ?? '' };

    // Pre-warm fast path (single photo): a lone IG-Post-targeted photo is warmed as a FINISHED
    // 'feed_image' container — publish it directly (media_publish), skipping the slow create+process.
    // Limited to the single-photo case because that's the only warm encoding directly publishable as a
    // feed post: a lone video is warmed as a carousel_child (publish makes it a Reel — fall back inline)
    // and a carousel still needs the parent assembled at publish. Everything else falls through to the
    // inline path below — warming is an optimization, never a correctness dependency.
    const igTargeted = collectTargetedMedia(content.tweets, 'instagram_post');
    if (igTargeted.length === 1 && igTargeted[0].type === 'photo' && igWarm.length === 1 && igWarm[0].type === 'photo' && igWarm[0].mediaKey === igTargeted[0].key) {
        const result = await publishContainer(env, igWarm[0].containerId);
        const out = { post_id: result.post_id, url: result.url || '' };
        progress.instagram_post = { mediaIds: [out.post_id, out.url] };
        return out;
    }

    // Budget guard: the IG carousel upload+poll is one heavy atomic step (the service creates child
    // containers, polls, then publishes). Don't start it once the soft deadline has passed — resume
    // next chunk. (No partial IG progress is exposed back here, so this whole step is the unit.)
    if (deadlinePassed(deadline)) throw new DeadlineReachedError();

    // Prepare caption from tweet texts
    const caption = formatInstagramCaption(content.tweets.map(t => t.text));

    // Collect ALL media targeted to Instagram Post across the thread, in order, keeping type.
    // Photos AND videos — Instagram carousels can mix them. (Previously this filtered to photos,
    // silently dropping videos.)
    const items: InstagramMediaItem[] = collectTargetedMedia(content.tweets, 'instagram_post')
        .map(media => ({ url: `${workerUrl}/media/${media.key}`, type: media.type }));

    // Fallbacks (images only): draft-level image, then generated tweet cards.
    if (items.length === 0 && draft.image_url) {
        items.push({ url: `${workerUrl}/media/${draft.image_url}`, type: 'photo' });
    }
    if (items.length === 0) {
        const cardUrls = await generateTweetCardImages(env, chatId, draft, content);
        for (const u of cardUrls) items.push({ url: u, type: 'photo' });
    }

    if (items.length === 0) {
        throw new Error('No media available for Instagram post');
    }

    // A lone video → Reel; a lone photo → image post; otherwise a mixed carousel.
    if (items.length === 1) {
        const single = items[0];
        const result = single.type === 'video'
            ? await publishToInstagramReel(env, single.url, caption)
            : await publishToInstagramPost(env, single.url, caption);
        const out = { post_id: result.post_id, url: result.url || '' };
        progress.instagram_post = { mediaIds: [out.post_id, out.url] };
        return out;
    }
    const result = await publishToInstagramCarousel(env, items, caption);
    const out = { post_id: result.post_id, url: result.url || '' };
    progress.instagram_post = { mediaIds: [out.post_id, out.url] };
    return out;
}

// ==================== Instagram Story Branch ====================

async function publishToIGStory(
    env: Env,
    chatId: string,
    draft: Draft,
    content: DraftContent,
    igWarm: InstagramWarmHandle[] = []
): Promise<{ post_id: string; url: null } | null> {
    const workerUrl = env.WORKER_URL;
    if (!workerUrl) throw new Error('WORKER_URL not configured');

    // Per-media targeting (video wins): a video targeted to Story is published directly as a video
    // story; otherwise prefer a targeted photo; otherwise fall back to card/draft-image.
    const storyCandidates = collectTargetedMedia(content.tweets, 'instagram_story');
    const storyVideo = storyCandidates.find(m => m.type === 'video');
    if (storyVideo) {
        // Pre-warm fast path: the story VIDEO is warmed as a FINISHED 'story' container — publish it
        // directly (media_publish), skipping the slow create+process. Only the video case is warm-
        // reusable: a photo story is re-rendered to a 9:16 image at publish (a different media key than
        // the warmed original), so warmed photo-story handles are NOT used here. On any failure fall
        // through to the inline path below.
        const warmedVideo = igWarm.find(h => h.mediaKey === storyVideo.key && h.type === 'video');
        if (warmedVideo) {
            try {
                const result = await publishContainer(env, warmedVideo.containerId, true);
                return { post_id: result.post_id, url: null };
            } catch (err) {
                console.error('[publish] IG warmed video story publish failed; falling back to inline:', err instanceof Error ? err.message : String(err));
            }
        }
        try {
            const result = await publishToInstagramStory(env, { url: `${workerUrl}/media/${storyVideo.key}`, type: 'video' });
            return { post_id: result.post_id, url: null };
        } catch (err) {
            console.error('[publish] IG video story failed; falling back to image story:', err instanceof Error ? err.message : String(err));
        }
    }
    const storyPhoto = storyCandidates.find(m => m.type === 'photo');

    // Prepare a 9:16 story image
    let storyImageKey: string;

    // Check for a targeted photo first, then existing tweet card or draft image
    const targetedPhotoObj = storyPhoto ? await env.IMAGES.get(storyPhoto.key) : null;
    const existingCard = await getTweetCard(env, draft.id, 0);
    if (targetedPhotoObj) {
        const storyPng = await createStoryImage(env, new Uint8Array(await targetedPhotoObj.arrayBuffer()));
        storyImageKey = await storeStoryImage(env, draft.id, storyPng);
    } else if (existingCard) {
        // Create story from existing card
        const storyPng = await createStoryImage(env, existingCard);
        storyImageKey = await storeStoryImage(env, draft.id, storyPng);
    } else if (draft.image_url) {
        // Use draft image — create story version
        const imgObj = await env.IMAGES.get(draft.image_url);
        if (imgObj) {
            const imgBuffer = new Uint8Array(await imgObj.arrayBuffer());
            const storyPng = await createStoryImage(env, imgBuffer);
            storyImageKey = await storeStoryImage(env, draft.id, storyPng);
        } else {
            // Generate a card and use it
            const cardUrls = await generateTweetCardImages(env, chatId, draft, content);
            if (cardUrls.length === 0) throw new Error('No image available for story');
            // Re-fetch the first card from R2
            const card = await getTweetCard(env, draft.id, 0);
            if (!card) throw new Error('Failed to retrieve generated card');
            const storyPng = await createStoryImage(env, card);
            storyImageKey = await storeStoryImage(env, draft.id, storyPng);
        }
    } else {
        // No image — generate a tweet card first
        const cardUrls = await generateTweetCardImages(env, chatId, draft, content);
        if (cardUrls.length === 0) throw new Error('No image available for story');
        const card = await getTweetCard(env, draft.id, 0);
        if (!card) throw new Error('Failed to retrieve generated card');
        const storyPng = await createStoryImage(env, card);
        storyImageKey = await storeStoryImage(env, draft.id, storyPng);
    }

    const storyUrl = `${workerUrl}/media/${storyImageKey}`;
    const result = await publishToInstagramStory(env, storyUrl);
    return { post_id: result.post_id, url: null };
}

// ==================== Instagram Reel Branch ====================

async function publishToIGReel(
    env: Env,
    draft: Draft,
    igWarm: InstagramWarmHandle[] = []
): Promise<{ post_id: string; url: string } | null> {
    const content = JSON.parse(draft.content) as DraftContent;

    // Find the first video targeted to Reel
    let videoKey: string | null = null;
    for (const tweet of content.tweets) {
        for (const media of tweet.media || []) {
            if (media.type === 'video' && isMediaTargeted(media, 'instagram_reel')) {
                videoKey = media.key;
                break;
            }
        }
        if (videoKey) break;
    }

    if (!videoKey) {
        throw new Error('No video found in draft for Reel');
    }

    // Pre-warm fast path: the Reel video is warmed as a FINISHED 'reel' container — publish it
    // directly (media_publish), skipping the slow container create + processing poll. On failure fall
    // through to the inline create+poll+publish below. Warming is an optimization, never a dependency.
    const warmedReel = igWarm.find(h => h.mediaKey === videoKey && h.type === 'video');
    if (warmedReel) {
        try {
            const result = await publishContainer(env, warmedReel.containerId);
            return { post_id: result.post_id, url: `https://www.instagram.com/reel/${result.post_id}` };
        } catch (err) {
            console.error('[publish] IG warmed Reel publish failed; falling back to inline:', err instanceof Error ? err.message : String(err));
        }
    }

    // Use existing video-publish service
    const caption = formatInstagramCaption(content.tweets.map(t => t.text));
    const videoPublicUrl = `${env.WORKER_URL}/media/${videoKey}`;

    // Create container, poll, publish
    const { publishToInstagramPost: igPost } = await import('../services/instagram-publish');

    // For reels, we need to use the REELS media type directly
    if (!env.INSTAGRAM_ACCESS_TOKEN || !env.INSTAGRAM_BUSINESS_ACCOUNT_ID) {
        throw new InstagramPublishError('Instagram is not configured', { isAuthError: true });
    }

    const containerUrl = `https://graph.instagram.com/v25.0/${env.INSTAGRAM_BUSINESS_ACCOUNT_ID}/media`;
    const containerResponse = await fetch(containerUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            video_url: videoPublicUrl,
            caption: caption.substring(0, 2200),
            media_type: 'REELS',
            access_token: env.INSTAGRAM_ACCESS_TOKEN,
        }),
    });

    if (!containerResponse.ok) {
        throw parseGraphError(await containerResponse.text(), 'Reel container creation failed');
    }

    const containerResult = await containerResponse.json() as { id: string };
    const containerId = containerResult.id;

    // Poll for processing (max 5 minutes)
    const maxWait = 5 * 60 * 1000;
    const startTime = Date.now();
    while (Date.now() - startTime < maxWait) {
        await new Promise(r => setTimeout(r, 10000));
        const statusUrl = `https://graph.instagram.com/v25.0/${containerId}?fields=status_code&access_token=${env.INSTAGRAM_ACCESS_TOKEN}`;
        const statusResponse = await fetch(statusUrl);
        const statusResult = await statusResponse.json() as { status_code: string };
        if (statusResult.status_code === 'FINISHED') break;
        if (statusResult.status_code === 'ERROR') throw new Error('Reel processing failed');
    }

    // Publish
    const publishUrl = `https://graph.instagram.com/v25.0/${env.INSTAGRAM_BUSINESS_ACCOUNT_ID}/media_publish`;
    const publishResponse = await fetch(publishUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            creation_id: containerId,
            access_token: env.INSTAGRAM_ACCESS_TOKEN,
        }),
    });

    if (!publishResponse.ok) {
        throw parseGraphError(await publishResponse.text(), 'Reel publish failed');
    }

    const publishResult = await publishResponse.json() as { id: string };
    return {
        post_id: publishResult.id,
        url: `https://www.instagram.com/reel/${publishResult.id}`,
    };
}

// ==================== LinkedIn Branch ====================

/**
 * Publish a draft as ONE native LinkedIn member post.
 *
 * Text: every tweet's text merged with blank lines (trimmed to LinkedIn's 3000-char limit).
 * Media: image/video exclusivity like X — if any tweet has a video, exactly one video is
 * uploaded and attached; otherwise all photos across the thread are uploaded as a multi-image
 * post; with no per-tweet media the draft-level image is used; with no media at all the post is
 * text-only. (No tweet-card rendering — LinkedIn keeps the real text, unlike Instagram.)
 */
async function publishToLinkedIn(
    env: Env,
    draft: Draft,
    content: DraftContent,
    progress: PublishProgress = {},
    deadline: number = Infinity
): Promise<{ post_urn: string; url: string }> {
    const commentary = content.tweets
        .map(t => t.text)
        .filter(Boolean)
        .join('\n\n')
        .slice(0, LINKEDIN_MAX_COMMENTARY);

    const media = await resolveLinkedInMedia(env, draft, content, progress, deadline);
    return postToLinkedIn(env, commentary, media);
}

/**
 * Collect and upload a draft's media for LinkedIn, returning the share-media category + asset URNs.
 * Video wins over photos (LinkedIn, like X, attaches EITHER images OR one video). Photo upload
 * failures are skipped (best-effort); a video upload failure throws (fails the LinkedIn branch).
 */
async function resolveLinkedInMedia(
    env: Env,
    draft: Draft,
    content: DraftContent,
    progress: PublishProgress = {},
    deadline: number = Infinity
): Promise<LinkedInMedia> {
    // Only media targeted to LinkedIn is considered; LinkedIn carries EITHER one video OR images.
    const candidates = collectTargetedMedia(content.tweets, 'linkedin');

    // 1) A targeted video takes precedence — upload exactly one; skipped photos are logged.
    const video = candidates.find(m => m.type === 'video');
    if (video) {
        // Resume: reuse a video asset already uploaded in a prior chunk (never re-upload).
        const priorVideo = progress.linkedin?.assetUrns?.[0];
        if (priorVideo) return { category: 'VIDEO', assetUrns: [priorVideo] };
        // Budget guard: don't start the video upload once the soft deadline passed.
        if (deadlinePassed(deadline)) throw new DeadlineReachedError();
        const skipped = candidates.filter(m => m.type === 'photo').length;
        if (skipped > 0) console.log(`[publish] LinkedIn: video wins — skipping ${skipped} targeted photo(s)`);
        console.log(`[publish] LinkedIn: video media detected (key=${video.key}) — uploading`);
        const asset = await uploadLinkedInMediaItem(env, video.key, 'video');
        progress.linkedin = { assetUrns: [asset] };
        return { category: 'VIDEO', assetUrns: [asset] };
    }

    // 2) Targeted photos → multi-image post (best-effort per photo). Uploads run through a bounded
    // pool so several images upload in parallel; an image already uploaded in a prior chunk
    // (progress.linkedin.assetUrns[i] set) is reused. Before starting a NEW image upload the soft
    // deadline is checked — if passed, throw so the chunk stops and resumes from saved progress.
    const photoKeys: string[] = candidates.filter(m => m.type === 'photo').map(m => m.key);
    if (photoKeys.length > 0) {
        const slots: (string | null)[] = (progress.linkedin?.assetUrns ?? []).slice();
        progress.linkedin = { assetUrns: slots }; // persist incrementally
        await runPool(photoKeys, UPLOAD_POOL_LIMIT, async (key, index) => {
            if (slots[index] !== undefined && slots[index] !== null) return; // already uploaded
            if (deadlinePassed(deadline)) throw new DeadlineReachedError();
            try {
                slots[index] = await uploadLinkedInMediaItem(env, key, 'photo');
            } catch (err) {
                console.error('[publish] LinkedIn photo upload skipped:', err instanceof Error ? err.message : String(err));
                slots[index] = null;
            }
        });
        const assetUrns = slots.filter((u): u is string => !!u);
        if (assetUrns.length > 0) return { category: 'IMAGE', assetUrns };
    }

    // 3) Draft-level image fallback (auto-generated drafts). R2 key or absolute URL.
    if (draft.image_url) {
        const priorImage = progress.linkedin?.assetUrns?.[0];
        if (priorImage) return { category: 'IMAGE', assetUrns: [priorImage] };
        if (deadlinePassed(deadline)) throw new DeadlineReachedError();
        try {
            const bytes = await loadImageBytes(env, draft.image_url);
            if (bytes) {
                const asset = await uploadImageToLinkedIn(env, bytes);
                progress.linkedin = { assetUrns: [asset] };
                return { category: 'IMAGE', assetUrns: [asset] };
            }
        } catch (err) {
            console.error('[publish] LinkedIn draft-image upload skipped:', err instanceof Error ? err.message : String(err));
        }
    }

    // 4) No usable media → text-only.
    return { category: 'NONE', assetUrns: [] };
}

/** Load image bytes from an R2 key (e.g. `drafts/...`) or an absolute URL. */
async function loadImageBytes(env: Env, imageUrl: string): Promise<ArrayBuffer | null> {
    if (/^https?:\/\//i.test(imageUrl)) {
        const res = await fetch(imageUrl);
        return res.ok ? await res.arrayBuffer() : null;
    }
    const r2 = await env.IMAGES.get(imageUrl);
    return r2 ? await r2.arrayBuffer() : null;
}

// ==================== Tweet Card Generation Helper ====================

/**
 * Generate tweet card images for Instagram when no media exists.
 * Returns array of public URLs for the generated images.
 */
async function generateTweetCardImages(
    env: Env,
    chatId: string,
    draft: Draft,
    content: DraftContent
): Promise<string[]> {
    const workerUrl = env.WORKER_URL;
    if (!workerUrl) return [];

    let user = await getUser(env, chatId);
    const urls: string[] = [];

    // Lazy refresh: if X profile data is missing, fetch it now (one-time, cached in DB)
    if (user && !user.own_display_name_x) {
        try {
            const { getMyProfile } = await import('../integrations/x');
            const { updateOwnProfileData } = await import('../data/user-db');
            const profile = await getMyProfile(env);
            if (profile?.username) {
                await updateOwnProfileData(env, chatId, {
                    profileImageUrl: profile.profile_image_url || '',
                    username: profile.username,
                    displayName: profile.name,
                });
                user = await getUser(env, chatId);
            }
        } catch {
            // Non-fatal — continue with whatever name we have
        }
    }

    // Format timestamp for card display
    const ts = draft.created_at ? new Date(draft.created_at) : new Date();
    const timestamp = ts.toLocaleString('en-US', {
        hour: 'numeric', minute: '2-digit', hour12: true,
        month: 'short', day: 'numeric', year: 'numeric',
    }).replace(',', ' ·');

    if (draft.source === 'repost' && draft.original_tweet_id) {
        // Quote-tweet card: user's commentary + original tweet
        let originalUsername = '';
        let originalDisplayName = '';
        let originalText = '';
        let originalProfileImageUrl: string | null = null;
        let originalVerifiedType: string | undefined;

        // Try DB first, then fall back to X API
        try {
            const { getTwitterTweet } = await import('../data/db');
            const originalTweet = await getTwitterTweet(env, chatId, draft.original_tweet_id);
            if (originalTweet) {
                originalUsername = originalTweet.author_username;
                originalDisplayName = originalTweet.author_display_name || originalTweet.author_username;
                originalText = originalTweet.text;
                originalProfileImageUrl = originalTweet.author_profile_image_url;
            }
        } catch { /* continue */ }

        // Fallback: fetch from X API if DB didn't have the data
        if (!originalText) {
            try {
                const { getTweetById } = await import('../integrations/x');
                const fetched = await getTweetById(env, draft.original_tweet_id);
                if (fetched) {
                    originalText = fetched.tweet.text;
                    originalUsername = fetched.author?.username || '';
                    originalDisplayName = fetched.author?.name || fetched.author?.username || '';
                    originalProfileImageUrl = fetched.author?.profile_image_url || null;
                    originalVerifiedType = fetched.author?.verified_type;
                }
            } catch { /* continue with defaults */ }
        }

        const cardPng = await renderQuoteTweetCard(env, {
            commentText: content.tweets[0]?.text || '',
            commentDisplayName: user?.own_display_name_x || user?.display_name || 'You',
            commentUsername: user?.own_username_x || user?.username || 'user',
            commentProfileImageUrl: user?.own_profile_image_url,
            originalText: originalText || 'Original tweet',
            originalDisplayName: originalDisplayName || originalUsername,
            originalUsername,
            originalProfileImageUrl,
            originalVerifiedType,
            timestamp,
        });

        const key = await storeTweetCard(env, draft.id, 0, cardPng);
        urls.push(`${workerUrl}/media/${key}`);
    } else if (content.tweets.length > 1) {
        // Multi-tweet thread — render individual cards with connecting lines for carousel
        const threadCardData = content.tweets.map(tweet => ({
            displayName: user?.own_display_name_x || user?.display_name || 'User',
            username: user?.own_username_x || user?.username || 'user',
            text: tweet.text,
            profileImageUrl: user?.own_profile_image_url,
            timestamp,
        }));

        // Check if first card already exists (implies all were rendered)
        const existingFirst = await getTweetCard(env, draft.id, 0);
        if (existingFirst) {
            for (let i = 0; i < content.tweets.length; i++) {
                urls.push(`${workerUrl}/media/tweet-cards/${draft.id}/${i}.png`);
            }
        } else {
            const threadPngs = await renderThreadCards(env, threadCardData);
            for (let i = 0; i < threadPngs.length; i++) {
                const key = await storeTweetCard(env, draft.id, i, threadPngs[i]);
                urls.push(`${workerUrl}/media/${key}`);
            }
        }
    } else {
        // Single tweet card
        const existing = await getTweetCard(env, draft.id, 0);
        if (existing) {
            urls.push(`${workerUrl}/media/tweet-cards/${draft.id}/0.png`);
        } else {
            const tweet = content.tweets[0];
            const cardPng = await renderTweetCard(env, {
                displayName: user?.own_display_name_x || user?.display_name || 'User',
                username: user?.own_username_x || user?.username || 'user',
                text: tweet.text,
                profileImageUrl: user?.own_profile_image_url,
                timestamp,
            });

            const key = await storeTweetCard(env, draft.id, 0, cardPng);
            urls.push(`${workerUrl}/media/${key}`);
        }
    }

    return urls;
}
