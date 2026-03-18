/**
 * Onboarding Command Handler — Redesigned unlock-framing flow
 * Flow: Welcome (with lang) → X → Instagram → Identity → Gemini → GitHub → Complete
 */

import type { Env, TelegramUpdate, TelegramCallbackQuery, ViewResult } from '../types';
import { sendMessage, deleteMessage, editMessage } from '../integrations/telegram';
import { encrypt } from '../infra/crypto';
import { getUser, updateUser, storeEncryptedKey } from '../data/user-db';
import {
    buildProgressBar,
    renderWelcome,
    renderXKeysPrompt,
    renderInstagramPrompt,
    renderIdentityStep,
    renderIdentityAnalyzing,
    renderIdentitySnippet,
    renderIdentityFailed,
    renderGeminiKeyPrompt,
    renderGitHubTokenPrompt,
    renderComplete,
    renderKeyError,
} from '../views/onboarding';
import { logInfo, logError, sanitizeError } from '../infra/security';
import { validateGeminiKey } from '../ai/gemini';
import { analyzeIdentity } from '../ai/identity';
import { hydrateEnv } from '../data/user-keys';
import type { Lang } from '../ui/strings';

// ─── Step rendering with progress bar ─────────────────────────────────────

/**
 * Render a step prompt with progress bar prepended, then send or edit.
 * Re-fetches user to ensure progress bar reflects latest state.
 */
async function sendStepView(
    env: Env, chatId: string, telegramChatId: number,
    messageId: number | undefined, step: string, lang: Lang
): Promise<number | undefined> {
    const user = await getUser(env, chatId);
    if (!user) return undefined;

    let view: ViewResult;
    switch (step) {
        case 'x_keys': view = renderXKeysPrompt(lang); break;
        case 'instagram': view = renderInstagramPrompt(lang); break;
        case 'identity': view = renderIdentityStep(50, lang); break;
        case 'gemini_key': view = renderGeminiKeyPrompt(lang); break;
        case 'github_token': view = renderGitHubTokenPrompt(lang); break;
        default: view = renderXKeysPrompt(lang); break;
    }

    const bar = buildProgressBar({
        hasX: user.has_x === 1,
        hasInstagram: user.has_instagram === 1,
        hasGemini: user.has_gemini === 1,
        hasGitHub: user.has_github === 1,
    }, step);
    view = { ...view, text: bar + '\n\n' + view.text };

    let resultMessageId: number | undefined;
    if (messageId) {
        await editMessage(env, telegramChatId, messageId, view.text, view.keyboard);
        resultMessageId = messageId;
    } else {
        resultMessageId = await sendMessage(env, telegramChatId, view.text, view.keyboard);
    }

    // Persist the step prompt message_id so text input handlers can edit it later
    if (resultMessageId) {
        try {
            await updateUser(env, chatId, { onboarding_message_id: resultMessageId });
        } catch { /* column may not exist yet — graceful degradation */ }
    }

    return resultMessageId;
}

/**
 * Handle a message from a user in the onboarding flow.
 */
export async function handleOnboardingMessage(
    env: Env,
    chatId: string,
    telegramChatId: number,
    update: TelegramUpdate
): Promise<void> {
    const user = await getUser(env, chatId);
    if (!user) return;

    const step = user.onboarding_step;
    const lang = (user.language || 'en') as Lang;

    // If user hasn't started yet, show welcome
    if (!step || step === 'welcome') {
        const view = renderWelcome(lang);
        await sendMessage(env, telegramChatId, view.text, view.keyboard);
        await updateUser(env, chatId, { onboarding_step: 'welcome' });
        return;
    }

    // Handle text input for key steps
    const message = update.message;
    const text = message?.text?.trim();
    if (!text || !message) return;

    // Handle /start command at any point during onboarding
    if (text === '/start') {
        const view = renderWelcome(lang);
        await sendMessage(env, telegramChatId, view.text, view.keyboard);
        return;
    }

    if (step === 'x_keys') {
        await handleXKeysInput(env, chatId, telegramChatId, message.message_id, text, lang);
    } else if (step === 'instagram') {
        await handleInstagramInput(env, chatId, telegramChatId, message.message_id, text, lang);
    } else if (step === 'gemini_key') {
        await handleGeminiKeyInput(env, chatId, telegramChatId, message.message_id, text, lang);
    } else if (step === 'github_token') {
        await handleGitHubTokenInput(env, chatId, telegramChatId, message.message_id, text, lang);
    }
}

/**
 * Handle callback query from onboarding buttons.
 */
