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
import { updateChatState } from '../data/user-settings-db';
import { renderApiKeys } from '../views/settings';
import { validateGeminiKey } from '../ai/gemini';
import { validateClaudeKey } from '../ai/claude';
import { setAiProvider } from '../data/user-settings-db';
import { connectInstagram } from '../services/instagram-token';

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

    // On validation failure, preserve the awaiting_input context so the user can retry
    // (respond() will clear context to null, so we re-set it before returning)
    async function failWithRetry(message: string): Promise<ViewResult> {
        await updateChatState(env, chatId, {
            context: { awaiting_input: 'update_key', key_service: service as any },
        });
        return {
            text: `${message}\n\n<i>${t(lang, 'settingsKeys.retryHint')}</i>`,
            keyboard: [[backButton]],
        };
    }

    if (service === 'gemini') {
        try {
            const valid = await validateGeminiKey(text);
            if (!valid) {
                return failWithRetry(t(lang, 'settingsKeys.geminiValidationFailed').replace('{status}', 'invalid'));
            }
        } catch {
            return failWithRetry(t(lang, 'settingsKeys.geminiValidationError'));
        }
        await storeEncryptedKey(env, chatId, 'gemini_key_enc', await encrypt(env, text));
        await updateUser(env, chatId, { has_gemini: 1 });
    } else if (service === 'x') {
        // X now connects via OAuth 2.0 in the web app (the OAuth 1.0a key-paste flow is retired).
        // Don't store pasted keys — point the user to the in-app "Connect X" button.
        const appUrl = env.WEBAPP_URL;
        const openApp = appUrl ? [[{ text: t(lang, 'settingsKeys.openAppConnectX'), url: appUrl }]] : [];
        return {
            text: t(lang, 'settingsKeys.xConnectViaApp'),
            keyboard: [...openApp, [backButton]],
        };
    } else if (service === 'github') {
        let githubUsername: string | undefined;
        try {
            const response = await fetch('https://api.github.com/user', {
                headers: {
                    'Authorization': `Bearer ${text}`,
                    'User-Agent': 'MuseBot',
                    'Accept': 'application/vnd.github.v3+json',
                },
            });
            if (!response.ok) {
                return failWithRetry(t(lang, 'settingsKeys.githubValidationFailed').replace('{status}', String(response.status)));
            }
            const userData = await response.json() as { login: string };
            githubUsername = userData.login;
        } catch {
            return failWithRetry(t(lang, 'settingsKeys.githubValidationError'));
        }
        await storeEncryptedKey(env, chatId, 'github_token_enc', await encrypt(env, text));
        await updateUser(env, chatId, { has_github: 1, github_username: githubUsername });
    } else if (service === 'claude') {
        try {
            const valid = await validateClaudeKey(text);
            if (!valid) {
                return failWithRetry(t(lang, 'settingsKeys.claudeValidationFailed'));
            }
        } catch {
            return failWithRetry(t(lang, 'settingsKeys.claudeValidationError'));
        }
        await storeEncryptedKey(env, chatId, 'claude_key_enc', await encrypt(env, text));
        await updateUser(env, chatId, { has_claude: 1 });
        await setAiProvider(env, chatId, 'claude');
    } else if (service === 'instagram') {
        const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        if (lines.length !== 3) {
            return failWithRetry(t(lang, 'settingsKeys.instagramExpectedLines').replace('{count}', String(lines.length)));
        }
        const [accessToken, businessAccountId, appSecret] = lines;

        // Validate by calling the Instagram Graph API
        try {
            const response = await fetch(`https://graph.instagram.com/me?fields=id,username&access_token=${accessToken}`);
            if (!response.ok) {
                return failWithRetry(t(lang, 'settingsKeys.instagramValidationFailed').replace('{status}', String(response.status)));
            }
        } catch {
            return failWithRetry(t(lang, 'settingsKeys.instagramValidationError'));
        }

        // Exchange short-lived -> long-lived and persist token/account/secret/expiry
        await connectInstagram(env, chatId, accessToken, businessAccountId, appSecret);
        await updateUser(env, chatId, { has_instagram: 1 });
    }

    // Show success and updated API keys view
    const user = await getUser(env, chatId);
    return renderApiKeys({
        hasGemini: user?.has_gemini === 1,
        hasClaude: user?.has_claude === 1,
        hasX: user?.has_x === 1,
        hasGitHub: user?.has_github === 1,
        hasInstagram: user?.has_instagram === 1,
    }, lang);
}
