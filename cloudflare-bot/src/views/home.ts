/**
 * Home & general views
 */

import type { Env, ViewResult, InlineButton, DraftContent } from '../types';
import type { Lang } from '../ui/strings';
import { t } from '../ui/strings';
import { getNextScheduledDraft, getDraftStatusCounts, getTimezone } from '../data/db';
import { formatLocalTime } from '../infra/timezone';
import { isAdmin } from '../infra/security';
import { escapeHtml } from '../ui/utils';
import { homeButton } from '../ui/components';

export async function renderHome(env: Env, chatId: string, lang: Lang = 'en'): Promise<ViewResult> {
    const [nextDraft, counts, tz] = await Promise.all([
        getNextScheduledDraft(env, chatId),
        getDraftStatusCounts(env, chatId),
        getTimezone(env, chatId),
    ]);

    const draftCount = counts['draft'] || 0;
    const approvedCount = counts['approved'] || 0;
    const scheduledCount = counts['scheduled'] || 0;

    let text: string;

    if (nextDraft) {
        const content = JSON.parse(nextDraft.content) as DraftContent;
        const firstTweet = content.tweets[0]?.text || nextDraft.pr_title;
        const preview = escapeHtml(firstTweet.length > 60 ? firstTweet.substring(0, 57) + '...' : firstTweet);
        const format = content.format === 'single' ? t(lang, 'home.singleTweet') : `Thread (${content.tweets.length} tweets)`;
        const timeStr = nextDraft.scheduled_at
            ? formatLocalTime(nextDraft.scheduled_at, tz)
            : t(lang, 'home.pending');

        text = `${t(lang, 'home.title')}

${t(lang, 'home.nextUp')}
"${preview}"
⏰ ${t(lang, 'common.arrow')} <code>${timeStr}</code>
📊 ${t(lang, 'common.arrow')} <code>${format}</code> | PR #${nextDraft.pr_number}

${t(lang, 'home.queueLabel')} <code>${scheduledCount}</code> ${t(lang, 'home.scheduled')} | <code>${draftCount}</code> ${t(lang, 'home.drafts')} | <code>${approvedCount}</code> ${t(lang, 'home.approved')}`;
    } else {
        text = `${t(lang, 'home.title')}

${t(lang, 'home.allClear')}

📊 <code>${draftCount}</code> ${t(lang, 'home.drafts')} | <code>${approvedCount}</code> ${t(lang, 'home.approved')}`;
    }

    const keyboard: InlineButton[][] = [];
    if (scheduledCount > 0) {
        keyboard.push([
            { text: t(lang, 'home.btnSchedule'), callback_data: 'view:drafts_scheduled' },
            { text: t(lang, 'home.btnDrafts'), callback_data: 'view:drafts' },
        ]);
    } else {
        keyboard.push([{ text: t(lang, 'home.btnDrafts'), callback_data: 'view:drafts' }]);
    }
    keyboard.push([
        { text: t(lang, 'home.btnHandwrite'), callback_data: 'view:handwrite', style: 'primary' },
        { text: t(lang, 'home.btnGenerate'), callback_data: 'view:generate', style: 'primary' },
        { text: t(lang, 'home.btnRepost'), callback_data: 'view:repost', style: 'primary' },
    ]);
    keyboard.push([
        { text: t(lang, 'home.btnRepos'), callback_data: 'view:repos' },
        { text: t(lang, 'home.btnAccounts'), callback_data: 'view:accounts' },
    ]);
    if (isAdmin(chatId, env)) {
        keyboard.push([{ text: t(lang, 'home.btnVideoStudio'), callback_data: 'view:video_studio' }]);
    }
    keyboard.push([
        { text: t(lang, 'home.btnSettings'), callback_data: 'view:settings' },
        { text: t(lang, 'home.btnHelp'), callback_data: 'view:help' },
    ]);

    return { text, keyboard };
}

export function renderHelp(lang: Lang = 'en'): ViewResult {
    return {
        text: `${t(lang, 'help.title')}

${t(lang, 'help.createContent')}
${t(lang, 'help.generateDesc')}
${t(lang, 'help.handwriteDesc')}
${t(lang, 'help.repostDesc')}

${t(lang, 'help.manage')}
${t(lang, 'help.draftsDesc')}
${t(lang, 'help.reposDesc')}
${t(lang, 'help.accountsDesc')}

${t(lang, 'help.howItWorks')}
${t(lang, 'help.howItWorksDesc')}

${t(lang, 'help.quickCommands')}
${t(lang, 'help.quickCommandsList')}`,
        keyboard: [[homeButton(lang)]],
    };
}

export function renderError(message: string, lang: Lang = 'en'): ViewResult {
    return {
        text: `${t(lang, 'common.error')}

${message}

${t(lang, 'error.tapHome')}`,
        keyboard: [[homeButton(lang)]],
    };
}

export function renderSuccess(message: string, lang: Lang = 'en'): ViewResult {
    return {
        text: `${t(lang, 'common.success')}

${message}`,
        keyboard: [[homeButton(lang)]],
    };
}

