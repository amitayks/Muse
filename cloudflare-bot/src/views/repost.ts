/**
 * Repost views — prompt, preview, generating
 */

import type { ViewResult, InlineButton } from '../types';
import { t } from '../ui/strings';
import type { Lang } from '../ui/strings';
import { escapeHtml } from '../ui/utils';
import { cancelRow } from '../ui/components';

export function renderRepostPrompt(lang: Lang = 'en'): ViewResult {
    return {
        text: `${t(lang, 'repost.promptTitle')}

${t(lang, 'repost.promptDesc')}

${t(lang, 'repost.supportedFormats')}
<code>https://x.com/username/status/123456</code>
<code>https://twitter.com/username/status/123456</code>

${t(lang, 'repost.promptHint')}`,
        keyboard: [cancelRow('view:home', lang)],
    };
}

/** @deprecated Use compose mode with sourceTweet header instead. Kept for backward compat. */
export function renderRepostPreview(params: {
    tweetId: string;
    username: string;
    displayName?: string | null;
    tweetText: string;
    isThread: boolean;
    threadCount?: number;
    metrics?: { likes: number; retweets: number; quotes: number; replies: number };
    existingDraftId?: string | null;
    hasImage?: boolean;
}, lang: Lang = 'en'): ViewResult {
    const { tweetId, username, displayName, tweetText, isThread, threadCount, metrics, existingDraftId, hasImage } = params;

    const nameDisplay = displayName ? `${displayName} (@${username})` : `@${username}`;
    const preview = tweetText.length > 200 ? tweetText.substring(0, 197) + '...' : tweetText;
    const imageLabel = hasImage ? `\n${t(lang, 'repost.hasImage')}` : '';
    const threadLabel = isThread ? `\n📎 Thread (${threadCount || '?'} tweets)` : '';

    let metricsLine = '';
    if (metrics) {
        metricsLine = `\n❤️ ${formatNum(metrics.likes)} · 🔄 ${formatNum(metrics.retweets)} · 💬 ${formatNum(metrics.replies)} · 🔗 ${formatNum(metrics.quotes)}`;
    }

    let text = `${t(lang, 'repost.previewTitle')}

<b>${escapeHtml(nameDisplay)}</b>${threadLabel}${imageLabel}${metricsLine}

${escapeHtml(preview)}`;

    // Build keyboard
    const keyboard: InlineButton[][] = [];

    // Duplicate warning + generate
    if (existingDraftId) {
        text = `${t(lang, 'repost.duplicateWarning')}\n\n` + text;
        keyboard.push([
            { text: t(lang, 'repost.viewExisting'), callback_data: `tw_view:${existingDraftId}` },
            { text: t(lang, 'repost.generateAnyway'), callback_data: `rp_gen_anyway:${tweetId}`, style: 'primary' },
        ]);
    } else {
        keyboard.push([{ text: t(lang, 'repost.generateRepost'), callback_data: `rp_gen:${tweetId}`, style: 'primary' }]);
    }

    keyboard.push([
        { text: t(lang, 'repost.openTweet'), url: `https://x.com/${username}/status/${tweetId}` },
        { text: t(lang, 'common.cancel'), callback_data: 'rp_cancel:0', style: 'danger' },
    ]);

    return { text, keyboard };
}

/** @deprecated Use compose mode pen-down flow instead. Kept for backward compat. */
export function renderRepostGenerating(username: string, lang: Lang = 'en'): ViewResult {
    return {
        text: `${t(lang, 'repost.generatingTitle').replace('{username}', username)}

${t(lang, 'repost.generatingDesc')}`,
        keyboard: [],
    };
}

function formatNum(n: number): string {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return String(n);
}
