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
            { text: t(lang, 'home.btnRepos'), callback_data: 'view:repos' },
            { text: t(lang, 'home.btnAccounts'), callback_data: 'view:accounts' },
        ]);
    } else {
        keyboard.push([
            { text: t(lang, 'home.btnDrafts'), callback_data: 'view:drafts' },
            { text: t(lang, 'home.btnRepos'), callback_data: 'view:repos' },
            { text: t(lang, 'home.btnAccounts'), callback_data: 'view:accounts' },
        ]);
    }
    keyboard.push([
        { text: t(lang, 'home.btnHandwrite'), callback_data: 'view:handwrite', style: 'primary' },
        { text: t(lang, 'home.btnGenerate'), callback_data: 'view:generate', style: 'primary' },
        { text: t(lang, 'home.btnRepost'), callback_data: 'view:repost', style: 'primary' },
    ]);
    // Thumbs + Video Studio + Open App in one row
    const utilRow: InlineButton[] = [
        { text: t(lang, 'home.btnThumbs'), callback_data: 'view:thumbs' },
    ];
    if (isAdmin(chatId, env)) {
        utilRow.push({ text: t(lang, 'home.btnVideoStudio'), callback_data: 'view:video_studio' });
    }
    if (env.WEBAPP_URL) {
        utilRow.push({ text: `${t(lang, 'home.btnOpenApp')}`, web_app: { url: `${env.WEBAPP_URL}/#/` } });
    }
    keyboard.push(utilRow);
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
    fetchThread?: boolean;
    sourceTweet?: import('../types').ComposeSourceTweet;
    sourceCommit?: import('../types').ComposeSourceCommit;
    existingDraftId?: string;
    langOverride?: 'en' | 'he';
    globalLang?: 'en' | 'he';
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
    const sourceTweet = options?.sourceTweet;
    const sourceCommit = options?.sourceCommit;

    let text = '';

    // Source tweet header (repost mode)
    if (sourceTweet) {
        text += renderSourceTweetHeader(sourceTweet, lang);
        text += '\n\n';
    }

    // Source commit header (commit mode)
    if (sourceCommit) {
        text += renderSourceCommitHeader(sourceCommit, lang);
        text += '\n\n';
    }

    const isEmpty = count === 0 && !options?.instruction && !options?.awaitingInstruction;

    if (isEmpty) {
        if (sourceTweet) {
            // Repost mode empty state
            text += `${t(lang, 'compose.title')}\n\n${t(lang, 'compose.repostInstructions')}`;
        } else if (sourceCommit) {
            // Commit mode empty state
            text += `${t(lang, 'compose.title')}\n\n${t(lang, 'compose.commitInstructions')}`;
        } else {
            // Handwrite mode empty state
            text += `${t(lang, 'compose.title')}

${t(lang, 'compose.instructions')}

${t(lang, 'compose.textHint')}
${t(lang, 'compose.photoHint')}
${t(lang, 'compose.editHint')}

${t(lang, 'compose.whenDone')}

${t(lang, 'compose.imageHint')}
${t(lang, 'compose.aiHint')}
${t(lang, 'compose.instructHint')}
${t(lang, 'compose.analyzeHint')}`;
        }
    } else {
        const format = count === 1 ? t(lang, 'home.singleTweet') : count === 0 ? '' : `Thread · ${count} tweets`;
        text += count > 0 ? `${t(lang, 'compose.composing')} — ${format}\n` : `${t(lang, 'compose.composing')}\n`;

        // Instruction display
        if (options?.awaitingInstruction) {
            text += `\n${t(lang, 'compose.awaitingInstruction')}\n`;
        } else if (options?.instruction) {
            const instrPreview = options.instruction.length > 120 ? options.instruction.substring(0, 117) + '...' : options.instruction;
            text += `\n${t(lang, 'compose.instructionPrefix')} ${escapeHtml(instrPreview)}\n`;
        }

        // Tweet preview with truncation (max 5 shown)
        const maxPreview = 5;
        const tweetsToShow = tweets.slice(0, maxPreview);
        let totalMedia = 0;

        for (let i = 0; i < tweetsToShow.length; i++) {
            const tw = tweetsToShow[i];
            const mc = tw.mediaCount;
            totalMedia += mc;
            const mediaIndicator = mc === 0 ? '' : mc <= 4 ? ' ' + '📷'.repeat(mc) : ` 📷×${mc}`;
            const preview = tw.text.length > 60 ? tw.text.substring(0, 57) + '...' : tw.text;
            const safePreview = escapeHtml(preview);
            text += `\n${i + 1}. ${safePreview}${mediaIndicator}`;
            if (mc > 4) {
                text += `\n    ${t(lang, 'compose.xImageLimit').replace('{count}', String(mc))}`;
            }
        }

        // Count remaining media from hidden tweets
        for (let i = maxPreview; i < tweets.length; i++) {
            totalMedia += tweets[i].mediaCount;
        }

        // Truncation indicator
        if (tweets.length > maxPreview) {
            const remaining = tweets.length - maxPreview;
            text += `\n\n${t(lang, 'compose.andMoreTweets').replace('{count}', String(remaining))}`;
        }

        // Thread-level Instagram total image warning
        if (totalMedia > 10) {
            text += `\n\n${t(lang, 'compose.igImageLimit').replace('{count}', String(totalMedia))}`;
        }
    }

    // Dynamic button row based on context
    const toggleRow: import('../types').InlineButton[] = [];

    if (!hasImages && !(sourceTweet?.mediaUrl)) {
        // No images: [Image Gen] [AI] [Instruct]
        toggleRow.push({ text: `${t(lang, 'compose.btnImage')}: ${imageGen ? 'ON' : 'OFF'}`, callback_data: 'compose:toggle_image' });
    } else {
        // Images present: [Analyze] [AI] [Instruct] — Analyze replaces Image Gen
        toggleRow.push({ text: `${t(lang, 'compose.btnAnalyze')}: ${options?.analyzeImages ? 'ON' : 'OFF'}`, callback_data: 'compose:toggle_analyze' });
    }

    toggleRow.push({ text: `${t(lang, 'compose.btnAi')}: ${aiRefine ? 'ON' : 'OFF'}`, callback_data: 'compose:toggle_ai' });
    toggleRow.push({ text: t(lang, 'compose.btnInstruct'), callback_data: 'compose:toggle_instruct' });

    // Bottom action row
    const actionRow: import('../types').InlineButton[] = [
        { text: t(lang, 'common.cancel'), callback_data: 'compose:cancel', style: 'danger' },
        { text: t(lang, 'compose.btnPenDown'), callback_data: 'compose:pendown', style: 'success' },
    ];

    const keyboard: import('../types').InlineButton[][] = [toggleRow];

    // Extras row: lang button + mode-specific buttons (Thread toggle for repost)
    const effectiveLang = options?.langOverride ?? options?.globalLang ?? lang;
    const langLabel = effectiveLang === 'en' ? t(lang, 'compose.btnLangHe') : t(lang, 'compose.btnLangEn');
    const extrasRow: import('../types').InlineButton[] = [
        { text: langLabel, callback_data: 'compose:toggle_lang' },
    ];
    if (sourceTweet) {
        extrasRow.push({ text: `${t(lang, 'compose.btnThread')}: ${options?.fetchThread ? 'ON' : 'OFF'}`, callback_data: 'compose:toggle_thread' });
    }
    keyboard.push(extrasRow);

    // Duplicate warning: add View Existing button on its own row
    if (options?.existingDraftId) {
        keyboard.push([{ text: t(lang, 'repost.viewExisting'), callback_data: `draft:${options.existingDraftId}` }]);
    }

    keyboard.push(actionRow);

    return { text, keyboard };
}

