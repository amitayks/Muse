/**
 * /api/v1/drafts/* — Draft CRUD and actions
 */

import type { DraftContent, PublishTargets, Tweet, TweetMedia, MediaTargets } from '../types';
import {
    getDraft, getAllDrafts, countDrafts,
    getDraftsBySource, countDraftsBySource, getHandwriteDraftCount,
    updateDraftContent, updateDraftStatus, updateDraftPublishTargets,
    scheduleDraft, deleteDraft, getTimezone, getUserLanguage,
    ensureTweetIds, newTweetId, persistBackfilledTweetIds,
    attachTweetMediaById, removeTweetMediaById, retargetTweetMediaById,
} from '../data/db';
import { getUser } from '../data/user-db';
import { enqueuePublishJob } from '../data/publish-jobs-db';
import { processPublishJobOnce, INLINE_DEADLINE_MS } from '../core/publish-jobs';
import { warmDraftMediaInline, reconcileWarmsAfterContentChange, reconcileWarmsAfterTargetsChange } from '../core/media-prewarm';
import { deleteWarmsForDraft, getWarmRowsForDraft } from '../data/media-uploads-db';
import type { MediaUploadStatus, MediaWarmPlatform } from '../types';
import { toUTC } from '../infra/timezone';
import { syncBotMessage, syncBotHome } from '../services/webapp-sync';
import type { ApiContext } from './api-v1';
import { jsonResponse, errorResponse } from './api-v1';

export async function handleDraftsApi(ctx: ApiContext, path: string): Promise<Response> {
    const { env, chatId, request } = ctx;
    const method = request.method;

    // GET /api/v1/drafts — list drafts
    if (path === '/drafts' && method === 'GET') {
        return listDrafts(ctx);
    }

    // Extract draft ID from path: /drafts/:id or /drafts/:id/action
    const match = path.match(/^\/drafts\/([^/]+)(\/(.+))?$/);
    if (!match) return errorResponse('Not Found', 404);

    const draftId = match[1];
    const action = match[3]; // approve, publish, schedule, refine, targets, etc.

    // GET /api/v1/drafts/:id — draft detail
    if (!action && method === 'GET') {
        return getDraftDetail(ctx, draftId);
    }

    // GET /api/v1/drafts/:id/media-progress — per-(media, platform) warm status for the ring
    if (action === 'media-progress' && method === 'GET') {
        return getMediaProgress(ctx, draftId);
    }

    // PUT /api/v1/drafts/:id — update content
    if (!action && method === 'PUT') {
        return updateContent(ctx, draftId);
    }

    // DELETE /api/v1/drafts/:id — delete draft
    if (!action && method === 'DELETE') {
        return removeDraft(ctx, draftId);
    }

    // POST /api/v1/drafts/:id/approve
    if (action === 'approve' && method === 'POST') {
        return approveDraft(ctx, draftId);
    }

    // POST /api/v1/drafts/:id/publish
    if (action === 'publish' && method === 'POST') {
        return publishDraftAction(ctx, draftId);
    }

    // POST /api/v1/drafts/:id/schedule
    if (action === 'schedule' && method === 'POST') {
        return scheduleDraftAction(ctx, draftId);
    }

    // DELETE /api/v1/drafts/:id/schedule
    if (action === 'schedule' && method === 'DELETE') {
        return unscheduleDraft(ctx, draftId);
    }

    // POST /api/v1/drafts/:id/refine
    if (action === 'refine' && method === 'POST') {
        return refineDraft(ctx, draftId);
    }

    // PUT /api/v1/drafts/:id/targets
    if (action === 'targets' && method === 'PUT') {
        return updateTargets(ctx, draftId);
    }

    // Per-tweet media + image endpoints, keyed by stable tweet id (legacy numeric index also accepted,
    // resolved server-side). The media `:key` is an R2 key that may itself contain '/', so its capture
    // groups use `.+` and the value is URL-decoded; ordering/method disambiguates retarget vs remove.
    if (action) {
        // PUT /drafts/:id/tweets/:tweetId/media/:key/targets — retarget one media item
        const retargetMatch = action.match(/^tweets\/([^/]+)\/media\/(.+)\/targets$/);
        if (retargetMatch && method === 'PUT') {
            return retargetTweetMediaAction(ctx, draftId, retargetMatch[1], decodeURIComponent(retargetMatch[2]));
        }
        // DELETE /drafts/:id/tweets/:tweetId/media/:key — remove (unlink) one media item
        const removeMatch = action.match(/^tweets\/([^/]+)\/media\/(.+)$/);
        if (removeMatch && method === 'DELETE') {
            return removeTweetMediaAction(ctx, draftId, removeMatch[1], decodeURIComponent(removeMatch[2]));
        }
        // POST /drafts/:id/tweets/:tweetId/media — attach an already-uploaded media item
        const attachMatch = action.match(/^tweets\/([^/]+)\/media$/);
        if (attachMatch && method === 'POST') {
            return attachTweetMediaAction(ctx, draftId, attachMatch[1]);
        }
        // POST /drafts/:id/tweets/:tweetId/image — generate an AI image into a tweet slot
        const tweetImageMatch = action.match(/^tweets\/([^/]+)\/image$/);
        if (tweetImageMatch && method === 'POST') {
            return generateTweetImageAction(ctx, draftId, tweetImageMatch[1]);
        }
    }

    return errorResponse('Not Found', 404);
}

