/**
 * Settings Key Management — show API keys status and prompt for updates
 */

import type { HandlerContext } from '../core/router';
import type { ViewResult, PublishTargets } from '../types';
import type { Lang } from '../ui/strings';
import { t } from '../ui/strings';
import { getUser, updateDefaultPublishTargets } from '../data/user-db';
import { updateChatState, getTimezone, getPageSize } from '../data/db';
import { getRepostDefaults, setRepostDefault, getCommitDefaults, setCommitDefault } from '../data/user-settings-db';
import { renderApiKeys, renderSettings } from '../views/settings';
import { analyzeIdentity, storeDefaultIdentity } from '../ai/identity';
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

    // ==================== REPOST DEFAULTS ====================
    if (value === 'rp') {
        return handleRepostDefaults(ctx, lang, extra);
    }

    // ==================== COMMIT DEFAULTS ====================
    if (value === 'commit') {
        return handleCommitDefaults(ctx, lang, extra);
    }

    // ==================== PLATFORM TOGGLE FOR DEFAULT TARGETS ====================
    if (value === 'plat') {
        return handleSettingsPlat(ctx, lang, extra);
    }

    if (value === 'reanalyze_identity') {
        const user = await getUser(env, chatId);
        if (user?.has_x !== 1) {
            return {
                text: '⚠️ X/Twitter credentials are required for identity analysis.\n\nPlease connect your X account first from API Keys settings.',
                keyboard: [
                    [{ text: t(lang, 'common.back'), callback_data: 'view:settings' }],
                ],
            };
        }

        // Return analyzing message — actual analysis happens asynchronously
        try {
            const userEnv = await hydrateEnv(env, chatId);
            const result = await analyzeIdentity(userEnv, chatId, user?.language || lang);

            if (result) {
                return {
                    text: '✅ <b>Identity re-analysis complete!</b>\n\nYour Identity Document has been updated. You can view and edit it in the WebApp.',
                    keyboard: [
                        [{ text: t(lang, 'common.back'), callback_data: 'view:settings' }],
                    ],
                };
            } else {
                return {
                    text: '⚠️ Re-analysis failed. No tweets were found or an error occurred.\n\nYour existing identity remains unchanged.',
                    keyboard: [
                        [{ text: t(lang, 'common.back'), callback_data: 'view:settings' }],
                    ],
                };
            }
        } catch (error) {
            console.error('[settings] Identity re-analysis failed:', error);
            return {
                text: '⚠️ Re-analysis failed. Please try again later.\n\nYour existing identity remains unchanged.',
                keyboard: [
                    [{ text: t(lang, 'common.back'), callback_data: 'view:settings' }],
                ],
            };
        }
    }

    if (value === 'keys') {
        const user = await getUser(env, chatId);
        await updateChatState(env, chatId, { current_view: 'api_keys', context: null });
        return renderApiKeys({
            hasGemini: user?.has_gemini === 1,
            hasX: user?.has_x === 1,
            hasGitHub: user?.has_github === 1,
            hasInstagram: user?.has_instagram === 1,
        });
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

// ==================== Repost Defaults Sub-handler ====================

async function handleRepostDefaults(
    ctx: HandlerContext & { value: string; extra?: string },
    lang: Lang,
    extra?: string
): Promise<ViewResult | void> {
    const { env, chatId } = ctx;

    // settings:rp:fast_image → toggle fast_generate_image
    // settings:rp:source_analysis → toggle analyze_source_image
    const fieldMap: Record<string, 'fast_generate_image' | 'analyze_source_image'> = {
        fast_image: 'fast_generate_image',
        source_analysis: 'analyze_source_image',
    };

    const field = fieldMap[extra || ''];
    if (!field) return;

    const current = await getRepostDefaults(env, chatId);
    const currentValue = field === 'fast_generate_image' ? current.fastGenerateImage : current.analyzeSourceImage;
    await setRepostDefault(env, chatId, field, !currentValue);

    return returnToSettings(ctx, lang);
}

// ==================== Commit Defaults Sub-handler ====================

async function handleCommitDefaults(
    ctx: HandlerContext & { value: string; extra?: string },
    lang: Lang,
    extra?: string
): Promise<ViewResult | void> {
    const { env, chatId } = ctx;

    // settings:commit:fast_image → toggle commit_fast_image
    // settings:commit:fast_ai → toggle commit_fast_ai
    const fieldMap: Record<string, 'commit_fast_image' | 'commit_fast_ai'> = {
        fast_image: 'commit_fast_image',
        fast_ai: 'commit_fast_ai',
    };

    const field = fieldMap[extra || ''];
    if (!field) return;

    const current = await getCommitDefaults(env, chatId);
    const currentValue = field === 'commit_fast_image' ? current.commitFastImage : current.commitFastAi;
    await setCommitDefault(env, chatId, field, !currentValue);

    return returnToSettings(ctx, lang);
}

// ==================== Settings Platform Toggle Sub-handler ====================

async function handleSettingsPlat(
    ctx: HandlerContext & { value: string; extra?: string },
    lang: Lang,
    extra?: string
): Promise<ViewResult | void> {
    const { env, chatId } = ctx;

    // settings:plat:show → extra = 'show'
    if (extra === 'show') {
        const user = await getUser(env, chatId);
        const targets = parsePublishTargets(user?.default_publish_targets);
        const hasInstagram = user?.has_instagram === 1;

        return renderSettingsDefaultTargets(targets, hasInstagram, lang);
    }

    // settings:plat:done → extra = 'done'
    if (extra === 'done') {
        return returnToSettings(ctx, lang);
    }

    // settings:plat:toggle:PLATFORM → extra = 'toggle:PLATFORM'
    if (extra?.startsWith('toggle:')) {
        const platform = extra.substring(7) as keyof PublishTargets;
        const user = await getUser(env, chatId);
        const targets = parsePublishTargets(user?.default_publish_targets);
        const hasInstagram = user?.has_instagram === 1;

        // Toggle the platform
        const newValue = !targets[platform];

        // Mutual exclusivity: post ↔ reel
        if (platform === 'instagram_post' && newValue) targets.instagram_reel = false;
        if (platform === 'instagram_reel' && newValue) targets.instagram_post = false;

        targets[platform] = newValue;

        // Enforce at-least-one target
        const anyEnabled = targets.x || targets.instagram_post || targets.instagram_story || targets.instagram_reel;
        if (!anyEnabled) {
            targets[platform] = true; // Revert
            if (ctx.callbackId) {
                await answerCallback(ctx.env, ctx.callbackId, t(lang, 'platforms.noTargetSelected'));
            }
        }

        // Save
        await updateDefaultPublishTargets(env, chatId, targets);

        // Re-render toggle view in-place
        const view = renderSettingsDefaultTargets(targets, hasInstagram, lang);
        if (ctx.messageId) {
            await editMessage(env, chatId, ctx.messageId, view.text, view.keyboard);
        }
        return;
    }
}

/**
 * Render the settings default platform targets toggle view.
 */
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
async function returnToSettings(
    ctx: HandlerContext & { value: string; extra?: string },
    lang: Lang
): Promise<ViewResult> {
    const { env, chatId } = ctx;
    const tz = await getTimezone(env, chatId);
    const ps = await getPageSize(env, chatId);
    const staleCount = await countStalePrompts(env, chatId);
    const isAdminUser = isAdmin(chatId, env);
    const user = await getUser(env, chatId);
    const rpDefaults = await getRepostDefaults(env, chatId);
    const cmDefaults = await getCommitDefaults(env, chatId);
    return renderSettings(tz, ps, lang, env.WORKER_URL, staleCount, isAdminUser, user?.default_publish_targets, user?.has_instagram === 1, rpDefaults, cmDefaults);
}