export async function handleOnboardingCallback(
    env: Env,
    chatId: string,
    callbackQuery: TelegramCallbackQuery
): Promise<void> {
    const data = callbackQuery.data;
    if (!data) return;

    const telegramChatId = callbackQuery.message?.chat?.id;
    if (!telegramChatId) return;
    const messageId = callbackQuery.message?.message_id;

    const user = await getUser(env, chatId);
    const lang = ((user?.language) || 'en') as Lang;

    // ─── Language toggle ───────────────────────────────────────────────
    if (data === 'onboard:lang_en' || data === 'onboard:lang_he') {
        const newLang = data === 'onboard:lang_en' ? 'en' : 'he';
        await updateUser(env, chatId, { language: newLang });
        const view = renderWelcome(newLang as Lang);
        if (messageId) {
            await editMessage(env, telegramChatId, messageId, view.text, view.keyboard);
        } else {
            await sendMessage(env, telegramChatId, view.text, view.keyboard);
        }
        return;
    }

    // ─── Start → smart jump to first incomplete step ───────────────────
    if (data === 'onboard:start') {
        const storedStep = user?.onboarding_step;
        const resumeStep = (storedStep && storedStep !== 'welcome') ? storedStep : 'x_keys';

        if (resumeStep === 'complete' || !resumeStep) {
            await completeOnboarding(env, chatId, telegramChatId, messageId, lang);
            return;
        }

        await updateUser(env, chatId, { onboarding_step: resumeStep });
        await sendStepView(env, chatId, telegramChatId, messageId, resumeStep, lang);
        return;
    }

    // ─── Skip X → go to Instagram (identity falls through to default skeleton) ─
    if (data === 'onboard:skip_x') {
        await updateUser(env, chatId, { onboarding_step: 'instagram' });
        await sendStepView(env, chatId, telegramChatId, messageId, 'instagram', lang);
        return;
    }

    // ─── Skip Instagram → Identity (if has X) or Gemini (if no X) ────
    if (data === 'onboard:skip_instagram') {
        const hasX = user?.has_x === 1;
        const nextStep = hasX ? 'identity' : 'gemini_key';
        await updateUser(env, chatId, { onboarding_step: nextStep });
        await sendStepView(env, chatId, telegramChatId, messageId, nextStep, lang);
        return;
    }

    // ─── Identity: Analyze ────────────────────────────────────────────
    if (data === 'onboard:identity_analyze') {
        await handleIdentityAnalyze(env, chatId, telegramChatId, messageId, lang);
        return;
    }

    // ─── Identity: Use default (no storage needed — falls through to default_prompts skeleton) ─
    if (data === 'onboard:identity_default') {
        await updateUser(env, chatId, { onboarding_step: 'gemini_key' });
        await sendStepView(env, chatId, telegramChatId, messageId, 'gemini_key', lang);
        return;
    }

    // ─── Identity: Next (after snippet) → Gemini ──────────────────────
    if (data === 'onboard:identity_next') {
        await updateUser(env, chatId, { onboarding_step: 'gemini_key' });
        await sendStepView(env, chatId, telegramChatId, messageId, 'gemini_key', lang);
        return;
    }

    // ─── Skip Gemini → GitHub ─────────────────────────────────────────
    if (data === 'onboard:skip_gemini') {
        await updateUser(env, chatId, { onboarding_step: 'github_token' });
        await sendStepView(env, chatId, telegramChatId, messageId, 'github_token', lang);
        return;
    }

    // ─── Skip GitHub → Complete ───────────────────────────────────────
    if (data === 'onboard:skip_github') {
        await completeOnboarding(env, chatId, telegramChatId, messageId, lang);
        return;
    }

    // ─── Post-onboarding navigation (handled by main router) ──────────
    // data === 'view:home' || data === 'view:settings' — no-op here
}

// ─── Key input handlers ────────────────────────────────────────────────────

