import type { HandlerContext } from '../core/router';
import type { ViewResult } from '../types';
import type { Lang } from '../ui/strings';
import { updateDraftStatus } from '../data/db';
import { renderDraftDetail } from '../views';

export async function approveAction(ctx: HandlerContext & { value: string; extra?: string }): Promise<ViewResult> {
    const lang = (ctx.lang || 'en') as Lang;
    const draftId = ctx.extra!;
    await updateDraftStatus(ctx.env, draftId, ctx.chatId, 'approved');
    return renderDraftDetail(ctx.env, ctx.chatId, draftId, undefined, lang);
}
