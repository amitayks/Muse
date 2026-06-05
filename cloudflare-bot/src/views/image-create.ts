/**
 * Image create compose & draft views
 */

import type { ViewResult, InlineButton, ImageComposeState } from '../types';
import type { Lang } from '../ui/strings';
import { t } from '../ui/strings';
import { homeButton, backButton } from '../ui/components';
import { escapeHtml } from '../ui/utils';

/** Max prompt segments to list before collapsing into a "+N more" line. */
const SEGMENT_DISPLAY_CAP = 8;
/** Max characters shown per segment preview. */
const SEGMENT_PREVIEW_LEN = 40;

export function renderImageCompose(state: ImageComposeState, lang: Lang = 'en'): ViewResult {
    // Tolerate legacy single-slot state (prompt/imageKey) by normalizing for display.
    const segments = state.segments ?? (state.prompt ? [{ messageId: 0, text: state.prompt }] : []);
    const images = state.images ?? (state.imageKey ? [{ messageId: 0, key: state.imageKey }] : []);

    const lines: string[] = [t(lang, 'imgcreate.composeTitle'), ''];

    if (segments.length === 0) {
        lines.push(`<b>${t(lang, 'imgcreate.labelPrompt')}:</b> —`);
    } else {
        const combinedLen = segments.map(s => s.text).join(' ').length;
        lines.push(
            `<b>${t(lang, 'imgcreate.labelPrompt')}</b> — ${segments.length} ${t(lang, 'imgcreate.messagesWord')} (${combinedLen} ${t(lang, 'imgcreate.charsWord')}):`,
        );
        segments.slice(0, SEGMENT_DISPLAY_CAP).forEach((s, i) => {
            const flat = s.text.replace(/\s+/g, ' ').trim();
            const preview = flat.length > SEGMENT_PREVIEW_LEN ? flat.substring(0, SEGMENT_PREVIEW_LEN - 1) + '…' : flat;
            lines.push(`  ${i + 1}. ${escapeHtml(preview)}`);
        });
        if (segments.length > SEGMENT_DISPLAY_CAP) {
            lines.push(`  (+${segments.length - SEGMENT_DISPLAY_CAP} ${t(lang, 'imgcreate.moreWord')})`);
        }
    }

    lines.push(`<b>${t(lang, 'imgcreate.imagesLabel')}:</b> ${images.length > 0 ? images.length : '—'}`);
    lines.push('', t(lang, 'imgcreate.instructions'));

    const actionRow: InlineButton[] = [
        { text: t(lang, 'common.cancel'), callback_data: 'imgcreate:cancel', style: 'danger' },
        { text: t(lang, 'imgcreate.btnPenDown'), callback_data: 'imgcreate:pendown', style: 'success' },
    ];

    return { text: lines.join('\n'), keyboard: [actionRow] };
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
