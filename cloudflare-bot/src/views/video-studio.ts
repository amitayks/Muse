/**
 * Video Studio Views — dashboard, repo home, lists, detail, config, script preview
 */

import type { Env, ViewResult, InlineButton, VideoDraft, VideoConfig, VideoScriptResponse } from '../types';
import { DEFAULT_VIDEO_CONFIG } from '../types';
import { getWatchingRepos, countVideoDraftsByRepo, getVideoDraftsByRepo, getVideoDraft } from '../data/db';
import { estimateCreditCost } from '../integrations/heygen';
import { homeButton, backButton, cancelRow } from '../ui/components';
import { t } from '../ui/strings';
import type { Lang } from '../ui/strings';

// Short status codes for callback_data to stay under Telegram's 64-byte limit
const STATUS_TO_CODE: Record<string, string> = { draft: 'd', queued: 'q', generating: 'g', completed: 'c', approved: 'a', scheduled: 's', published: 'p', failed: 'f' };
export const STATUS_FROM_CODE: Record<string, string> = { d: 'draft', q: 'queued', g: 'generating', c: 'completed', a: 'approved', s: 'scheduled', p: 'published', f: 'failed' };

// ==================== VIDEO STUDIO HOME ====================

export async function renderVideoStudioHome(env: Env, chatId: string, lang: Lang = 'en'): Promise<ViewResult> {
    const repos = await getWatchingRepos(env, chatId);

    const keyboard: InlineButton[][] = [
        [{ text: t(lang, 'video.standaloneVideo'), callback_data: 'action:video_create:standalone' }],
    ];

    // Show all watched repos
    for (const repo of repos) {
        keyboard.push([{
            text: `📂 ${repo.owner}/${repo.repo}`,
            callback_data: `view:video_repo:${repo.id}`,
        }]);
    }

    if (repos.length === 0) {
        keyboard.push([{ text: t(lang, 'video.addRepoFirst'), callback_data: 'view:repos' }]);
    }

    keyboard.push([{ text: t(lang, 'video.btnVideoSettings'), callback_data: 'vsettings:home' }]);
    keyboard.push([homeButton(lang)]);

    return {
        text: `${t(lang, 'video.studioTitle')}\n\n${t(lang, 'video.studioDesc')}\n\n${t(lang, 'video.studioSelect')}`,
        keyboard,
    };
}

// ==================== REPO VIDEO HOME ====================

export async function renderVideoRepoHome(env: Env, chatId: string, repoId: string, lang: Lang = 'en'): Promise<ViewResult> {
    // Wrap each count in try/catch so one failure doesn't crash the whole view
    const safeCount = async (status: string): Promise<number> => {
        try {
            return await countVideoDraftsByRepo(env, chatId, repoId, status as any);
        } catch (e) {
            console.error(`countVideoDraftsByRepo failed for status=${status}, repoId=${repoId}:`, e instanceof Error ? e.message : String(e));
            return 0;
        }
    };
    const draftCount = await safeCount('draft');
    const completedCount = await safeCount('completed');
    const approvedCount = await safeCount('approved');
    const scheduledCount = await safeCount('scheduled');
    const publishedCount = await safeCount('published');
    const generatingCount = await safeCount('generating');
    const queuedCount = await safeCount('queued');
    const failedCount = await safeCount('failed');

    const keyboard: InlineButton[][] = [
        [{ text: t(lang, 'video.createNewVideo'), callback_data: `action:video_create:${repoId}` }],
    ];

    if (draftCount > 0) keyboard.push([{ text: `${t(lang, 'video.statusDrafts')} (${draftCount})`, callback_data: `view:video_list:${repoId}:d` }]);
    if (queuedCount > 0) keyboard.push([{ text: `${t(lang, 'video.statusQueued')} (${queuedCount})`, callback_data: `view:video_list:${repoId}:q` }]);
    if (generatingCount > 0) keyboard.push([{ text: `${t(lang, 'video.statusGenerating')} (${generatingCount})`, callback_data: `view:video_list:${repoId}:g` }]);
    if (completedCount > 0) keyboard.push([{ text: `${t(lang, 'video.statusCompleted')} (${completedCount})`, callback_data: `view:video_list:${repoId}:c` }]);
    if (approvedCount > 0) keyboard.push([{ text: `${t(lang, 'video.statusApproved')} (${approvedCount})`, callback_data: `view:video_list:${repoId}:a` }]);
    if (scheduledCount > 0) keyboard.push([{ text: `${t(lang, 'video.statusScheduled')} (${scheduledCount})`, callback_data: `view:video_list:${repoId}:s` }]);
    if (publishedCount > 0) keyboard.push([{ text: `${t(lang, 'video.statusPublished')} (${publishedCount})`, callback_data: `view:video_list:${repoId}:p` }]);
    if (failedCount > 0) keyboard.push([{ text: `${t(lang, 'video.statusFailed')} (${failedCount})`, callback_data: `view:video_list:${repoId}:f` }]);

    keyboard.push([backButton('view:video_studio', lang)]);

    return {
        text: `${t(lang, 'video.studioTitle')}\n\n${t(lang, 'video.repoSelectCategory')}`,
        keyboard,
    };
}