// ==================== List ====================

async function listDrafts(ctx: ApiContext): Promise<Response> {
    const { env, chatId, request } = ctx;
    const url = new URL(request.url);
    const status = url.searchParams.get('status') as string | null;
    const source = url.searchParams.get('source');
    const page = parseInt(url.searchParams.get('page') || '0', 10);
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '20', 10), 50);
    const offset = page * limit;

    let drafts;
    let total;

    // ALL statuses — used when filtering purely by source (the Drafts-hub "Type" tiles want
    // every draft of a source, regardless of status). When a status is ALSO supplied (the
    // Needs-Review source-filter chips), we scope to just that status.
    const ALL_STATUSES = ['draft', 'approved', 'scheduled', 'published', 'publishing'];

    if (source) {
        // 'auto' and 'commit' are both code-sourced → treat them together.
        const sources = source === 'auto' || source === 'commit' ? ['auto', 'commit'] : [source];
        const statuses = status ? [status] : ALL_STATUSES;
        [drafts, total] = await Promise.all([
            getDraftsBySource(env, chatId, sources, statuses, limit, offset),
            countDraftsBySource(env, chatId, sources, statuses),
        ]);
    } else if (status) {
        [drafts, total] = await Promise.all([
            getAllDrafts(env, chatId, status as any, limit, offset),
            countDrafts(env, chatId, status as any),
        ]);
    } else {
        // All drafts (no filter)
        [drafts, total] = await Promise.all([
            getAllDrafts(env, chatId, undefined, limit, offset),
            countDrafts(env, chatId),
        ]);
    }

    // Parse JSON fields for each draft
    const parsed = drafts.map(d => ({
        ...d,
        content: safeJsonParse(d.content),
        publish_targets: safeJsonParse(d.publish_targets),
        publish_results: safeJsonParse(d.publish_results),
    }));

    return jsonResponse({ drafts: parsed, total, page, limit });
}

// ==================== Detail ====================

async function getDraftDetail(ctx: ApiContext, draftId: string): Promise<Response> {
    const draft = await getDraft(ctx.env, draftId, ctx.chatId);
    if (!draft) return errorResponse('Draft not found', 404);

    // Update user context so bot knows current state
    const { updateChatState } = await import('../data/db');
    ctx.ctx.waitUntil(updateChatState(ctx.env, ctx.chatId, {
        current_view: 'draft_detail',
        context: { selected_draft_id: draftId },
    }));

    const user = await getUser(ctx.env, ctx.chatId);

    // Lazy id backfill (Decision 1): the editor must have a stable `id` on every tweet before it can
    // address the media endpoints. Assign-if-missing here on read-for-edit. ensureTweetIds returns the
    // SAME reference when nothing changed (no-op for id-bearing / tweet-less shapes), so we only write
    // when a legacy id-less draft was actually backfilled. Persisting NOW (not "on next write") makes
    // the media endpoints and the content-save reconcile resolve the SAME ids the editor just received
    // — spec: legacy draft gets ids on read-for-edit and they persist.
    const parsed = safeJsonParse(draft.content) as DraftContent;
    const withIds = ensureTweetIds(parsed);
    let content = withIds;
    if (withIds !== parsed) {
        // Compare-and-set persist: only write if the stored content is STILL id-less, so two concurrent
        // first-reads of a legacy draft converge on ONE id set (first writer wins). A losing read adopts
        // the winner's already-persisted ids (returned as the authoritative content) — no divergence.
        const authoritativeJson = await persistBackfilledTweetIds(
            ctx.env, draftId, ctx.chatId, draft.content, JSON.stringify(withIds),
        );
        content = safeJsonParse(authoritativeJson) as DraftContent;
    }

    return jsonResponse({
        ...draft,
        content,
        publish_targets: safeJsonParse(draft.publish_targets),
        publish_results: safeJsonParse(draft.publish_results),
        user_profile: user ? {
            display_name: user.own_display_name_x || user.display_name,
            username: user.own_username_x || user.username,
            profile_image_url: user.own_profile_image_url,
            has_instagram: user.has_instagram === 1,
        } : null,
    });
}

