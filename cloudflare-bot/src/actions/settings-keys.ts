/**
 * Settings Key Management — sub-page routing, toggles, and API key updates
 */

import type { HandlerContext } from '../core/router';
import type { ViewResult, PublishTargets } from '../types';
import type { Lang } from '../ui/strings';
import { t } from '../ui/strings';
import { getUser, updateDefaultPublishTargets } from '../data/user-db';
import { updateChatState, getTimezone, getPageSize } from '../data/db';
import { getRepostDefaults, setRepostDefault, getCommitDefaults, setCommitDefault, getRepoDefaults, setRepoDefault, getAiProvider, setAiProvider } from '../data/user-settings-db';
import { renderApiKeys, renderSettings, renderSettingsGeneral, renderSettingsSkills, renderSettingsPlatforms, renderSettingsRepost, renderSettingsCommits, renderSettingsRepos } from '../views/settings';
import { analyzeIdentity } from '../ai/identity';
import { hydrateEnv } from '../data/user-keys';
import { renderPlatformBadges, parsePublishTargets } from '../views/platform-toggle';
import { editMessage, answerCallback } from '../integrations/telegram';
import { countStalePrompts } from '../ai/prompts';
import { isAdmin } from '../infra/security';

export async function settingsKeysAction(
    ctx: HandlerContext & { value: string; extra?: string }
): Promise<ViewResult | void> {
    const { env, chatId, value, extra } = ctx;
    const lang = (ctx.lang || 'en') as Lang;

    // ==================== SUB-PAGE NAVIGATION ====================
    if (value === 'sub') {
        return handleSubPage(ctx, lang, extra);
    }

    // ==================== REPOST DEFAULTS ====================
    if (value === 'rp') {
        return handleRepostDefaults(ctx, lang, extra);
    }

    // ==================== COMMIT DEFAULTS ====================
    if (value === 'commit') {
        return handleCommitDefaults(ctx, lang, extra);
    }

    // ==================== REPO DEFAULTS ====================
    if (value === 'repo') {
        return handleRepoDefaults(ctx, lang, extra);
    }

    // ==================== AI PROVIDER TOGGLE ====================
    if (value === 'ai_provider') {
        return handleAiProviderToggle(ctx, lang, extra);
    }

    // ==================== PLATFORM TOGGLE FOR DEFAULT TARGETS ====================
    if (value === 'plat') {
        return handleSettingsPlat(ctx, lang, extra);
    }

    if (value === 'reanalyze_identity') {
        const user = await getUser(env, chatId);
        if (user?.has_x !== 1) {
            return {
                text: t(lang, 'settings.identityNoXConnect'),
                keyboard: [
                    [{ text: t(lang, 'common.back'), callback_data: 'settings:sub:skills' }],
                ],
            };
        }

        try {
            const userEnv = await hydrateEnv(env, chatId);
            const result = await analyzeIdentity(userEnv, chatId, user?.language || lang);

            if (result) {
                return {
                    text: t(lang, 'settings.identityReanalyzedWebApp'),
                    keyboard: [
                        [{ text: t(lang, 'common.back'), callback_data: 'settings:sub:skills' }],
                    ],
                };
            } else {
                return {
                    text: t(lang, 'settings.identityAnalyzeFailedNoTweets'),
                    keyboard: [
                        [{ text: t(lang, 'common.back'), callback_data: 'settings:sub:skills' }],
                    ],
                };
            }
        } catch (error) {
            console.error('[settings] Identity re-analysis failed:', error);
            return {
                text: t(lang, 'settings.identityAnalyzeFailedRetry'),
                keyboard: [
                    [{ text: t(lang, 'common.back'), callback_data: 'settings:sub:skills' }],
                ],
            };
        }
    }

    if (value === 'keys') {
        const user = await getUser(env, chatId);
        await updateChatState(env, chatId, { current_view: 'api_keys', context: null });
        return renderApiKeys({
            hasGemini: user?.has_gemini === 1,
            hasClaude: user?.has_claude === 1,
            hasX: user?.has_x === 1,
            hasGitHub: user?.has_github === 1,
            hasInstagram: user?.has_instagram === 1,
        }, lang);
    }

    if (value === 'update') {
        const service = extra;

        if (service === 'gemini') {
            await updateChatState(env, chatId, {
                current_view: 'api_keys',
                context: { awaiting_input: 'update_key', key_service: 'gemini' },
            });
            return {
                text: `${t(lang, 'apiKeys.updateGeminiTitle')}\n\n${t(lang, 'apiKeys.updateGeminiDesc')}\n\n<i>(Message will be deleted after saving)</i>`,
                keyboard: [
                    [{ text: t(lang, 'apiKeys.geminiLink'), url: 'https://aistudio.google.com/apikey' }],
                    [{ text: t(lang, 'common.back'), callback_data: 'settings:keys' }],
                ],
            };
        }

        if (service === 'x') {
            await updateChatState(env, chatId, {
                current_view: 'api_keys',
                context: { awaiting_input: 'update_key', key_service: 'x' },
            });
            return {
                text: `${t(lang, 'apiKeys.updateXTitle')}\n\n${t(lang, 'apiKeys.updateXDesc')}\n\n<code>API_KEY</code>\n<code>API_SECRET</code>\n<code>ACCESS_TOKEN</code>\n<code>ACCESS_SECRET</code>\n\n<i>(Message will be deleted after saving)</i>`,
                keyboard: [
                    [{ text: t(lang, 'apiKeys.xDevPortal'), url: 'https://developer.x.com/en/portal/dashboard' }],
                    [{ text: t(lang, 'common.back'), callback_data: 'settings:keys' }],
                ],
            };
        }

        if (service === 'github') {
            await updateChatState(env, chatId, {
                current_view: 'api_keys',
                context: { awaiting_input: 'update_key', key_service: 'github' },
            });
            return {
                text: `${t(lang, 'apiKeys.updateGithubTitle')}\n\n${t(lang, 'apiKeys.updateGithubDesc')}\n\n<i>(Message will be deleted after saving)</i>`,
                keyboard: [
                    [{ text: t(lang, 'apiKeys.githubCreateToken'), url: 'https://github.com/settings/tokens' }],
                    [{ text: t(lang, 'common.back'), callback_data: 'settings:keys' }],
                ],
            };
        }

        if (service === 'claude') {
            await updateChatState(env, chatId, {
                current_view: 'api_keys',
                context: { awaiting_input: 'update_key', key_service: 'claude' },
            });
            return {
                text: `${t(lang, 'apiKeys.updateClaudeTitle')}\n\n${t(lang, 'apiKeys.updateClaudeDesc')}\n\n<i>(Message will be deleted after saving)</i>`,
                keyboard: [
                    [{ text: t(lang, 'apiKeys.claudeConsole'), url: 'https://console.anthropic.com/settings/keys' }],
                    [{ text: t(lang, 'common.back'), callback_data: 'settings:keys' }],
                ],
            };
        }

        if (service === 'instagram') {
            await updateChatState(env, chatId, {
                current_view: 'api_keys',
                context: { awaiting_input: 'update_key', key_service: 'instagram' },
            });
            return {
                text: `${t(lang, 'apiKeys.updateInstagramTitle')}\n\n${t(lang, 'apiKeys.updateInstagramDesc')}\n\n<code>ACCESS_TOKEN</code>\n<code>BUSINESS_ACCOUNT_ID</code>\n\n<i>(Message will be deleted after saving)</i>`,
                keyboard: [
                    [{ text: t(lang, 'apiKeys.instagramDevPortal'), url: 'https://developers.facebook.com/' }],
                    [{ text: t(lang, 'common.back'), callback_data: 'settings:keys' }],
                ],
            };
        }
    }
}

