/**
 * Image create drafts list view
 */

import type { Env, ViewResult, InlineButton } from '../types';
import type { Lang } from '../ui/strings';
import { t } from '../ui/strings';
import { getImageDrafts, countImageDrafts } from '../data/image-create-db';
import { homeButton, backButton } from '../ui/components';

export async function renderImageDraftsList(
    env: Env,
    chatId: string,
    page = 0,
    lang: Lang = 'en',
    pageSize = 5,
): Promise<ViewResult> {
    const limit = pageSize;
    const offset = page * limit;
    const [drafts, total] = await Promise.all([
        getImageDrafts(env, chatId, limit, offset),
        countImageDrafts(env, chatId),
    ]);

    const totalPages = Math.ceil(total / limit);

    if (drafts.length === 0) {
        return {
            text: `🎨 <b>${t(lang, 'imgcreate.draftsTitle')}</b>

${t(lang, 'imgcreate.noDrafts')}`,
            keyboard: [
                [backButton('view:drafts', lang), homeButton(lang)],
            ],
        };
    }

    const buttons: InlineButton[][] = drafts.map(d => {
        const prompt = d.prompt.length > 40 ? d.prompt.substring(0, 37) + '...' : d.prompt;
        return [{ text: `🎨 ${prompt}`, callback_data: `imgcreate:detail:${d.id}` }];
    });

    // Pagination
    const paginationRow: InlineButton[] = [];
    if (page > 0) {
        paginationRow.push({ text: t(lang, 'common.prev'), callback_data: `imgcreate:list:${page - 1}` });
    }
    if (page < totalPages - 1) {
        paginationRow.push({ text: t(lang, 'common.next'), callback_data: `imgcreate:list:${page + 1}` });
    }
    if (paginationRow.length > 0) {
        buttons.push(paginationRow);
    }

    buttons.push([backButton('view:drafts', lang), homeButton(lang)]);

    return {
        text: `🎨 <b>${t(lang, 'imgcreate.draftsTitle')}</b> (${total} ${t(lang, 'common.total')})

${t(lang, 'common.page')} ${page + 1} ${t(lang, 'common.of')} ${totalPages}`,
        keyboard: buttons,
    };
}