// ==================== Media Warm Progress ====================

/**
 * Read-only pre-upload ("warm") progress for a draft's media, keyed media_key → platform → { status }.
 * Drives the webapp's circular progress ring around each per-media platform icon. Ownership-scoped by
 * chat_id; only platforms that have a warm row are included (a missing platform ⇒ no ring). Returns an
 * empty `media` map when the draft has no warm rows — never an error for a valid, owned draft.
 */
async function getMediaProgress(ctx: ApiContext, draftId: string): Promise<Response> {
    const draft = await getDraft(ctx.env, draftId, ctx.chatId);
    if (!draft) return errorResponse('Draft not found', 404);

    const rows = await getWarmRowsForDraft(ctx.env, draftId, ctx.chatId);
    const media: Record<string, Partial<Record<MediaWarmPlatform, { status: MediaUploadStatus }>>> = {};
    for (const row of rows) {
        const byPlatform = media[row.media_key] ?? (media[row.media_key] = {});
        byPlatform[row.platform] = { status: row.status };
    }

    return jsonResponse({ media });
}

// ==================== Update Content ====================

async function updateContent(ctx: ApiContext, draftId: string): Promise<Response> {
    const draft = await getDraft(ctx.env, draftId, ctx.chatId);
    if (!draft) return errorResponse('Draft not found', 404);

    // The content/text save is MEDIA-NON-DESTRUCTIVE (Decision 2). The payload carries tweets as
    // [{ id, text }] in the desired order ONLY — any `media` it includes is IGNORED. We reconcile the
    // incoming tweets against the STORED content by tweet `id`: each surviving tweet keeps its stored
    // media untouched, a new id starts with no media, and a stored id absent from the payload is removed
    // (tweet deletion, its media dropped with it). So a stale / lost-response / media-less client save
    // can never clobber server-held media — the payload simply cannot express media.
    const body = await ctx.request.json() as { content: { format?: DraftContent['format']; tweets?: Array<{ id?: string; text?: string }> } };
    const incoming = body.content?.tweets;
    if (!incoming?.length) return errorResponse('Invalid content', 400);

    const stored = safeJsonParse(draft.content) as DraftContent;
    const storedTweets: Tweet[] = Array.isArray(stored?.tweets) ? stored.tweets : [];
    const byId = new Map<string, Tweet>();
    for (const t of storedTweets) if (t.id) byId.set(t.id, t);

    const reconciledTweets: Tweet[] = incoming.map((t, pos) => {
        // Match the surviving stored tweet by id; carry its media verbatim.
        let storedTweet = t.id ? byId.get(t.id) : undefined;
        // Legacy fallback: a not-yet-persisted id-less stored draft (positional carry, same position).
        if (!storedTweet) {
            const positional = storedTweets[pos];
            if (positional && !positional.id) storedTweet = positional;
        }
        const tweet: Tweet = {
            id: t.id ?? storedTweet?.id ?? newTweetId(),  // backfill ids for id-less stored / new tweets
            text: t.text ?? '',
            index: pos,                                    // reindex = position, for back-compat readers
        };
        // CARRY stored media untouched; new tweets get none. Never read media from the payload.
        if (storedTweet?.media && storedTweet.media.length > 0) tweet.media = storedTweet.media;
        return tweet;
    });

    const reconciled: DraftContent = {
        format: body.content?.format ?? stored?.format ?? 'single',
        tweets: reconciledTweets,
    };

    // updateDraftContent recomputes the denormalized has_video flag from the (preserved) media.
    await updateDraftContent(ctx.env, draftId, ctx.chatId, JSON.stringify(reconciled));

    // Sync bot message
    ctx.ctx.waitUntil(syncBotMessage(ctx.env, ctx.chatId, draftId));

    const updated = await getDraft(ctx.env, draftId, ctx.chatId);

    // Reconcile pre-warmed media for the (now-saved) content: invalidate handles for removed/replaced
    // media and for IG rows whose baked caption changed (X/LinkedIn survive a caption edit), then
    // enqueue 'pending' warm rows for the current (media, platform) set and kick a best-effort first
    // pass in the background. All no-ops for a far-future scheduled draft (warm-eligibility gate inside
    // the engine) and never throw into the response path — warming is a pure optimization; publish falls
    // back to inline upload. Mirrors the publish-action's waitUntil(processPublishJobOnce(...)) kick above.
    if (updated) {
        await reconcileWarmsAfterContentChange(ctx.env, updated);
        ctx.ctx.waitUntil(warmDraftMediaInline(ctx.env, updated));
    }

    return jsonResponse({
        ...updated,
        content: safeJsonParse(updated!.content),
        publish_targets: safeJsonParse(updated!.publish_targets),
        publish_results: safeJsonParse(updated!.publish_results),
    });
}