// ==================== Sub-page Navigation ====================

async function handleSubPage(
    ctx: HandlerContext & { value: string; extra?: string },
    lang: Lang,
    category?: string
): Promise<ViewResult | void> {
    const { env, chatId } = ctx;

    switch (category) {
        case 'general': {
            const tz = await getTimezone(env, chatId);
            const ps = await getPageSize(env, chatId);
            return renderSettingsGeneral(tz, ps, lang);
        }
        case 'skills': {
            const staleCount = await countStalePrompts(env, chatId);
            const isAdminUser = isAdmin(chatId, env);
            return renderSettingsSkills(lang, env.WORKER_URL, staleCount, isAdminUser);
        }
        case 'platforms': {
            const user = await getUser(env, chatId);
            const provider = await getAiProvider(env, chatId);
            return renderSettingsPlatforms(lang, user?.default_publish_targets, user?.has_instagram === 1, provider);
        }
        case 'repost': {
            const rpDefaults = await getRepostDefaults(env, chatId);
            return renderSettingsRepost(rpDefaults, lang);
        }
        case 'commits': {
            const cmDefaults = await getCommitDefaults(env, chatId);
            return renderSettingsCommits(cmDefaults, lang);
        }
        case 'repos': {
            const repoDefaults = await getRepoDefaults(env, chatId);
            return renderSettingsRepos(repoDefaults, lang);
        }
    }
}