// ==================== VIDEO LIST ====================

export async function renderVideoList(
    env: Env,
    chatId: string,
    repoId: string,
    status: string,
    page = 0,
    lang: Lang = 'en'
): Promise<ViewResult> {
    const pageSize = 5;
    // Expand short code to full status if needed
    const fullStatus = STATUS_FROM_CODE[status] || status;
    const statusCode = STATUS_TO_CODE[fullStatus] || status;

    let drafts: VideoDraft[] = [];
    try {
        drafts = await getVideoDraftsByRepo(env, chatId, repoId, fullStatus as any, pageSize, page * pageSize);
    } catch (e) {
        console.error(`getVideoDraftsByRepo failed: status=${fullStatus}, repoId=${repoId}, page=${page}:`, e instanceof Error ? e.message : String(e));
    }

    const statusLabels: Record<string, string> = {
        draft: t(lang, 'video.statusDrafts'),
        queued: t(lang, 'video.statusQueued'),
        generating: t(lang, 'video.statusGenerating'),
        completed: t(lang, 'video.statusCompleted'),
        approved: t(lang, 'video.statusApproved'),
        scheduled: t(lang, 'video.statusScheduled'),
        published: t(lang, 'video.statusPublished'),
        failed: t(lang, 'video.statusFailed'),
    };

    const keyboard: InlineButton[][] = [];

    for (const draft of drafts) {
        const title = draft.title || t(lang, 'video.untitled');
        const preview = title.length > 30 ? title.substring(0, 27) + '...' : title;
        const date = draft.created_at?.substring(0, 10) || '';
        keyboard.push([{
            text: `${preview} • ${date}`,
            callback_data: `view:video_detail:${draft.id}`,
        }]);
    }

    // Pagination — use short status code to stay under 64-byte limit
    const nav: InlineButton[] = [];
    if (page > 0) nav.push({ text: t(lang, 'common.prev'), callback_data: `view:video_list:${repoId}:${statusCode}:${page - 1}` });
    if (drafts.length === pageSize) nav.push({ text: t(lang, 'common.next'), callback_data: `view:video_list:${repoId}:${statusCode}:${page + 1}` });
    if (nav.length > 0) keyboard.push(nav);

    keyboard.push([backButton(`view:video_repo:${repoId}`, lang)]);

    return {
        text: `${statusLabels[fullStatus] || fullStatus}\n\n${drafts.length === 0 ? t(lang, 'video.noVideos') : `${t(lang, 'common.page')} ${page + 1}:`}`,
        keyboard,
    };
}

// ==================== VIDEO DETAIL ====================

