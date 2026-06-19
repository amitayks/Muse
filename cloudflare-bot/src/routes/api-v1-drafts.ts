/**
 * /api/v1/drafts/* — Draft CRUD and actions
 */

import type { DraftContent, PublishTargets } from '../types';
import {
    getDraft, getAllDrafts, countDrafts,
    getDraftsBySource, countDraftsBySource, getHandwriteDraftCount,
    updateDraftContent, updateDraftStatus, updateDraftPublishTargets,
    scheduleDraft, deleteDraft, getTimezone,
} from '../data/db';
import { getUser } from '../data/user-db';
import { publishDraft } from '../core/publish';
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

    // Mark as publishing immediately so the UI reflects the pending state
    await updateDraftStatus(ctx.env, draftId, ctx.chatId, 'publishing');

    // Run the (potentially slow — video upload + X processing) publish pipeline in the
    // background and return right away, instead of blocking the request. publishDraft()
    // transitions the draft to 'published' on any success; on full failure we restore the
    // prior status. syncBotMessage then updates the Telegram message to reflect the outcome.
    ctx.ctx.waitUntil((async () => {
        try {
            const { hydrateEnv } = await import('../data/user-keys');
            const userEnv = await hydrateEnv(ctx.env, ctx.chatId);
            const result = await publishDraft(userEnv, ctx.chatId, { ...draft, status: 'publishing' });
            // Don't revert on a deferred X video post: publishDraft left the draft in 'publishing'
            // and the every-minute cron processor (core/x-pending.ts) will finalize it
            // (published / errors.x).
            if (!result.success && !result.deferredX) {
                await updateDraftStatus(ctx.env, draftId, ctx.chatId, priorStatus);
            }
        } catch (err) {
            console.error('[api] background publish failed:', err instanceof Error ? err.message : String(err));
            await updateDraftStatus(ctx.env, draftId, ctx.chatId, priorStatus);
        } finally {
            await syncBotMessage(ctx.env, ctx.chatId, draftId);
        }
    })());

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
    ctx.ctx.waitUntil(syncBotHome(ctx.env, ctx.chatId));

    return jsonResponse({ success: true });
}

// ==================== Helpers ====================

function safeJsonParse(str: string | null | undefined): unknown {
    if (!str) return {};
    try { return JSON.parse(str); } catch { return {}; }
}