// ==================== Repost Defaults Sub-handler ====================

async function handleRepostDefaults(
    ctx: HandlerContext & { value: string; extra?: string },
    lang: Lang,
    extra?: string
): Promise<ViewResult | void> {
    const { env, chatId } = ctx;

    const fieldMap: Record<string, 'fast_generate_image' | 'analyze_source_image'> = {
        fast_image: 'fast_generate_image',
        source_analysis: 'analyze_source_image',
    };

    const field = fieldMap[extra || ''];
    if (!field) return;

    const current = await getRepostDefaults(env, chatId);
    const currentValue = field === 'fast_generate_image' ? current.fastGenerateImage : current.analyzeSourceImage;
    await setRepostDefault(env, chatId, field, !currentValue);

    // Return to repost sub-page
    const updated = await getRepostDefaults(env, chatId);
    return renderSettingsRepost(updated, lang);
}

// ==================== Commit Defaults Sub-handler ====================

async function handleCommitDefaults(
    ctx: HandlerContext & { value: string; extra?: string },
    lang: Lang,
    extra?: string
): Promise<ViewResult | void> {
    const { env, chatId } = ctx;

    const fieldMap: Record<string, 'commit_fast_image' | 'commit_fast_ai'> = {
        fast_image: 'commit_fast_image',
        fast_ai: 'commit_fast_ai',
    };

    const field = fieldMap[extra || ''];
    if (!field) return;

    const current = await getCommitDefaults(env, chatId);
    const currentValue = field === 'commit_fast_image' ? current.commitFastImage : current.commitFastAi;
    await setCommitDefault(env, chatId, field, !currentValue);

    // Return to commits sub-page
    const updated = await getCommitDefaults(env, chatId);
    return renderSettingsCommits(updated, lang);
}

// ==================== Repo Defaults Sub-handler ====================

async function handleRepoDefaults(
    ctx: HandlerContext & { value: string; extra?: string },
    lang: Lang,
    extra?: string
): Promise<ViewResult | void> {
    const { env, chatId } = ctx;

    const fieldMap: Record<string, 'repo_auto_overview' | 'repo_default_watch_pushes'> = {
        auto_overview: 'repo_auto_overview',
        watch_pushes: 'repo_default_watch_pushes',
    };

    const field = fieldMap[extra || ''];
    if (!field) return;

    const current = await getRepoDefaults(env, chatId);
    const currentValue = field === 'repo_auto_overview' ? current.autoOverview : current.defaultWatchPushes;
    await setRepoDefault(env, chatId, field, !currentValue);

    // Return to repos sub-page
    const updated = await getRepoDefaults(env, chatId);
    return renderSettingsRepos(updated, lang);
}

// ==================== Settings Platform Toggle Sub-handler ====================

async function handleSettingsPlat(
    ctx: HandlerContext & { value: string; extra?: string },
    lang: Lang,
    extra?: string
): Promise<ViewResult | void> {
    const { env, chatId } = ctx;

    if (extra === 'show') {
        const user = await getUser(env, chatId);
        const targets = parsePublishTargets(user?.default_publish_targets);
        const hasInstagram = user?.has_instagram === 1;
        return renderSettingsDefaultTargets(targets, hasInstagram, lang);
    }

    if (extra === 'done') {
        // Return to platforms sub-page
        const user = await getUser(env, chatId);
        const provider = await getAiProvider(env, chatId);
        return renderSettingsPlatforms(lang, user?.default_publish_targets, user?.has_instagram === 1, provider);
    }

    if (extra?.startsWith('toggle:')) {
        const platform = extra.substring(7) as keyof PublishTargets;
        const user = await getUser(env, chatId);
        const targets = parsePublishTargets(user?.default_publish_targets);
        const hasInstagram = user?.has_instagram === 1;

        const newValue = !targets[platform];

        // Mutual exclusivity: post ↔ reel
        if (platform === 'instagram_post' && newValue) targets.instagram_reel = false;
        if (platform === 'instagram_reel' && newValue) targets.instagram_post = false;

        targets[platform] = newValue;

        // Enforce at-least-one target
        const anyEnabled = targets.x || targets.instagram_post || targets.instagram_story || targets.instagram_reel;
        if (!anyEnabled) {
            targets[platform] = true;
            if (ctx.callbackId) {
                await answerCallback(ctx.env, ctx.callbackId, t(lang, 'platforms.noTargetSelected'));
            }
        }

        await updateDefaultPublishTargets(env, chatId, targets);

        const view = renderSettingsDefaultTargets(targets, hasInstagram, lang);
        if (ctx.messageId) {
            await editMessage(env, chatId, ctx.messageId, view.text, view.keyboard);
        }
        return;
    }
}

