/**
 * /api/v1/drafts/* — Draft CRUD and actions
 */

import type { DraftContent, PublishTargets } from '../types';
import {
    getDraft, getAllDrafts, countDrafts,
    getDraftsBySource, countDraftsBySource, getHandwriteDraftCount,
    updateDraftContent, updateDraftStatus, updateDraftPublishTargets,
    scheduleDraft, deleteDraft, getTimezone, getUserLanguage,
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

    // POST /api/v1/drafts/:id/tweets/:idx/image — generate an AI image into a tweet slot
    const tweetImageMatch = action?.match(/^tweets\/(\d+)\/image$/);
    if (tweetImageMatch && method === 'POST') {
        return generateTweetImageAction(ctx, draftId, Number(tweetImageMatch[1]));
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

    return jsonResponse({
        ...draft,
        content: safeJsonParse(draft.content),
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

    const body = await ctx.request.json() as { content: DraftContent };
    if (!body.content?.tweets?.length) return errorResponse('Invalid content', 400);

    await updateDraftContent(ctx.env, draftId, ctx.chatId, JSON.stringify(body.content));

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

    const body = await ctx.request.json() as { instruction: string };
    if (!body.instruction) return errorResponse('instruction is required', 400);

    const content = JSON.parse(draft.content) as DraftContent;

    // Use the AI edit function
    const { hydrateEnv } = await import('../data/user-keys');
    const userEnv = await hydrateEnv(ctx.env, ctx.chatId);
    const { editContent } = await import('../ai/gemini');
    const updatedContent = await editContent(userEnv, content, body.instruction, ctx.chatId);

    await updateDraftContent(ctx.env, draftId, ctx.chatId, JSON.stringify(updatedContent));
    ctx.ctx.waitUntil(syncBotMessage(ctx.env, ctx.chatId, draftId));

    // Reconcile after an AI content edit: an IG caption change invalidates IG rows, removed/replaced
    // media is orphaned, and new media gets pending rows (X/LinkedIn handles survive caption edits).
    // Best-effort, never blocks the response.
    const refined = await getDraft(ctx.env, draftId, ctx.chatId);
    if (refined) {
        await reconcileWarmsAfterContentChange(ctx.env, refined);
        ctx.ctx.waitUntil(warmDraftMediaInline(ctx.env, refined));
    }

    return jsonResponse({ success: true, content: updatedContent });
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

async function generateTweetImageAction(ctx: ApiContext, draftId: string, tweetIndex: number): Promise<Response> {
    // Hydrate per-user keys (GOOGLE_API_KEY/AI_PROVIDER/X bearer) — the raw API env has none.
    const { hydrateEnv } = await import('../data/user-keys');
    const userEnv = await hydrateEnv(ctx.env, ctx.chatId);
    const { generateTweetImage, TweetImageError } = await import('../ai/tweet-image');
    try {
        const result = await generateTweetImage(userEnv, ctx.chatId, draftId, tweetIndex);
        // Reflect the newly generated media on the Telegram bot message.
        ctx.ctx.waitUntil(syncBotMessage(ctx.env, ctx.chatId, draftId));
        return jsonResponse({ success: true, media: result.media });
    } catch (err) {
        if (err instanceof TweetImageError) {
            return errorResponse(err.message, err.status);
        }
        console.error('[tweet-image] generation failed:', err);
        return errorResponse(`Image generation failed: ${err instanceof Error ? err.message : String(err)}`, 500);
    }
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
