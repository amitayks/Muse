/**
 * Shared UI components — reusable buttons, rows, and view builders
 */

import type { InlineButton, ViewResult } from '../types';
import type { Lang } from './strings';
import { t } from './strings';

// ==================== Single Buttons ====================

export function homeButton(lang: Lang): InlineButton {
    return { text: t(lang, 'common.home'), callback_data: 'view:home' };
}

export function backButton(view: string, lang: Lang): InlineButton {
    return { text: t(lang, 'common.back'), callback_data: view };
}

export function toggleButton(labelKey: string, isOn: boolean, callback: string, lang: Lang): InlineButton {
    return {
        text: `${t(lang, labelKey)}: ${isOn ? t(lang, 'common.on') : t(lang, 'common.off')}`,
        callback_data: callback,
        style: isOn ? 'success' : 'danger',
    };
}

export function selectedItemLabel(label: string, isSelected: boolean): string {
    return isSelected ? `✅ ${label}` : label;
}

// ==================== Single Rows ====================

export function backHomeRow(backView: string, lang: Lang): InlineButton[] {
    return [backButton(backView, lang), homeButton(lang)];
}

export function addButtonRow(label: string, callback: string): InlineButton[] {
    return [{ text: label, callback_data: callback, style: 'primary' as const }];
}

export function cancelRow(cancelView: string, lang: Lang): InlineButton[] {
    return [{ text: t(lang, 'common.cancel'), callback_data: cancelView, style: 'danger' }];
}

// ==================== Multi Rows ====================

export function paginationRows(type: string, page: number, hasMore: boolean, lang: Lang): InlineButton[][] {
    const nav: InlineButton[] = [];
    if (page > 0) {
        nav.push({ text: t(lang, 'common.prev'), callback_data: `page:${type}:${page - 1}` });
    }
    if (hasMore) {
        nav.push({ text: t(lang, 'common.next'), callback_data: `page:${type}:${page + 1}` });
    }
    return nav.length > 0 ? [nav] : [];
}

// ==================== Full Views ====================

export function confirmDeleteView(
    title: string,
    message: string,
    confirmCb: string,
    cancelCb: string,
    lang: Lang
): ViewResult {
    return {
        text: `🗑️ <b>${title}</b>\n\n${message}`,
        keyboard: [
            [
                { text: t(lang, 'common.yesDelete'), callback_data: confirmCb, style: 'danger' },
                { text: t(lang, 'common.cancel'), callback_data: cancelCb, style: 'danger' },
            ],
        ],
    };
}

export function emptyListView(
    title: string,
    message: string,
    addLabel: string,
    addCb: string,
    backView: string,
    lang: Lang
): ViewResult {
    return {
        text: `${title}\n\n${message}`,
        keyboard: [
            addButtonRow(addLabel, addCb),
            [homeButton(lang)],
        ],
    };
}

export function inputPromptView(
    title: string,
    instructions: string,
    example: string | null,
    cancelCb: string,
    lang: Lang
): ViewResult {
    let text = `${title}\n\n${instructions}`;
    if (example) {
        text += `\n\n${t(lang, 'common.example')}\n<code>${example}</code>`;
    }
    return {
        text,
        keyboard: [cancelRow(cancelCb, lang)],
    };
}

export function errorWithBackView(message: string, backView: string, lang: Lang): ViewResult {
    return {
        text: `${t(lang, 'common.error')}\n\n${message}`,
        keyboard: [[backButton(backView, lang)]],
    };
}
