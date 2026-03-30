/**
 * /api/v1/drafts/* — Draft CRUD and actions
 */

import type { DraftContent, PublishTargets } from '../types';
import {
    getDraft, getAllDrafts, countDrafts,
    getDraftsBySource, countDraftsBySource, getHandwriteDraftCount,
    updateDraftContent, updateDraftStatus, updateDraftPublishTargets,
    scheduleDraft, deleteDraft,
} from '../data/db';
import { getUser } from '../data/user-db';
import { publishDraft } from '../core/publish';
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

    if (source === 'auto' || source === 'commit') {
        [drafts, total] = await Promise.all([
            getDraftsBySource(env, chatId, ['auto', 'commit'], ['draft'], limit, offset),
            countDraftsBySource(env, chatId, ['auto', 'commit'], ['draft']),
        ]);
    } else if (source === 'handwrite') {
        [drafts, total] = await Promise.all([
            getDraftsBySource(env, chatId, 'handwrite', ['draft'], limit, offset),
            countDraftsBySource(env, chatId, 'handwrite', ['draft']),
        ]);
    } else if (source === 'repost') {
        [drafts, total] = await Promise.all([
            getDraftsBySource(env, chatId, 'repost', ['draft'], limit, offset),
            countDraftsBySource(env, chatId, 'repost', ['draft']),
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

    // Mark as publishing
    await updateDraftStatus(ctx.env, draftId, ctx.chatId, 'publishing');

    // Hydrate env with user keys
    const { hydrateEnv } = await import('../data/user-keys');
    const userEnv = await hydrateEnv(ctx.env, ctx.chatId);

    const result = await publishDraft(userEnv, ctx.chatId, { ...draft, status: 'publishing' });

    ctx.ctx.waitUntil(syncBotMessage(ctx.env, ctx.chatId, draftId));

    return jsonResponse({
        success: result.success,
        results: result.results,
        url: result.url,
    });
}

// ==================== Schedule ====================

async function scheduleDraftAction(ctx: ApiContext, draftId: string): Promise<Response> {
    const draft = await getDraft(ctx.env, draftId, ctx.chatId);
    if (!draft) return errorResponse('Draft not found', 404);

    const body = await ctx.request.json() as { scheduled_at: string };
    if (!body.scheduled_at) return errorResponse('scheduled_at is required', 400);

    await scheduleDraft(ctx.env, draftId, ctx.chatId, body.scheduled_at);
    ctx.ctx.waitUntil(syncBotMessage(ctx.env, ctx.chatId, draftId));

    return jsonResponse({ success: true, status: 'scheduled', scheduled_at: body.scheduled_at });
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