/** Render source tweet pinned header for repost compose mode */
function renderSourceTweetHeader(
    sourceTweet: import('../types').ComposeSourceTweet,
    lang: Lang,
): string {
    return t(lang, 'compose.repostHeader').replace('{username}', sourceTweet.username);
}

/** Render source commit pinned header for commit compose mode */
function renderSourceCommitHeader(
    sourceCommit: import('../types').ComposeSourceCommit,
    lang: Lang,
): string {
    const title = sourceCommit.title.length > 80
        ? sourceCommit.title.substring(0, 77) + '...'
        : sourceCommit.title;
    const header = t(lang, 'compose.commitHeader')
        .replace('{repoShort}', escapeHtml(sourceCommit.repoShort))
        .replace('{title}', escapeHtml(title));

    let lines = header;

    // Stats line
    const commitCount = sourceCommit.commitMessages.length;
    if (sourceCommit.additions > 0 || sourceCommit.deletions > 0) {
        lines += `\n${t(lang, 'compose.commitStatsFull')
            .replace('{commits}', String(commitCount))
            .replace('{files}', String(sourceCommit.filesChanged))
            .replace('{additions}', String(sourceCommit.additions))
            .replace('{deletions}', String(sourceCommit.deletions))}`;
    } else {
        lines += `\n${t(lang, 'compose.commitStats')
            .replace('{commits}', String(commitCount))
            .replace('{files}', String(sourceCommit.filesChanged))}`;
    }

    lines += '\n─────────────────';

    return lines;
}
