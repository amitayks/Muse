import type { HandlerContext } from '../core/router';
import type { ViewResult } from '../types';
import type { Lang } from '../ui/strings';
import { t } from '../ui/strings';
import { getDraft, getTimezone } from '../data/db';
import { publishDraft } from '../core/publish';
import { renderDraftDetail, renderError, renderSuccess } from '../views';
import { platformEmoji, platformLabel, formatPlatformSummary } from '../views/platform-toggle';

export async function publishAction(ctx: HandlerContext & { value: string; extra?: string }): Promise<ViewResult> {
    const lang = (ctx.lang || 'en') as Lang;
    const draftId = ctx.extra!;
    const draft = await getDraft(ctx.env, draftId, ctx.chatId);
    if (!draft) {
        return renderError('Draft not found.', lang);
    }

    const result = await publishDraft(ctx.env, ctx.chatId, draft);

    if (!result.success) {
        const errorMessages = Object.entries(result.results.errors || {})
            .map(([p, msg]) => `${platformEmoji(p)} ${platformLabel(p, lang)}: ${msg}`)
            .join('\n');
        return renderError(`Publishing failed:\n\n<code>${errorMessages}</code>`, lang);
    }

    // View rendering is separate — publish already succeeded at this point
    try {
        const tz = await getTimezone(ctx.env, ctx.chatId);
        const view = await renderDraftDetail(ctx.env, ctx.chatId, draftId, tz, lang);

        // Prepend partial success warning if some platforms failed
        const hasErrors = result.results.errors && Object.keys(result.results.errors).length > 0;
        if (hasErrors) {
            const summary = formatPlatformSummary(result.results, lang);
            view.text = `⚠️ <b>${t(lang, 'notifications.scheduledPostPartial')}</b>\n${summary}\n\n${view.text}`;
        }

        return view;
    } catch {
        return renderSuccess(t(lang, 'actions.publishedToX').replace('{url}', result.url), lang);
    }
}
