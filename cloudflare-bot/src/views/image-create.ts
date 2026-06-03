/**
 * Image create compose & draft views
 */

import type { ViewResult, InlineButton, ImageComposeState } from '../types';
import type { Lang } from '../ui/strings';
import { t } from '../ui/strings';
import { homeButton, backButton } from '../ui/components';
import { escapeHtml } from '../ui/utils';

export function renderImageCompose(state: ImageComposeState, lang: Lang = 'en'): ViewResult {
    const promptVal = state.prompt
        ? escapeHtml(state.prompt.length > 80 ? state.prompt.substring(0, 77) + '...' : state.prompt)
        : '—';
    const imageVal = state.imageKey ? '✅' : '—';

    const text = `${t(lang, 'imgcreate.composeTitle')}

<b>${t(lang, 'imgcreate.labelPrompt')}:</b> ${promptVal}
<b>${t(lang, 'imgcreate.labelImage')}:</b> ${imageVal}

${t(lang, 'imgcreate.instructions')}`;

    const actionRow: InlineButton[] = [
        { text: t(lang, 'common.cancel'), callback_data: 'imgcreate:cancel', style: 'danger' },
        { text: t(lang, 'imgcreate.btnPenDown'), callback_data: 'imgcreate:pendown', style: 'success' },
    ];

    return { text, keyboard: [actionRow] };
}

export function renderImageDraftCaption(prompt: string, lang: Lang = 'en'): string {
    const truncated = prompt.length > 200 ? prompt.substring(0, 197) + '...' : prompt;
    return `🎨 ${escapeHtml(truncated)}`;
}

export function renderImageDraftButtons(imageId: string, lang: Lang = 'en'): InlineButton[][] {
    return [
        [
            { text: `📄 ${t(lang, 'imgcreate.btnFullRes')}`, callback_data: `imgcreate:fullres:${imageId}` },
            { text: `🗑 ${t(lang, 'common.delete')}`, callback_data: `imgcreate:delete:${imageId}`, style: 'danger' },
        ],
        [
            backButton('view:drafts_images', lang),
            homeButton(lang),
        ],
    ];
}

export function renderImageDeleteConfirm(imageId: string, prompt: string, lang: Lang = 'en'): ViewResult {
    const safePrompt = escapeHtml(prompt.length > 60 ? prompt.substring(0, 57) + '...' : prompt);
    return {
        text: `${t(lang, 'imgcreate.deleteConfirm')}

<b>${safePrompt}</b>`,
        keyboard: [
            [
                { text: t(lang, 'common.yesDelete'), callback_data: `imgcreate:confirm_delete:${imageId}`, style: 'danger' },
                { text: t(lang, 'common.cancel'), callback_data: `imgcreate:detail:${imageId}` },
            ],
        ],
    };
}
