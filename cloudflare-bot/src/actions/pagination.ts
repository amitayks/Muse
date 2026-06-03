import type { HandlerContext } from '../core/router';
import type { ViewResult } from '../types';
import type { Lang } from '../ui/strings';
import { updateChatState, getPageSize } from '../data/db';
import { renderDraftsList, renderReposList } from '../views';
import type { DraftListType } from '../views/drafts';

export async function paginationAction(ctx: HandlerContext & { value: string; extra?: string }): Promise<ViewResult> {
    const lang = (ctx.lang || 'en') as Lang;

    // New format: page:TYPE:N (e.g., page:auto:2)
    // Legacy format: page:N (treat as auto)
    const { value, extra } = ctx;

    let listType: string;
    let page: number;

    if (extra !== undefined) {
        // New format: value=TYPE, extra=N
        listType = value;
        page = parseInt(extra, 10) || 0;
    } else {
        // Legacy format: value=N
        listType = 'auto';
        page = parseInt(value, 10) || 0;
    }

    if (listType === 'repos') {
        const view = await renderReposList(ctx.env, ctx.chatId, page, lang);
        await updateChatState(ctx.env, ctx.chatId, {
            current_view: 'repos',
            context: { page },
        });
        return view;
    }

    if (listType === 'accounts') {
        const { renderAccountsList } = await import('../views/accounts');
        const view = await renderAccountsList(ctx.env, ctx.chatId, page, lang);
        await updateChatState(ctx.env, ctx.chatId, {
            current_view: 'accounts',
            context: { page },
        });
        return view;
    }

    // Draft list types
    const draftType = (['approved', 'scheduled', 'handwrite', 'published', 'repost'].includes(listType) ? listType : 'auto') as DraftListType;
    const ps = await getPageSize(ctx.env, ctx.chatId);
    const view = await renderDraftsList(ctx.env, ctx.chatId, page, draftType, ps, lang);
    await updateChatState(ctx.env, ctx.chatId, {
        current_view: `drafts_${draftType}`,
        context: { page },
    });
    return view;
}