// ==================== Approve ====================

async function approveDraft(ctx: ApiContext, draftId: string): Promise<Response> {
    const draft = await getDraft(ctx.env, draftId, ctx.chatId);
    if (!draft) return errorResponse('Draft not found', 404);
    if (draft.status !== 'draft') return errorResponse('Can only approve drafts with status "draft"', 400);

    await updateDraftStatus(ctx.env, draftId, ctx.chatId, 'approved');
    ctx.ctx.waitUntil(syncBotMessage(ctx.env, ctx.chatId, draftId));

    return jsonResponse({ success: true, status: 'approved' });
}

// ==================== Publish ====================

async function publishDraftAction(ctx: ApiContext, draftId: string): Promise<Response> {
    const draft = await getDraft(ctx.env, draftId, ctx.chatId);
    if (!draft) return errorResponse('Draft not found', 404);
    if (draft.status !== 'approved' && draft.status !== 'scheduled') {
        return errorResponse('Can only publish approved or scheduled drafts', 400);
    }

    const priorStatus = draft.status; // 'approved' | 'scheduled' — restored on full failure
    const lang = await getUserLanguage(ctx.env, ctx.chatId);

    // Mark as publishing immediately so the UI reflects the pending state, then enqueue a durable
    // publish job. The processor (core/publish-jobs.ts) owns the publish, partial-failure handling,
    // status finalization, prior-status restore, and the single user notification — see openspec
    // durable-publish-queue.
    await updateDraftStatus(ctx.env, draftId, ctx.chatId, 'publishing');
    await enqueuePublishJob(ctx.env, { draftId, chatId: ctx.chatId, lang, priorStatus });

    // Kick the first chunk inline so light posts finish without waiting for the next cron tick; the
    // processor itself runs syncBotMessage after finalizing, so no extra sync is needed here.
    ctx.ctx.waitUntil(processPublishJobOnce(ctx.env, draftId, Date.now() + INLINE_DEADLINE_MS));

    return jsonResponse({ status: 'publishing' });
}

// ==================== Schedule ====================