export async function renderVideoDetail(env: Env, chatId: string, videoDraftId: string, lang: Lang = 'en'): Promise<ViewResult> {
    const draft = await getVideoDraft(env, videoDraftId, chatId);
    if (!draft) {
        return {
            text: t(lang, 'error.videoNotFound'),
            keyboard: [[homeButton(lang)]],
        };
    }

    let script: VideoScriptResponse | null = null;
    try {
        script = draft.script ? JSON.parse(draft.script) : null;
    } catch { /* ignore */ }

    let config: VideoConfig | null = null;
    try {
        config = draft.config ? JSON.parse(draft.config) : null;
    } catch { /* ignore */ }

    const lines: string[] = [`🎬 <b>${draft.title || t(lang, 'video.untitled')}</b>`];
    lines.push(`${t(lang, 'video.status')} ${t(lang, 'common.arrow')} <code>${draft.status}</code>`);

    if (config) {
        lines.push(`\n<code>${config.length}</code> | <code>${config.aspectRatio}</code>`);
        lines.push(`${t(lang, 'video.emotion')} ${t(lang, 'common.arrow')} <code>${config.emotion}</code> | <code>${config.captions ? t(lang, 'video.captionsOn') : t(lang, 'video.captionsOff')}</code>`);
    }

    if (script) {
        lines.push(`\n${t(lang, 'video.scenes')} ${t(lang, 'common.arrow')} <code>${script.scenes.length}</code> | ${t(lang, 'video.words')} ${t(lang, 'common.arrow')} <code>~${script.totalWordCount}</code>`);
        // Show first scene preview
        const preview = script.scenes[0]?.scriptText || '';
        if (preview) {
            const truncated = preview.length > 150 ? preview.substring(0, 147) + '...' : preview;
            lines.push(`\n<i>"${truncated}"</i>`);
        }
    }

    if (draft.created_at) {
        lines.push(`\n${t(lang, 'video.created')} ${t(lang, 'common.arrow')} <code>${draft.created_at.substring(0, 16)}</code>`);
    }

    const keyboard: InlineButton[][] = [];

    // Status-specific actions
    switch (draft.status) {
        case 'draft':
            keyboard.push([{ text: t(lang, 'video.approveGenerate'), callback_data: `action:video_approve_script:${draft.id}` }]);
            keyboard.push([{ text: t(lang, 'video.regenerateScript'), callback_data: `action:video_regen_script:${draft.id}` }]);
            keyboard.push([{ text: t(lang, 'video.btnDelete'), callback_data: `action:video_delete:${draft.id}` }]);
            break;
        case 'completed':
            if (draft.video_url) {
                keyboard.push([{ text: t(lang, 'video.btnWatch'), url: `${env.WORKER_URL}/media/${draft.video_url}` }]);
            }
            keyboard.push([{ text: t(lang, 'video.btnPublish'), callback_data: `action:video_publish:${draft.id}`, style: 'success' as const }]);
            keyboard.push([{ text: t(lang, 'drafts.schedule'), callback_data: `action:video_schedule:${draft.id}` }]);
            keyboard.push([{ text: t(lang, 'video.btnDelete'), callback_data: `action:video_delete:${draft.id}` }]);
            break;
        case 'approved':
            keyboard.push([{ text: t(lang, 'video.btnPublish'), callback_data: `action:video_publish:${draft.id}`, style: 'success' as const }]);
            keyboard.push([{ text: t(lang, 'drafts.schedule'), callback_data: `action:video_schedule:${draft.id}` }]);
            break;
        case 'queued':
            lines.push(`\n${t(lang, 'video.preparing')}`);
            keyboard.push([{ text: t(lang, 'video.btnDelete'), callback_data: `action:video_delete:${draft.id}` }]);
            break;
        case 'generating':
            lines.push(`\n${t(lang, 'video.generatingByHeygen')}`);
            if (draft.heygen_video_id) lines.push(`${t(lang, 'video.jobId')} <code>${draft.heygen_video_id}</code>`);
            break;
        case 'failed':
            keyboard.push([{ text: t(lang, 'video.retry'), callback_data: `action:video_approve_script:${draft.id}` }]);
            keyboard.push([{ text: t(lang, 'video.btnDelete'), callback_data: `action:video_delete:${draft.id}` }]);
            break;
        case 'published':
            lines.push(`\n${t(lang, 'video.publishedSuccess')}`);
            break;
    }

    keyboard.push([backButton(draft.repo_id ? `view:video_repo:${draft.repo_id}` : 'view:video_studio', lang)]);

    return { text: lines.join('\n'), keyboard };
}

// ==================== VIDEO CONFIG ====================

