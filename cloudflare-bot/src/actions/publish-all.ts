import type { HandlerContext } from '../core/router';
import type { ViewResult } from '../types';
import type { Lang } from '../ui/strings';
import { t } from '../ui/strings';
import { getAllDrafts, updateDraftStatus } from '../data/db';
import { enqueuePublishJob } from '../data/publish-jobs-db';
import { processPublishJobOnce, INLINE_DEADLINE_MS } from '../core/publish-jobs';
import { renderError, renderSuccess } from '../views';

export async function publishAllAction(ctx: HandlerContext & { value: string }): Promise<ViewResult> {
    const lang = (ctx.lang || 'en') as Lang;
    const { env, chatId } = ctx;
    const drafts = await getAllDrafts(env, chatId, 'approved');

    if (drafts.length === 0) {
        return renderError(t(lang, 'actions.noApprovedDrafts'), lang);
    }

    // Enqueue a durable publish job per draft; the processor (core/publish-jobs.ts) owns the
    // publish, finalization, prior-status restore, and the single per-draft notification — see
    // openspec durable-publish-queue. Kick the first chunk inline when a request context exists.
    for (const draft of drafts) {
        // Mark 'publishing' before handing off (caller-owned transition; also satisfies the
        // deferred-X-video processor's status === 'publishing' idempotency guard so a video
        // draft is finalized rather than dropped).
        await updateDraftStatus(env, draft.id, chatId, 'publishing');
        await enqueuePublishJob(env, { draftId: draft.id, chatId, lang, priorStatus: 'approved' });
        if (ctx.executionCtx) {
            ctx.executionCtx.waitUntil(processPublishJobOnce(env, draft.id, Date.now() + INLINE_DEADLINE_MS));
        }
    }

    return renderSuccess(t(lang, 'actions.publishedCount').replace('{count}', String(drafts.length)).replace('{results}', ''), lang);
}