async function scheduleDraftAction(ctx: ApiContext, draftId: string): Promise<Response> {
    const draft = await getDraft(ctx.env, draftId, ctx.chatId);
    if (!draft) return errorResponse('Draft not found', 404);

    const body = await ctx.request.json() as { scheduled_at: string };
    if (!body.scheduled_at) return errorResponse('scheduled_at is required', 400);

    // The webapp sends a wall-clock datetime (no timezone) from its <input type="datetime-local">.
    // Interpret it in the user's configured timezone — exactly like the bot's own schedule input
    // handler (inputs/schedule.ts) — and convert to UTC for storage. The worker runs in UTC, so
    // `new Date('YYYY-MM-DDTHH:mm')` parses the wall-clock as UTC; toUTC then subtracts the offset.
    const tz = await getTimezone(ctx.env, ctx.chatId);
    const localDate = new Date(body.scheduled_at);
    if (isNaN(localDate.getTime())) return errorResponse('Invalid scheduled_at', 400);
    const scheduledAtUTC = toUTC(localDate, tz);
    if (scheduledAtUTC.getTime() <= Date.now()) {
        return errorResponse('scheduled_at must be in the future', 400);
    }

    const scheduledAtISO = scheduledAtUTC.toISOString();
    await scheduleDraft(ctx.env, draftId, ctx.chatId, scheduledAtISO);
    ctx.ctx.waitUntil(syncBotMessage(ctx.env, ctx.chatId, draftId));

    return jsonResponse({ success: true, status: 'scheduled', scheduled_at: scheduledAtISO });
}

async function unscheduleDraft(ctx: ApiContext, draftId: string): Promise<Response> {
    const draft = await getDraft(ctx.env, draftId, ctx.chatId);
    if (!draft) return errorResponse('Draft not found', 404);
    if (draft.status !== 'scheduled') return errorResponse('Draft is not scheduled', 400);

    await updateDraftStatus(ctx.env, draftId, ctx.chatId, 'approved');
    // Clear scheduled_at
    await ctx.env.DB.prepare('UPDATE drafts SET scheduled_at = NULL, updated_at = datetime(\'now\') WHERE id = ? AND chat_id = ?')
        .bind(draftId, ctx.chatId)
        .run();

    ctx.ctx.waitUntil(syncBotMessage(ctx.env, ctx.chatId, draftId));
    // Now unscheduled ⇒ warm-eligible immediately (a far-future scheduled draft may never have been
    // warmed). Pass the post-update shape so eligibility sees it as unscheduled; warm is idempotent.
    ctx.ctx.waitUntil(warmDraftMediaInline(ctx.env, { ...draft, status: 'approved', scheduled_at: null }));

    return jsonResponse({ success: true, status: 'approved' });
}

// ==================== Refine ====================

async function refineDraft(ctx: ApiContext, draftId: string): Promise<Response> {
    const draft = await getDraft(ctx.env, draftId, ctx.chatId);
    if (!draft) return errorResponse('Draft not found', 404);

    const body = await ctx.request.json() as { instruction: string; newImage?: boolean };
    if (!body.instruction) return errorResponse('instruction is required', 400);

    const content = JSON.parse(draft.content) as DraftContent;

    const { hydrateEnv } = await import('../data/user-keys');
    const userEnv = await hydrateEnv(ctx.env, ctx.chatId);
    const { editContent, detectContentLang } = await import('../ai/gemini');

    // Resolve the refine language from the draft itself — never default to English. The per-draft stored
    // language wins; legacy NULL drafts fall back to content detection, then the user's global language.
    const lang = draft.language ?? detectContentLang(content) ?? await getUserLanguage(ctx.env, ctx.chatId);

    // Text refine (media is preserved by index inside refineContent — see ai/gemini.ts).
    const updatedContent = await editContent(userEnv, content, body.instruction, ctx.chatId, lang);

    // "Generate new image" ON: the first tweet's image is being replaced. Clear it BEFORE saving so the
    // subsequent generateTweetImage (which APPENDS) doesn't leave two images on tweet 0. Tweets 1..N keep
    // their preserved-by-index media untouched.
    if (body.newImage && updatedContent.tweets[0]) {
        updatedContent.tweets[0].media = [];
    }

    await updateDraftContent(ctx.env, draftId, ctx.chatId, JSON.stringify(updatedContent));

    // Generate a fresh first-tweet image when requested. The text refine is already persisted above, so an
    // image-model failure here never loses the rewrite — we surface an `imageError` and let the user retry
    // via the existing per-tweet image button.
    let imageError: string | undefined;
    if (body.newImage) {
        try {
            const { generateTweetImage } = await import('../ai/tweet-image');
            // Key by the first tweet's stable id (refineContent assigns ids); fall back to index 0 for any
            // legacy id-less shape. The image is appended atomically into that tweet's freshly-cleared media.
            await generateTweetImage(userEnv, ctx.chatId, draftId, updatedContent.tweets[0]?.id ?? 0);
        } catch (err) {
            imageError = err instanceof Error ? err.message : String(err);
            console.error('[refine] new-image generation failed:', imageError);
        }
    }

    ctx.ctx.waitUntil(syncBotMessage(ctx.env, ctx.chatId, draftId));

    // Reconcile warmed media against the FINAL saved content (post text-refine, post image-gen): an IG
    // caption change invalidates IG rows, discarded media is orphaned, and new/preserved media gets pending
    // rows (X/LinkedIn handles survive caption edits). Best-effort, never blocks the response.
    const refined = await getDraft(ctx.env, draftId, ctx.chatId);
    if (refined) {
        await reconcileWarmsAfterContentChange(ctx.env, refined);
        ctx.ctx.waitUntil(warmDraftMediaInline(ctx.env, refined));
    }

    // Return the final content, re-parsed from the saved draft so it reflects any generated first-tweet
    // image (generateTweetImage persists media via its own atomic append, not through updatedContent).
    const finalContent = refined ? (JSON.parse(refined.content) as DraftContent) : updatedContent;
    return jsonResponse({ success: true, content: finalContent, imageError });
}