async function handleXKeysInput(
    env: Env,
    chatId: string,
    telegramChatId: number,
    messageId: number,
    text: string,
    lang: Lang
): Promise<void> {
    // Delete the key message immediately
    try { await deleteMessage(env, telegramChatId, messageId); } catch { }

    // Retrieve stored step prompt message_id for edit-in-place
    const user = await getUser(env, chatId);
    const stepMessageId = user?.onboarding_message_id ?? undefined;

    // Parse 4 lines
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length !== 4) {
        const view = renderKeyError('X', `Expected 4 lines (API_KEY, API_SECRET, ACCESS_TOKEN, ACCESS_SECRET), got ${lines.length}.`, lang);
        if (stepMessageId) {
            await editMessage(env, telegramChatId, stepMessageId, view.text, view.keyboard);
        } else {
            await sendMessage(env, telegramChatId, view.text, view.keyboard);
        }
        return;
    }

    const [apiKey, apiSecret, accessToken, accessSecret] = lines;

    try {
        const valid = await verifyXCredentials(apiKey, apiSecret, accessToken, accessSecret);
        if (!valid.ok) {
            const view = renderKeyError('X', valid.error || 'Credentials verification failed.', lang);
            if (stepMessageId) {
                await editMessage(env, telegramChatId, stepMessageId, view.text, view.keyboard);
            } else {
                await sendMessage(env, telegramChatId, view.text, view.keyboard);
            }
            return;
        }

        // Encrypt and store all 4 keys
        await storeEncryptedKey(env, chatId, 'x_api_key_enc', await encrypt(env, apiKey));
        await storeEncryptedKey(env, chatId, 'x_api_secret_enc', await encrypt(env, apiSecret));
        await storeEncryptedKey(env, chatId, 'x_access_token_enc', await encrypt(env, accessToken));
        await storeEncryptedKey(env, chatId, 'x_access_secret_enc', await encrypt(env, accessSecret));
        await updateUser(env, chatId, { has_x: 1, onboarding_step: 'instagram' });

        // Edit step prompt in-place to show next step (no separate success message)
        await sendStepView(env, chatId, telegramChatId, stepMessageId, 'instagram', lang);
    } catch (error) {
        const view = renderKeyError('X', 'Could not validate credentials. Please try again.', lang);
        if (stepMessageId) {
            await editMessage(env, telegramChatId, stepMessageId, view.text, view.keyboard);
        } else {
            await sendMessage(env, telegramChatId, view.text, view.keyboard);
        }
    }
}

async function handleInstagramInput(
    env: Env,
    chatId: string,
    telegramChatId: number,
    messageId: number,
    text: string,
    lang: Lang
): Promise<void> {
    // Delete the key message immediately
    try { await deleteMessage(env, telegramChatId, messageId); } catch { }

    // Retrieve stored step prompt message_id for edit-in-place
    const currentUser = await getUser(env, chatId);
    const stepMessageId = currentUser?.onboarding_message_id ?? undefined;

    // Parse 2 lines: ACCESS_TOKEN, BUSINESS_ACCOUNT_ID
    // Strip invisible Unicode chars (LTR/RTL marks, zero-width spaces) that Telegram may inject
    const lines = text.split('\n').map(l => l.replace(/[^\x20-\x7E]/g, '').trim()).filter(l => l.length > 0);
    if (lines.length !== 2) {
        const view = renderKeyError('Instagram', `Expected 2 lines (ACCESS_TOKEN, BUSINESS_ACCOUNT_ID), got ${lines.length}.`, lang);
        if (stepMessageId) {
            await editMessage(env, telegramChatId, stepMessageId, view.text, view.keyboard);
        } else {
            await sendMessage(env, telegramChatId, view.text, view.keyboard);
        }
        return;
    }

    const [accessToken, businessAccountId] = lines;

    try {
        // Validate by fetching the Instagram account via Instagram Graph API
        const response = await fetch(`https://graph.instagram.com/me?fields=id,username&access_token=${accessToken}`);
        if (!response.ok) {
            const view = renderKeyError('Instagram', `Instagram API returned status ${response.status}. Please check your token and account ID.`, lang);
            if (stepMessageId) {
                await editMessage(env, telegramChatId, stepMessageId, view.text, view.keyboard);
            } else {
                await sendMessage(env, telegramChatId, view.text, view.keyboard);
            }
            return;
        }

        // Encrypt and store
        await storeEncryptedKey(env, chatId, 'instagram_token_enc', await encrypt(env, accessToken));
        await storeEncryptedKey(env, chatId, 'instagram_account_id_enc', await encrypt(env, businessAccountId));

        const user = await getUser(env, chatId);
        const hasX = user?.has_x === 1;
        await updateUser(env, chatId, { has_instagram: 1, onboarding_step: hasX ? 'identity' : 'gemini_key' });

        // Edit step prompt in-place to show next step (no separate success message)
        const nextStep = hasX ? 'identity' : 'gemini_key';
        await sendStepView(env, chatId, telegramChatId, stepMessageId, nextStep, lang);
    } catch (error) {
        const view = renderKeyError('Instagram', 'Could not validate credentials. Please try again.', lang);
        if (stepMessageId) {
            await editMessage(env, telegramChatId, stepMessageId, view.text, view.keyboard);
        } else {
            await sendMessage(env, telegramChatId, view.text, view.keyboard);
        }
    }
}

