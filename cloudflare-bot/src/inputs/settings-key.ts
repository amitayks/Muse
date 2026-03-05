/**
 * Settings Key Input — validate, encrypt, and store API keys from settings flow
 */

import type { HandlerContext } from '../core/router';
import type { ViewResult, ChatContext } from '../types';
import type { Lang } from '../ui/strings';
import { t } from '../ui/strings';
import { deleteMessage } from '../integrations/telegram';
import { encrypt } from '../infra/crypto';
import { storeEncryptedKey, updateUser, getUser } from '../data/user-db';
import { renderApiKeys } from '../views/settings';
import { validateGeminiKey } from '../ai/gemini';

export async function settingsKeyInput(
    ctx: HandlerContext & { text: string; context: ChatContext }
): Promise<ViewResult | void> {
    const { env, chatId, messageId, text, context } = ctx;
    const lang = ((ctx as any).lang || 'en') as Lang;
    const service = context?.key_service as string;
    if (!service) return;

    // Delete the key message immediately
    if (messageId) {
        try { await deleteMessage(env, Number(chatId), messageId); } catch { }
    }

    const backButton = { text: t(lang, 'common.back'), callback_data: 'settings:keys' };

    if (service === 'gemini') {
        try {
            const valid = await validateGeminiKey(text);
            if (!valid) {
                return {
                    text: t(lang, 'settingsKeys.geminiValidationFailed').replace('{status}', 'invalid'),
                    keyboard: [[backButton]],
                };
            }
        } catch {
            return {
                text: t(lang, 'settingsKeys.geminiValidationError'),
                keyboard: [[backButton]],
            };
        }
        await storeEncryptedKey(env, chatId, 'gemini_key_enc', await encrypt(env, text));
        await updateUser(env, chatId, { has_gemini: 1 });
    } else if (service === 'x') {
        const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        if (lines.length !== 4) {
            return {
                text: t(lang, 'settingsKeys.xExpectedLines').replace('{count}', String(lines.length)),
                keyboard: [[backButton]],
            };
        }
        const [apiKey, apiSecret, accessToken, accessSecret] = lines;

        // Validate with OAuth 1.0a verifyCredentials
        const { verifyXCredentials } = await import('../commands/onboarding');
        const result = await verifyXCredentials(apiKey, apiSecret, accessToken, accessSecret);
        if (!result.ok) {
            return {
                text: t(lang, 'settingsKeys.xValidationFailed').replace('{error}', result.error || 'Unknown error'),
                keyboard: [[backButton]],
            };
        }

        await storeEncryptedKey(env, chatId, 'x_api_key_enc', await encrypt(env, apiKey));
        await storeEncryptedKey(env, chatId, 'x_api_secret_enc', await encrypt(env, apiSecret));
        await storeEncryptedKey(env, chatId, 'x_access_token_enc', await encrypt(env, accessToken));
        await storeEncryptedKey(env, chatId, 'x_access_secret_enc', await encrypt(env, accessSecret));
        await updateUser(env, chatId, { has_x: 1 });
    } else if (service === 'github') {
        try {
            const response = await fetch('https://api.github.com/user', {
                headers: {
                    'Authorization': `Bearer ${text}`,
                    'User-Agent': 'MuseBot',
                    'Accept': 'application/vnd.github.v3+json',
                },
            });
            if (!response.ok) {
                return {
                    text: t(lang, 'settingsKeys.githubValidationFailed').replace('{status}', String(response.status)),
                    keyboard: [[backButton]],
                };
            }
        } catch {
            return {
                text: t(lang, 'settingsKeys.githubValidationError'),
                keyboard: [[backButton]],
            };
        }
        await storeEncryptedKey(env, chatId, 'github_token_enc', await encrypt(env, text));
        await updateUser(env, chatId, { has_github: 1 });
    } else if (service === 'instagram') {
        const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        if (lines.length !== 2) {
            return {
                text: t(lang, 'settingsKeys.instagramExpectedLines').replace('{count}', String(lines.length)),
                keyboard: [[backButton]],
            };
        }
        const [accessToken, businessAccountId] = lines;

        // Validate by calling Facebook Graph API
        try {
            const response = await fetch(`https://graph.facebook.com/v21.0/me?access_token=${accessToken}`);
            if (!response.ok) {
                return {
                    text: t(lang, 'settingsKeys.instagramValidationFailed').replace('{status}', String(response.status)),
                    keyboard: [[backButton]],
                };
            }
        } catch {
            return {
                text: t(lang, 'settingsKeys.instagramValidationError'),
                keyboard: [[backButton]],
            };
        }

        await storeEncryptedKey(env, chatId, 'instagram_token_enc', await encrypt(env, accessToken));
        await storeEncryptedKey(env, chatId, 'instagram_account_id_enc', await encrypt(env, businessAccountId));
        await updateUser(env, chatId, { has_instagram: 1 });
    }

    // Show success and updated API keys view
    const user = await getUser(env, chatId);
    return renderApiKeys({
        hasGemini: user?.has_gemini === 1,
        hasX: user?.has_x === 1,
        hasGitHub: user?.has_github === 1,
        hasInstagram: user?.has_instagram === 1,
    }, lang);
}