// ==================== Platform Targets ====================

async function updateTargets(ctx: ApiContext, draftId: string): Promise<Response> {
    const draft = await getDraft(ctx.env, draftId, ctx.chatId);
    if (!draft) return errorResponse('Draft not found', 404);

    const body = await ctx.request.json() as { publish_targets: PublishTargets };
    if (!body.publish_targets) return errorResponse('publish_targets is required', 400);

    await updateDraftPublishTargets(ctx.env, draftId, ctx.chatId, body.publish_targets);
    ctx.ctx.waitUntil(syncBotMessage(ctx.env, ctx.chatId, draftId));

    // Reconcile pre-warmed media for the new target set: orphan handles for de-targeted platforms and
    // enqueue pending rows for newly-targeted ones, then kick a best-effort first warm pass. Re-fetch so
    // the reconcile reads the just-saved publish_targets. Best-effort; never throws into the response.
    const updated = await getDraft(ctx.env, draftId, ctx.chatId);
    if (updated) {
        await reconcileWarmsAfterTargetsChange(ctx.env, updated);
        ctx.ctx.waitUntil(warmDraftMediaInline(ctx.env, updated));
    }

    return jsonResponse({ success: true, publish_targets: body.publish_targets });
}

// ==================== Per-tweet image generation ====================

async function generateTweetImageAction(ctx: ApiContext, draftId: string, tweetRef: string): Promise<Response> {
    // Hydrate per-user keys (GOOGLE_API_KEY/AI_PROVIDER/X bearer) — the raw API env has none.
    const { hydrateEnv } = await import('../data/user-keys');
    const userEnv = await hydrateEnv(ctx.env, ctx.chatId);
    const { generateTweetImage, TweetImageError } = await import('../ai/tweet-image');
    try {
        // Keyed by stable tweet id (generateTweetImage resolves id → index internally; legacy numeric
        // index strings still resolve for back-compat). The generated image is appended atomically.
        const result = await generateTweetImage(userEnv, ctx.chatId, draftId, tweetRef);
        // Reflect the newly generated media on the Telegram bot message + reconcile pre-warmed uploads.
        await runMediaReconcile(ctx, draftId);
        // Return the RESOLVED stable tweet id (like attach/remove/retarget) so the editor binds the
        // generated media to a durable id, never a numeric-index ref that a later save would mis-match.
        return jsonResponse({ success: true, media: result.media, tweetId: result.tweetId });
    } catch (err) {
        if (err instanceof TweetImageError) {
            // Log the handled failure too — without this, image-model errors (429/503/safety/no-image,
            // already folded into err.message with the Gemini detail) return to the webapp but leave
            // ZERO trace in the tail, making "image failed" undiagnosable. Surface status + reason.
            console.error('[tweet-image] generation failed:', err.status, err.message, '— draft', draftId, 'tweet', tweetRef);
            return errorResponse(err.message, err.status);
        }
        console.error('[tweet-image] generation failed:', err);
        return errorResponse(`Image generation failed: ${err instanceof Error ? err.message : String(err)}`, 500);
    }
}

// ==================== Dedicated atomic media endpoints (keyed by tweet id) ====================