function renderSettingsDefaultTargets(
    targets: PublishTargets,
    hasInstagram: boolean,
    lang: Lang
): ViewResult {
    const check = (enabled: boolean) => enabled ? '✅' : '⬜';

    const rows: Array<Array<{ text: string; callback_data: string }>> = [];

    rows.push([{
        text: `${check(targets.x)} 🐦 X`,
        callback_data: 'settings:plat:toggle:x',
    }]);

    if (hasInstagram) {
        rows.push([{
            text: `${check(targets.instagram_post)} 📸 ${t(lang, 'platforms.post')}`,
            callback_data: 'settings:plat:toggle:instagram_post',
        }]);
        rows.push([{
            text: `${check(targets.instagram_story)} 📖 ${t(lang, 'platforms.story')}`,
            callback_data: 'settings:plat:toggle:instagram_story',
        }]);
        rows.push([{
            text: `${check(targets.instagram_reel)} 🎬 ${t(lang, 'platforms.reel')}`,
            callback_data: 'settings:plat:toggle:instagram_reel',
        }]);
    }

    rows.push([{
        text: `✅ ${t(lang, 'common.done')}`,
        callback_data: 'settings:plat:done',
    }]);

    const badges = renderPlatformBadges(targets);
    const text = `<b>🎯 ${t(lang, 'platforms.defaultPlatforms')}</b>\n\n${t(lang, 'platforms.defaultPlatformsDesc')}\n\n${t(lang, 'platforms.currentTargets')}: ${badges}`;

    return { text, keyboard: rows };
}

/**
 * Return to the main settings view.
 */
export async function returnToSettings(
    ctx: HandlerContext & { value: string; extra?: string },
    lang: Lang
): Promise<ViewResult> {
    const { env, chatId } = ctx;
    const tz = await getTimezone(env, chatId);
    const ps = await getPageSize(env, chatId);
    const staleCount = await countStalePrompts(env, chatId);
    const user = await getUser(env, chatId);
    const rpDefaults = await getRepostDefaults(env, chatId);
    const cmDefaults = await getCommitDefaults(env, chatId);
    const repoDefaults = await getRepoDefaults(env, chatId);
    const aiProvider = await getAiProvider(env, chatId);
    return renderSettings(tz, ps, lang, staleCount, rpDefaults, cmDefaults, repoDefaults, user?.default_publish_targets, aiProvider);
}

// ==================== AI Provider Toggle Sub-handler ====================

async function handleAiProviderToggle(
    ctx: HandlerContext & { value: string; extra?: string },
    lang: Lang,
    targetProvider?: string
): Promise<ViewResult | void> {
    const { env, chatId } = ctx;

    if (targetProvider === 'claude') {
        // Check if user has a Claude key before switching
        const user = await getUser(env, chatId);
        if (user?.has_claude !== 1) {
            // Prompt for Claude key directly (same flow as settings:update:claude)
            await updateChatState(env, chatId, {
                current_view: 'api_keys',
                context: { awaiting_input: 'update_key', key_service: 'claude' },
            });
            return {
                text: `${t(lang, 'apiKeys.updateClaudeTitle')}\n\n${t(lang, 'apiKeys.updateClaudeDesc')}\n\n<i>(Message will be deleted after saving)</i>`,
                keyboard: [
                    [{ text: t(lang, 'apiKeys.claudeConsole'), url: 'https://console.anthropic.com/settings/keys' }],
                    [{ text: t(lang, 'common.back'), callback_data: 'settings:sub:platforms' }],
                ],
            };
        }
        await setAiProvider(env, chatId, 'claude');
    } else if (targetProvider === 'gemini') {
        await setAiProvider(env, chatId, 'gemini');
    }

    // Return to platforms sub-page with updated provider
    const user = await getUser(env, chatId);
    const provider = await getAiProvider(env, chatId);
    return renderSettingsPlatforms(lang, user?.default_publish_targets, user?.has_instagram === 1, provider);
}
