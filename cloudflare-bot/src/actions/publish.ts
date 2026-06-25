import type { HandlerContext } from '../core/router';
import type { ViewResult } from '../types';
import type { Lang } from '../ui/strings';
import { getDraft, updateDraftStatus } from '../data/db';
import { enqueuePublishJob } from '../data/publish-jobs-db';
import { processPublishJobOnce, INLINE_DEADLINE_MS } from '../core/publish-jobs';
import { renderError } from '../views';

export async function publishAction(ctx: HandlerContext & { value: string; extra?: string }): Promise<ViewResult> {
    const lang = (ctx.lang || 'en') as Lang;
    const draftId = ctx.extra!;
    const draft = await getDraft(ctx.env, draftId, ctx.chatId);
    if (!draft) {
        return renderError('Draft not found.', lang);
    }

    // Guard: prevent duplicate publishes (Telegram webhook retries).
    // 'publishing' also covers a deferred X video post in flight (the draft stays 'publishing'
    // while the every-minute cron processor retries the tweet-creation).
    if (draft.status === 'publishing' || draft.status === 'published') {
        const label = draft.status === 'published' ? 'Already published.' : 'Already publishing...';
        return { text: `⏳ ${label}`, keyboard: [] };
    }

    const priorStatus = draft.status; // restored by the processor on full failure

    // Mark as publishing immediately to prevent duplicates, then enqueue a durable publish job.
    // The processor (core/publish-jobs.ts) owns the publish, partial-failure handling, status
    // finalization, and the single user notification — see openspec durable-publish-queue.
    await updateDraftStatus(ctx.env, draft.id, ctx.chatId, 'publishing');
    await enqueuePublishJob(ctx.env, { draftId: draft.id, chatId: ctx.chatId, lang, priorStatus });

    // Kick the first chunk inline so light posts finish without waiting for the next cron tick.
    const env = ctx.env;
    if (ctx.executionCtx) {
        ctx.executionCtx.waitUntil(processPublishJobOnce(env, draft.id, Date.now() + INLINE_DEADLINE_MS));
    } else {
        await processPublishJobOnce(env, draft.id, Date.now() + INLINE_DEADLINE_MS);
    }

    // Immediate response — edits the current message to "Publishing..."
    return {
        text: `⏳ <b>Publishing...</b>\n\nYou'll be notified when it's done.`,
        keyboard: [],
    };
}
