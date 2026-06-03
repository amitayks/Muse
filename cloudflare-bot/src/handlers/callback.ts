/**
 * Callback Handler - Process button clicks
 *
 * Routes callbacks through dispatch tables.
 * Handles photo-to-text message transition.
 * SECURITY: All operations verify ownership via chatId
 */

import type { Env, TelegramCallbackQuery } from '../types';
import type { Lang } from '../ui/strings';
import { editMessage, editMessageCaption, answerCallback, sendMessage, deleteMessage } from '../integrations/telegram';
import { getUserLanguage, getChatState, parseContext } from '../data/db';
import { sanitizeError } from '../infra/security';
import { callbackHandlers } from '../core/router';
import { renderError } from '../views';
import { truncateHtml } from '../ui/utils';

/**
 * Handle callback query (button click)
 */
export async function handleCallback(
    env: Env,
    callback: TelegramCallbackQuery,
    executionCtx?: ExecutionContext
): Promise<void> {
    if (!callback.message || !callback.data) {
        await answerCallback(env, callback.id);
        return;
    }

    const chatId = String(callback.message.chat.id);
    const messageId = callback.message.message_id;
    const data = callback.data;

    console.log('Processing callback:', chatId, data);

    let lang: Lang = 'en';
    try {
        // Get user language
        lang = await getUserLanguage(env, chatId) as Lang;

        // Parse callback data: prefix:value or prefix:value:extra
        // Extra may contain colons (e.g., config:timezone:UTC+5:30)
        const parts = data.split(':');
        const prefix = parts[0];
        const value = parts[1] || '';
        const extra = parts.slice(2).join(':') || undefined;

        // Capture album message IDs BEFORE running handler (handler may clear context)
        const isPhotoMessage = 'photo' in callback.message;
        let preAlbumMessageIds: number[] | undefined;
        if (isPhotoMessage) {
            try {
                const preState = await getChatState(env, chatId);
                const preCtx = parseContext(preState);
                preAlbumMessageIds = preCtx.album_message_ids;
            } catch { /* ignore */ }
        }

        const handler = callbackHandlers[prefix];
        let view;

        if (handler) {
            view = await handler({ env, chatId, messageId, value, extra, executionCtx, lang, callbackId: callback.id });
        }

        // Clean up album messages when navigating away from a photo-message draft.
        // Done before the void check so it covers void handlers (e.g., delete-draft) too.
        // Skip for action/plat prefixes that stay on the same draft.
        const staysOnDraft = prefix === 'action' || prefix === 'plat';
        if (isPhotoMessage && !staysOnDraft && preAlbumMessageIds?.length) {
            try {
                await Promise.all(preAlbumMessageIds.map(id => deleteMessage(env, chatId, id).catch(() => {})));
            } catch { /* ignore — cleanup is best-effort */ }
        }

        // If handler returned void, it handled its own response (e.g., photo send)
        if (!view) {
            // Answer callback to remove loading state (handler may have already answered with toast text)
            answerCallback(env, callback.id).catch(() => {});
            return;
        }

        // Truncate text to Telegram's limits
        const safeText = truncateHtml(view.text, 4096);

        const linkOpts = view.disableLinkPreview ? { disableLinkPreview: true } : undefined;

        if (isPhotoMessage && (prefix === 'action' || prefix === 'plat' || prefix === 'draft')) {
            // Action/platform toggle on a draft with image — update caption in place to keep the photo
            const caption = truncateHtml(safeText, 1024);
            await editMessageCaption(env, chatId, messageId, caption, view.keyboard);
        } else if (isPhotoMessage) {
            // Navigating away from draft — transition from photo to text
            try {
                await deleteMessage(env, chatId, messageId);
            } catch { /* ignore */ }
            await sendMessage(env, chatId, safeText, view.keyboard, linkOpts);
        } else {
            await editMessage(env, chatId, messageId, safeText, view.keyboard, linkOpts);
        }

        // Answer callback — pass toast text if the handler provided one
        answerCallback(env, callback.id, view.toast).catch(() => {});
    } catch (error) {
        answerCallback(env, callback.id).catch(() => {});
        const errDetail = error instanceof Error ? (error.stack || error.message) : String(error);
        console.error('Callback handler error:', errDetail);
        const safeDetail = (error instanceof Error ? error.message : String(error))
            .replace(/</g, '&lt;').replace(/>/g, '&gt;').substring(0, 300);
        const view = renderError(`An error occurred.\n<code>${safeDetail}</code>`, lang);
        const isPhoto = callback.message && 'photo' in callback.message;
        try {
            if (isPhoto) {
                // Photo messages have no text to edit — delete and send new
                try { await deleteMessage(env, chatId, messageId); } catch { /* ignore */ }
                await sendMessage(env, chatId, view.text, view.keyboard);
            } else {
                await editMessage(env, chatId, messageId, view.text, view.keyboard);
            }
        } catch {
            try {
                await sendMessage(env, chatId, view.text, view.keyboard);
            } catch { /* last resort */ }
        }
    }
}
