/**
 * Thumbnail drafts list view
 */

import type { Env, ViewResult, InlineButton } from '../types';
import type { Lang } from '../ui/strings';
import { t } from '../ui/strings';
import { getThumbDrafts, countThumbDrafts } from '../data/thumb-db';
import { homeButton, backButton } from '../ui/components';
import { escapeHtml } from '../ui/utils';

export async function renderThumbDraftsList(
    env: Env,
    chatId: string,
    page = 0,
    lang: Lang = 'en',
    pageSize = 5,
): Promise<ViewResult> {
    const limit = pageSize;
    const offset = page * limit;
    const [drafts, total] = await Promise.all([
        getThumbDrafts(env, chatId, limit, offset),
        countThumbDrafts(env, chatId),
    ]);

    const totalPages = Math.ceil(total / limit);

    if (drafts.length === 0) {
        return {
            text: `🖼 <b>${t(lang, 'thumb.draftsTitle')}</b>

${t(lang, 'thumb.noDrafts')}`,
            keyboard: [
                [backButton('view:drafts', lang), homeButton(lang)],
            ],
        };
    }

    const buttons: InlineButton[][] = drafts.map(d => {
        const title = d.title.length > 40 ? d.title.substring(0, 37) + '...' : d.title;
        return [{ text: `🖼 ${title}`, callback_data: `thumb:detail:${d.id}` }];
    });

    // Pagination
    const paginationRow: InlineButton[] = [];
    if (page > 0) {
        paginationRow.push({ text: t(lang, 'common.prev'), callback_data: `thumb:list:${page - 1}` });
    }
    if (page < totalPages - 1) {
        paginationRow.push({ text: t(lang, 'common.next'), callback_data: `thumb:list:${page + 1}` });
    }
    if (paginationRow.length > 0) {
        buttons.push(paginationRow);
    }

    buttons.push([backButton('view:drafts', lang), homeButton(lang)]);

    return {
        text: `🖼 <b>${t(lang, 'thumb.draftsTitle')}</b> (${total} ${t(lang, 'common.total')})

${t(lang, 'common.page')} ${page + 1} ${t(lang, 'common.of')} ${totalPages}`,
        keyboard: buttons,
    };
}
