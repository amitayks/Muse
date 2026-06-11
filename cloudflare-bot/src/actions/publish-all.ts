import type { HandlerContext } from '../core/router';
import type { ViewResult } from '../types';
import type { Lang } from '../ui/strings';
import { t } from '../ui/strings';
import { getAllDrafts, updateDraftStatus } from '../data/db';
import { publishDraft } from '../core/publish';
import { renderError, renderSuccess } from '../views';

export async function publishAllAction(ctx: HandlerContext & { value: string }): Promise<ViewResult> {
    const lang = (ctx.lang || 'en') as Lang;
    const { env, chatId } = ctx;
    const drafts = await getAllDrafts(env, chatId, 'approved');

    if (drafts.length === 0) {
        return renderError(t(lang, 'actions.noApprovedDrafts'), lang);
    }

    const results: string[] = [];

    for (const draft of drafts) {
        // Mark 'publishing' before handing off (caller-owned transition; also satisfies the
        // deferred-X-video processor's status === 'publishing' idempotency guard so a video
        // draft is finalized by core/x-pending.ts rather than dropped).
        await updateDraftStatus(env, draft.id, chatId, 'publishing');
        const result = await publishDraft(env, chatId, draft);
        if (result.deferredX) {
            // Video: media uploaded, tweet-creation deferred to the every-minute cron processor,
            // which sends the final notification. Draft stays 'publishing'.
            results.push(t(lang, 'actions.publishedDraft').replace('{number}', String(draft.pr_number)).replace('{url}', result.url || '…'));
        } else if (result.success) {
            results.push(t(lang, 'actions.publishedDraft').replace('{number}', String(draft.pr_number)).replace('{url}', result.url));
        } else {
            // Full failure → publishDraft did not transition the draft; restore 'approved' so the
            // user can retry (we forced 'publishing' above).
            await updateDraftStatus(env, draft.id, chatId, 'approved');
            results.push(t(lang, 'actions.publishFailed').replace('{number}', String(draft.pr_number)));
        }
    }

    return renderSuccess(t(lang, 'actions.publishedCount').replace('{count}', String(results.length)).replace('{results}', results.join('\n')), lang);
}