async function handleGeminiKeyInput(
    env: Env,
    chatId: string,
    telegramChatId: number,
    messageId: number,
    key: string,
    lang: Lang
): Promise<void> {
    // Delete the key message immediately
    try { await deleteMessage(env, telegramChatId, messageId); } catch { }

    // Retrieve stored step prompt message_id for edit-in-place
    const user = await getUser(env, chatId);
    const stepMessageId = user?.onboarding_message_id ?? undefined;

    // Validate with a test API call
    try {
        const valid = await validateGeminiKey(key);
        if (!valid) {
            const view = renderKeyError('Gemini', 'API key is invalid. Please check your key.', lang);
            if (stepMessageId) {
                await editMessage(env, telegramChatId, stepMessageId, view.text, view.keyboard);
            } else {
                await sendMessage(env, telegramChatId, view.text, view.keyboard);
            }
            return;
        }
    } catch (error) {
        const view = renderKeyError('Gemini', 'Could not validate key. Please try again.', lang);
        if (stepMessageId) {
            await editMessage(env, telegramChatId, stepMessageId, view.text, view.keyboard);
        } else {
            await sendMessage(env, telegramChatId, view.text, view.keyboard);
        }
        return;
    }

    // Encrypt and store
    const encrypted = await encrypt(env, key);
    await storeEncryptedKey(env, chatId, 'gemini_key_enc', encrypted);
    await updateUser(env, chatId, { has_gemini: 1, onboarding_step: 'github_token' });

    // Edit step prompt in-place to show next step (no separate success message)
    await sendStepView(env, chatId, telegramChatId, stepMessageId, 'github_token', lang);
}

async function handleGitHubTokenInput(
    env: Env,
    chatId: string,
    telegramChatId: number,
    messageId: number,
    token: string,
    lang: Lang
): Promise<void> {
    // Delete the key message immediately
    try { await deleteMessage(env, telegramChatId, messageId); } catch { }

    // Retrieve stored step prompt message_id for edit-in-place
    const user = await getUser(env, chatId);
    const stepMessageId = user?.onboarding_message_id ?? undefined;

    // Validate with GET /user
    try {
        const response = await fetch('https://api.github.com/user', {
            headers: {
                'Authorization': `Bearer ${token}`,
                'User-Agent': 'MuseBot',
                'Accept': 'application/vnd.github.v3+json',
            },
        });

        if (!response.ok) {
            const view = renderKeyError('GitHub', `API returned status ${response.status}. Please check your token.`, lang);
            if (stepMessageId) {
                await editMessage(env, telegramChatId, stepMessageId, view.text, view.keyboard);
            } else {
                await sendMessage(env, telegramChatId, view.text, view.keyboard);
            }
            return;
        }

        // Extract GitHub username from response
        const userData = await response.json() as { login: string };

        // Encrypt and store
        const encrypted = await encrypt(env, token);
        await storeEncryptedKey(env, chatId, 'github_token_enc', encrypted);
        await updateUser(env, chatId, { has_github: 1, github_username: userData.login });
    } catch (error) {
        const view = renderKeyError('GitHub', 'Could not validate token. Please try again.', lang);
        if (stepMessageId) {
            await editMessage(env, telegramChatId, stepMessageId, view.text, view.keyboard);
        } else {
            await sendMessage(env, telegramChatId, view.text, view.keyboard);
        }
        return;
    }

    // Complete onboarding — edit the step prompt in-place
    await completeOnboarding(env, chatId, telegramChatId, stepMessageId, lang);
}

// ─── Identity analysis ─────────────────────────────────────────────────────

