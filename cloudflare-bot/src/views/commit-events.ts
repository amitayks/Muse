/**
 * Commit Event Views — render event summary and action buttons
 */

import type { InlineButton } from '../types';
import type { Lang } from '../ui/strings';
import { t } from '../ui/strings';

/**
 * Render event summary text for Telegram notification
 */
export function renderEventSummary(
    eventType: 'pr' | 'push',
    number: number,
    title: string,
    repo: string,
    author: string,
    filesChanged: number,
    additions: number,
    deletions: number,
    commitCount: number,
    lang: Lang = 'en',
): string {
    const emoji = eventType === 'pr' ? '🔀' : '📤';
    const eventLabel = eventType === 'pr'
        ? t(lang, 'notifications.prMergedLabel').replace('{number}', String(number))
        : t(lang, 'notifications.pushLabel').replace('{count}', String(number)).replace('{plural}', number > 1 ? 's' : '');

    const lines = [
        t(lang, 'notifications.eventTitle').replace('{emoji}', emoji).replace('{label}', eventLabel),
        '',
        t(lang, 'notifications.eventRepo').replace('{repo}', repo),
        `<b>${title}</b>`,
        t(lang, 'notifications.eventAuthor').replace('{author}', author),
    ];

    if (filesChanged > 0 || additions > 0 || deletions > 0) {
        lines.push(t(lang, 'notifications.eventStats')
            .replace('{files}', String(filesChanged))
            .replace('{additions}', String(additions))
            .replace('{deletions}', String(deletions)));
    }

    if (commitCount > 1) {
        lines.push(t(lang, 'notifications.eventCommitCount').replace('{count}', String(commitCount)));
    }

    return lines.join('\n');
}

/**
 * Render event buttons based on whether a draft exists
 */
export function renderEventButtons(
    eventId: string,
    draftId: string | null,
    lang: Lang = 'en',
): InlineButton[][] {
    if (draftId) {
        return [[
            { text: t(lang, 'notifications.btnGenerated'), callback_data: `draft:${draftId}` },
            { text: t(lang, 'notifications.btnEditCommit'), callback_data: `action:edit_compose:${eventId}` },
        ]];
    }
    return [[
        { text: t(lang, 'notifications.btnFastCommit'), callback_data: `action:fast_commit:${eventId}` },
        { text: t(lang, 'notifications.btnEditCommit'), callback_data: `action:edit_compose:${eventId}` },
    ]];
}
