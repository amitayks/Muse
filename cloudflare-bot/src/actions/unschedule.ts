import type { HandlerContext } from '../core/router';
import type { ViewResult } from '../types';
import type { Lang } from '../ui/strings';
import { t } from '../ui/strings';
import { updateDraftStatus } from '../data/db';
import { renderSuccess } from '../views';

export async function unscheduleAction(ctx: HandlerContext & { value: string; extra?: string }): Promise<ViewResult> {
    const lang = (ctx.lang || 'en') as Lang;
    const draftId = ctx.extra!;
    await updateDraftStatus(ctx.env, draftId, ctx.chatId, 'draft');
    return renderSuccess(t(lang, 'actions.scheduleCancelled'), lang);
}