export function renderGenerating(sha: string, lang: Lang = 'en'): ViewResult {
    return {
        text: `${t(lang, 'generating.title')}

${t(lang, 'generating.findingPr')} <code>${sha}</code>...

${t(lang, 'generating.mayTakeMoment')}`,
        keyboard: [],
    };
}

export function renderPublishing(count: number, lang: Lang = 'en'): ViewResult {
    return {
        text: `${t(lang, 'publishing.title')}

${t(lang, 'publishing.publishingTo')} ${count} draft${count > 1 ? 's' : ''} to X...

${t(lang, 'publishing.pleaseWait')}`,
        keyboard: [],
    };
}

export interface ComposeTweet {
    text: string;
    mediaCount: number;
}

export interface ComposeOptions {
    instruction?: string;
    awaitingInstruction?: boolean;
    analyzeImages?: boolean;
}

export function renderCompose(
    tweets: ComposeTweet[],
    charWarnings: number[],
    imageGen: boolean,
    aiRefine: boolean,
    lang: Lang = 'en',
    options?: ComposeOptions,
): ViewResult {
    const count = tweets.length;
    const hasImages = tweets.some(tw => tw.mediaCount > 0);

    let text: string;

    if (count === 0 && !options?.instruction && !options?.awaitingInstruction) {
        text = `${t(lang, 'compose.title')}

${t(lang, 'compose.instructions')}

${t(lang, 'compose.textHint')}
${t(lang, 'compose.photoHint')}
${t(lang, 'compose.editHint')}

${t(lang, 'compose.whenDone')}

${t(lang, 'compose.imageHint')}
${t(lang, 'compose.aiHint')}
${t(lang, 'compose.instructHint')}
${t(lang, 'compose.analyzeHint')}`;
    } else {
        const format = count === 1 ? t(lang, 'home.singleTweet') : count === 0 ? '' : `Thread · ${count} tweets`;
        text = count > 0 ? `${t(lang, 'compose.composing')} — ${format}\n` : `${t(lang, 'compose.composing')}\n`;

        // Instruction display
        if (options?.awaitingInstruction) {
            text += `\n${t(lang, 'compose.awaitingInstruction')}\n`;
        } else if (options?.instruction) {
            const instrPreview = options.instruction.length > 120 ? options.instruction.substring(0, 117) + '...' : options.instruction;
            text += `\n${t(lang, 'compose.instructionPrefix')} ${escapeHtml(instrPreview)}\n`;
        }

        let totalMedia = 0;
        for (let i = 0; i < tweets.length; i++) {
            const tw = tweets[i];
            const mc = tw.mediaCount;
            totalMedia += mc;
            const mediaIndicator = mc === 0 ? '' : mc <= 4 ? ' ' + '📷'.repeat(mc) : ` 📷×${mc}`;
            const len = tw.text.length;
            const over = len > 280;
            const preview = tw.text.length > 80 ? tw.text.substring(0, 77) + '...' : tw.text;
            const safePreview = escapeHtml(preview);
            text += `\n${i + 1}. ${safePreview}${mediaIndicator}`;
            text += `\n    <i>${len}/280${over ? ' ⚠️' : ''}</i>`;
            if (mc > 4) {
                text += `\n    ${t(lang, 'compose.xImageLimit').replace('{count}', String(mc))}`;
            }
        }

        // Thread-level Instagram total image warning
        if (totalMedia > 10) {
            text += `\n\n${t(lang, 'compose.igImageLimit').replace('{count}', String(totalMedia))}`;
        }
    }

    if (charWarnings.length > 0) {
        const warnings = charWarnings.map(i => `Tweet ${i}`).join(', ');
        text += `\n\n⚠️ ${warnings} ${t(lang, 'compose.exceeds280')}`;
    }

    // Dynamic button row based on context
    const toggleRow: import('../types').InlineButton[] = [];

    if (!hasImages) {
        // No images: [Image Gen] [AI] [Instruct]
        toggleRow.push({ text: `${t(lang, 'compose.btnImage')}: ${imageGen ? 'ON' : 'OFF'}`, callback_data: 'compose:toggle_image' });
    } else {
        // Images present: [Analyze] [AI] [Instruct] — Analyze replaces Image Gen
        toggleRow.push({ text: `${t(lang, 'compose.btnAnalyze')}: ${options?.analyzeImages ? 'ON' : 'OFF'}`, callback_data: 'compose:toggle_analyze' });
    }

    toggleRow.push({ text: `${t(lang, 'compose.btnAi')}: ${aiRefine ? 'ON' : 'OFF'}`, callback_data: 'compose:toggle_ai' });
    toggleRow.push({ text: t(lang, 'compose.btnInstruct'), callback_data: 'compose:toggle_instruct' });

    return {
        text,
        keyboard: [
            toggleRow,
            [
                { text: t(lang, 'common.cancel'), callback_data: 'compose:cancel', style: 'danger' },
                { text: t(lang, 'compose.btnPenDown'), callback_data: 'compose:pendown', style: 'success' },
            ],
        ],
    };
}
