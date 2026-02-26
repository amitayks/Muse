import type { HandlerContext } from '../core/router';
import type { ViewResult } from '../types';
import type { Lang } from '../ui/strings';
import { t } from '../ui/strings';
import { getAllDrafts } from '../services/db';
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
        try {
            const result = await publishDraft(env, chatId, draft);
            results.push(t(lang, 'actions.publishedDraft').replace('{number}', String(draft.pr_number)).replace('{url}', result.url));
        } catch (error) {
            results.push(t(lang, 'actions.publishFailed').replace('{number}', String(draft.pr_number)));
        }
    }

    return renderSuccess(t(lang, 'actions.publishedCount').replace('{count}', String(results.length)).replace('{results}', results.join('\n')), lang);
}
