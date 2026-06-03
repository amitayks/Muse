/**
 * Thumbnail compose & draft views
 */

import type { ViewResult, InlineButton, ThumbComposeState } from '../types';
import type { Lang } from '../ui/strings';
import { t } from '../ui/strings';
import { homeButton, backButton } from '../ui/components';
import { escapeHtml } from '../ui/utils';

export function renderThumbCompose(state: ThumbComposeState, lang: Lang = 'en'): ViewResult {
    const titleVal = state.title ? escapeHtml(state.title) : '—';
    const colorVal = state.color ? escapeHtml(state.color) : '—';
    const iconsVal = state.icons ? escapeHtml(state.icons) : '—';
    const imageVal = state.imageKey ? '✅' : '—';

    const text = `${t(lang, 'thumb.composeTitle')}

<b>${t(lang, 'thumb.labelTitle')}:</b> ${titleVal}
<b>${t(lang, 'thumb.labelColor')}:</b> ${colorVal}
<b>${t(lang, 'thumb.labelIcons')}:</b> ${iconsVal}
<b>${t(lang, 'thumb.labelImage')}:</b> ${imageVal}
<b>${t(lang, 'thumb.labelAspect')}:</b> ${state.ratio}

${t(lang, 'thumb.instructions')}`;

    const ratioRow: InlineButton[] = [
        { text: `16:9${state.ratio === '16:9' ? ' ✓' : ''}`, callback_data: 'thumb:ratio:16x9' },
        { text: `9:16${state.ratio === '9:16' ? ' ✓' : ''}`, callback_data: 'thumb:ratio:9x16' },
    ];

    const actionRow: InlineButton[] = [
        { text: t(lang, 'common.cancel'), callback_data: 'thumb:cancel', style: 'danger' },
        { text: t(lang, 'thumb.btnPenDown'), callback_data: 'thumb:pendown', style: 'success' },
    ];

    return { text, keyboard: [ratioRow, actionRow] };
}

export function renderThumbDraftCaption(
    title: string,
    color: string,
    icons: string,
    ratio: string,
    lang: Lang = 'en',
): string {
    return `🖼 <b>${escapeHtml(title)}</b>
<b>${t(lang, 'thumb.labelColor')}:</b> ${escapeHtml(color)}
<b>${t(lang, 'thumb.labelIcons')}:</b> ${escapeHtml(icons)}
<b>${t(lang, 'thumb.labelAspect')}:</b> ${ratio}`;
}

export function renderThumbDraftButtons(thumbId: string, lang: Lang = 'en'): InlineButton[][] {
    return [
        [
            { text: `📄 ${t(lang, 'thumb.btnFullRes')}`, callback_data: `thumb:fullres:${thumbId}` },
            { text: `🗑 ${t(lang, 'common.delete')}`, callback_data: `thumb:delete:${thumbId}`, style: 'danger' },
        ],
        [
            backButton('view:drafts_thumbs', lang),
            homeButton(lang),
        ],
    ];
}

export function renderThumbDeleteConfirm(thumbId: string, title: string, lang: Lang = 'en'): ViewResult {
    const safeTitle = escapeHtml(title.length > 60 ? title.substring(0, 57) + '...' : title);
    return {
        text: `${t(lang, 'thumb.deleteConfirm')}

<b>${safeTitle}</b>`,
        keyboard: [
            [
                { text: t(lang, 'common.yesDelete'), callback_data: `thumb:confirm_delete:${thumbId}`, style: 'danger' },
                { text: t(lang, 'common.cancel'), callback_data: `thumb:detail:${thumbId}` },
            ],
        ],
    };
}