export function renderVideoConfig(
    repoId: string,
    config: VideoConfig,
    characterName?: string,
    lang: Lang = 'en'
): ViewResult {
    const depthLabel = config.commitDepth === 'since_last_video' ? t(lang, 'video.sinceLastVideo')
        : config.commitDepth === 0 ? t(lang, 'video.noneStandalone')
        : config.commitDepth === 1 ? t(lang, 'video.latestOnly')
        : `Last ${config.commitDepth}`;

    const charDisplay = config.talkingPhotoId
        ? `✅ ${characterName || t(lang, 'video.selected')}`
        : `❌ ${t(lang, 'video.notSet')}`;

    const lines: string[] = [
        t(lang, 'video.configTitle'),
        '',
        `${t(lang, 'video.toneLabel')} ${t(lang, 'common.arrow')} <code>${config.tone}</code>`,
        `${t(lang, 'video.lengthLabel')} ${t(lang, 'common.arrow')} <code>${config.length}</code>`,
        `${t(lang, 'video.aspectLabel')} ${t(lang, 'common.arrow')} <code>${config.aspectRatio}</code>`,
        `${t(lang, 'video.emotionLabel')} ${t(lang, 'common.arrow')} <code>${config.emotion}</code>`,
        `${t(lang, 'video.commitsLabel')} ${t(lang, 'common.arrow')} <code>${depthLabel}</code>`,
        `${t(lang, 'video.characterLabel')} ${t(lang, 'common.arrow')} <code>${charDisplay}</code>`,
        '',
        `${config.captions ? '✅' : '❌'} ${t(lang, 'video.captions')}  ·  ${config.textOverlay ? '✅' : '❌'} ${t(lang, 'video.textOverlay')}`,
    ];

    if (config.manualInstructions) {
        lines.push('');
        lines.push(t(lang, 'video.instructionsLabel'));
        const preview = config.manualInstructions.length > 200
            ? config.manualInstructions.substring(0, 197) + '...'
            : config.manualInstructions;
        lines.push(`<i>${preview}</i>`);
    }

    lines.push('');
    lines.push(t(lang, 'video.tapToCycle'));

    const keyboard: InlineButton[][] = [
        [{ text: `🎤 ${config.tone} ›`, callback_data: `vconfig:tone:${repoId}` }],
        [
            { text: `⏱ ${config.length} ›`, callback_data: `vconfig:length:${repoId}` },
            { text: `📐 ${config.aspectRatio} ›`, callback_data: `vconfig:aspect:${repoId}` },
        ],
        [{ text: `😀 ${config.emotion} ›`, callback_data: `vconfig:emotion:${repoId}` }],
        [{ text: `📊 ${depthLabel} ›`, callback_data: `vconfig:depth:${repoId}` }],
        [
            { text: `${config.captions ? '✅' : '❌'} ${t(lang, 'video.captions')}`, callback_data: `vconfig:captions:${repoId}` },
            { text: `${config.textOverlay ? '✅' : '❌'} ${t(lang, 'video.overlay')}`, callback_data: `vconfig:overlay:${repoId}` },
        ],
        [
            { text: `👤 ${config.talkingPhotoId ? `✅ ${t(lang, 'video.character')}` : t(lang, 'video.character')}`, callback_data: `vconfig:character:${repoId}` },
            { text: `📝 ${t(lang, 'video.instructions')}${config.manualInstructions ? ' ✎' : ''}`, callback_data: `vconfig:instructions:${repoId}` },
        ],
        [
            { text: t(lang, 'video.savePreset'), callback_data: `vconfig:save_preset:${repoId}` },
            { text: t(lang, 'video.loadPreset'), callback_data: `vconfig:load_preset:${repoId}` },
        ],
        [{ text: t(lang, 'video.createVideo'), callback_data: `action:video_generate:${repoId}` }],
        cancelRow(repoId === 'standalone' ? 'view:video_studio' : `view:video_repo:${repoId}`, lang),
    ];

    return { text: lines.join('\n'), keyboard };
}

// ==================== SCRIPT PREVIEW ====================

export function renderScriptPreview(
    draft: VideoDraft,
    script: VideoScriptResponse,
    config: VideoConfig,
    lang: Lang = 'en'
): ViewResult {
    const lines: string[] = [`${t(lang, 'video.scriptPreviewTitle').replace('{title}', script.title)}\n`];

    // Show scenes
    for (let i = 0; i < script.scenes.length; i++) {
        const scene = script.scenes[i];
        lines.push(`${t(lang, 'video.sceneN').replace('{n}', String(i + 1))} (${scene.emotion})`);
        const text = scene.scriptText.length > 200
            ? scene.scriptText.substring(0, 197) + '...'
            : scene.scriptText;
        lines.push(`<i>"${text}"</i>`);
        if (scene.textOverlay) lines.push(`📌 ${scene.textOverlay}`);
        lines.push('');
    }

    // Stats
    lines.push(`${t(lang, 'video.stats')} ${t(lang, 'common.arrow')} <code>${script.scenes.length} scenes</code>, <code>~${script.totalWordCount} words</code>`);

    // Credit estimate (Avatar IV: ~1 premium credit per 3 seconds)
    const creditCost = estimateCreditCost(script.totalWordCount);
    lines.push(`${t(lang, 'video.estimatedCost')} ${t(lang, 'common.arrow')} <code>~${creditCost} ${t(lang, 'video.premiumCredits')}</code>`);

    // Caption preview
    if (script.twitterCaption) {
        lines.push(`\n${t(lang, 'video.twitterCaption')} ${script.twitterCaption}`);
    }

    const keyboard: InlineButton[][] = [
        [{ text: t(lang, 'video.approveGenerate'), callback_data: `action:video_approve_script:${draft.id}` }],
        [{ text: t(lang, 'video.regenerate'), callback_data: `action:video_regen_script:${draft.id}` }],
        [{ text: t(lang, 'video.editConfig'), callback_data: `action:video_create:${draft.repo_id || 'standalone'}` }],
        cancelRow(`action:video_delete:${draft.id}`, lang),
    ];

    return { text: lines.join('\n'), keyboard };
}