async function handleIdentityAnalyze(
    env: Env,
    chatId: string,
    telegramChatId: number,
    editMessageId: number | undefined,
    lang: Lang
): Promise<void> {
    // Show "analyzing..." message
    const analyzing = renderIdentityAnalyzing(lang);
    if (editMessageId) {
        await editMessage(env, telegramChatId, editMessageId, analyzing.text, analyzing.keyboard);
    } else {
        await sendMessage(env, telegramChatId, analyzing.text, analyzing.keyboard);
    }

    // Build a scoped env: user's X keys + admin Gemini key for this one-time onboarding call.
    // The user doesn't have their own Gemini key yet (that step comes next).
    let onboardingEnv: Env | null = null;
    try {
        onboardingEnv = await hydrateEnv(env, chatId);
        // Override with admin Gemini key — user hasn't set theirs yet
        onboardingEnv.GOOGLE_API_KEY = env.GOOGLE_API_KEY;

        const result = await analyzeIdentity(onboardingEnv, chatId, lang);

        // Wipe admin key immediately after use
        onboardingEnv.GOOGLE_API_KEY = undefined as any;
        onboardingEnv = null;

        if (result) {
            // Extract snippet (~200 chars) from the identity document
            const snippet = result.document.length > 200
                ? result.document.substring(0, 200) + '...'
                : result.document;

            const view = renderIdentitySnippet(snippet, lang);
            await sendMessage(env, telegramChatId, view.text, view.keyboard);
        } else {
            // Analysis returned null — user falls through to default skeleton
            const failed = renderIdentityFailed(lang);
            await sendMessage(env, telegramChatId, failed.text, failed.keyboard);
            // Advance to Gemini (with progress bar)
            await updateUser(env, chatId, { onboarding_step: 'gemini_key' });
            await sendStepView(env, chatId, telegramChatId, undefined, 'gemini_key', lang);
        }
    } catch (error) {
        // Wipe admin key on any failure path
        if (onboardingEnv) {
            onboardingEnv.GOOGLE_API_KEY = undefined as any;
            onboardingEnv = null;
        }
        logError('Identity analysis failed:', sanitizeError(error));
        // User falls through to default skeleton — no storage needed
        const failed = renderIdentityFailed(lang);
        await sendMessage(env, telegramChatId, failed.text, failed.keyboard);
        // Advance to Gemini (with progress bar)
        await updateUser(env, chatId, { onboarding_step: 'gemini_key' });
        await sendStepView(env, chatId, telegramChatId, undefined, 'gemini_key', lang);
    }
}

// ─── Completion ────────────────────────────────────────────────────────────

async function completeOnboarding(
    env: Env,
    chatId: string,
    telegramChatId: number,
    editMessageId?: number,
    lang: Lang = 'en'
): Promise<void> {
    await updateUser(env, chatId, { status: 'active', onboarding_step: null as any });

    const user = await getUser(env, chatId);
    const view = renderComplete({
        hasGemini: user?.has_gemini === 1,
        hasX: user?.has_x === 1,
        hasInstagram: user?.has_instagram === 1,
        hasGitHub: user?.has_github === 1,
    }, lang);

    if (editMessageId) {
        await editMessage(env, telegramChatId, editMessageId, view.text, view.keyboard);
    } else {
        await sendMessage(env, telegramChatId, view.text, view.keyboard);
    }

    logInfo(`User ${chatId} completed onboarding`);
}

/**
 * Verify X credentials using OAuth 1.0a signature for account/verify_credentials
 */
export async function verifyXCredentials(
    apiKey: string,
    apiSecret: string,
    accessToken: string,
    accessSecret: string
): Promise<{ ok: boolean; username?: string; error?: string }> {
    try {
        const url = 'https://api.x.com/1.1/account/verify_credentials.json';
        const method = 'GET';
        const timestamp = Math.floor(Date.now() / 1000).toString();
        const nonce = crypto.randomUUID().replace(/-/g, '');

        const params: Record<string, string> = {
            oauth_consumer_key: apiKey,
            oauth_nonce: nonce,
            oauth_signature_method: 'HMAC-SHA1',
            oauth_timestamp: timestamp,
            oauth_token: accessToken,
            oauth_version: '1.0',
        };

        // Create signature base string
        const paramString = Object.keys(params)
            .sort()
            .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`)
            .join('&');

        const baseString = `${method}&${encodeURIComponent(url)}&${encodeURIComponent(paramString)}`;
        const signingKey = `${encodeURIComponent(apiSecret)}&${encodeURIComponent(accessSecret)}`;

        // HMAC-SHA1 signature
        const encoder = new TextEncoder();
        const key = await crypto.subtle.importKey(
            'raw',
            encoder.encode(signingKey),
            { name: 'HMAC', hash: 'SHA-1' },
            false,
            ['sign']
        );
        const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(baseString));
        const signature = btoa(String.fromCharCode(...new Uint8Array(sig)));

        params.oauth_signature = signature;

        const authHeader = 'OAuth ' + Object.keys(params)
            .sort()
            .map(k => `${encodeURIComponent(k)}="${encodeURIComponent(params[k])}"`)
            .join(', ');

        const response = await fetch(url, {
            method,
            headers: { 'Authorization': authHeader },
        });

        if (!response.ok) {
            return { ok: false, error: `X API returned status ${response.status}` };
        }

        const data = await response.json() as { screen_name?: string };
        return { ok: true, username: data.screen_name };
    } catch (error) {
        return { ok: false, error: 'Failed to verify X credentials' };
    }
}
