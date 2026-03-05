/**
 * Settings Key Management — show API keys status and prompt for updates
 */

import type { HandlerContext } from '../core/router';
import type { ViewResult } from '../types';
import type { Lang } from '../ui/strings';
import { t } from '../ui/strings';
import { getUser } from '../data/user-db';
import { updateChatState } from '../data/db';
import { renderApiKeys } from '../views/settings';
import { analyzeIdentity, storeDefaultIdentity } from '../ai/identity';
import { hydrateEnv } from '../data/user-keys';

export async function settingsKeysAction(
    ctx: HandlerContext & { value: string; extra?: string }
): Promise<ViewResult | void> {
    const { env, chatId, value, extra } = ctx;
    const lang = (ctx.lang || 'en') as Lang;

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