/**
 * Shared post-mutation tail for every media endpoint (attach / remove / retarget / image): sync the
 * bot message and reconcile pre-warmed uploads against the new media set — exactly what the content
 * path does. Best-effort; warming never throws into the response.
 */
async function runMediaReconcile(ctx: ApiContext, draftId: string): Promise<void> {
    ctx.ctx.waitUntil(syncBotMessage(ctx.env, ctx.chatId, draftId));
    const updated = await getDraft(ctx.env, draftId, ctx.chatId);
    if (updated) {
        await reconcileWarmsAfterContentChange(ctx.env, updated);
        ctx.ctx.waitUntil(warmDraftMediaInline(ctx.env, updated));
    }
}

// POST /drafts/:id/tweets/:tweetId/media — attach an already-uploaded media item to a tweet.
async function attachTweetMediaAction(ctx: ApiContext, draftId: string, tweetId: string): Promise<Response> {
    const body = await ctx.request.json() as { key?: string; type?: string; width?: number; height?: number; targets?: MediaTargets };
    if (!body.key || (body.type !== 'photo' && body.type !== 'video')) {
        return errorResponse('key and type ("photo"|"video") are required', 400);
    }
    const media: TweetMedia = { key: body.key, type: body.type };
    if (typeof body.width === 'number') media.width = body.width;
    if (typeof body.height === 'number') media.height = body.height;
    if (body.targets) media.targets = body.targets;

    const result = await attachTweetMediaById(ctx.env, draftId, ctx.chatId, tweetId, media);
    if (!result) return errorResponse('Draft or tweet not found', 404);
    await runMediaReconcile(ctx, draftId);
    // Return the RESOLVED stable tweet id (not the client's raw ref) so an id-less/new tweet gets a
    // durable id the editor adopts, instead of misbinding to a numeric index string.
    return jsonResponse({ success: true, tweetId: result.tweetId, tweetIndex: result.tweetIndex, media: result.media });
}

// DELETE /drafts/:id/tweets/:tweetId/media/:key — unlink one media item (R2 object retained).
async function removeTweetMediaAction(ctx: ApiContext, draftId: string, tweetId: string, key: string): Promise<Response> {
    const result = await removeTweetMediaById(ctx.env, draftId, ctx.chatId, tweetId, key);
    if (!result) return errorResponse('Draft or tweet not found', 404);
    await runMediaReconcile(ctx, draftId);
    return jsonResponse({ success: true, tweetId: result.tweetId, tweetIndex: result.tweetIndex, media: result.media });
}

// PUT /drafts/:id/tweets/:tweetId/media/:key/targets — set one media item's per-item platform targeting.
async function retargetTweetMediaAction(ctx: ApiContext, draftId: string, tweetId: string, key: string): Promise<Response> {
    const body = await ctx.request.json() as { targets?: MediaTargets };
    if (!body.targets || typeof body.targets !== 'object') return errorResponse('targets is required', 400);

    const result = await retargetTweetMediaById(ctx.env, draftId, ctx.chatId, tweetId, key, body.targets);
    if (!result) return errorResponse('Draft, tweet, or media item not found', 404);
    await runMediaReconcile(ctx, draftId);
    return jsonResponse({ success: true, tweetId: result.tweetId, tweetIndex: result.tweetIndex, media: result.media });
}

// ==================== Delete ====================

async function removeDraft(ctx: ApiContext, draftId: string): Promise<Response> {
    const draft = await getDraft(ctx.env, draftId, ctx.chatId);
    if (!draft) return errorResponse('Draft not found', 404);

    // Clean up R2 image if present
    if (draft.image_url) {
        try { await ctx.env.IMAGES.delete(draft.image_url); } catch { /* ignore */ }
    }

    await deleteDraft(ctx.env, draftId, ctx.chatId);

    // Clean up any pre-warmed media handles for the deleted draft (best-effort — orphaned rows would
    // otherwise linger; warming is never a correctness dependency so a failure here is harmless).
    try { await deleteWarmsForDraft(ctx.env, draftId); } catch { /* ignore */ }

    ctx.ctx.waitUntil(syncBotHome(ctx.env, ctx.chatId));

    return jsonResponse({ success: true });
}

// ==================== Helpers ====================

function safeJsonParse(str: string | null | undefined): unknown {
    if (!str) return {};
    try { return JSON.parse(str); } catch { return {}; }
}
