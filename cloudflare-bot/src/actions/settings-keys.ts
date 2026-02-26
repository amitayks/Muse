/**
 * Settings Key Management — show API keys status and prompt for updates
 */

import type { HandlerContext } from '../core/router';
import type { ViewResult } from '../types';
import type { Lang } from '../ui/strings';
import { t } from '../ui/strings';
import { getUser } from '../services/user-db';
import { updateChatState } from '../services/db';
import { renderApiKeys } from '../views/settings';

export async function settingsKeysAction(
    ctx: HandlerContext & { value: string; extra?: string }
): Promise<ViewResult | void> {
    const { env, chatId, value, extra } = ctx;
    const lang = (ctx.lang || 'en') as Lang;

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
