/**
 * Webapp → Bot Sync
 *
 * When the webapp saves/modifies a draft, this service re-renders the
 * appropriate bot view and calls editMessageText to update the Telegram message.
 * All operations are fire-and-forget — failures are logged but don't affect the webapp.
 */

import type { Env, ViewResult } from '../types';
import { getUser } from '../data/user-db';
import type { Lang } from '../ui/strings';

/**
 * Sync the bot message to show the updated draft detail.
 * Call this after draft content, status, or targets change.
 */
export async function syncBotMessage(env: Env, chatId: string, draftId: string): Promise<void> {
    try {
        const user = await getUser(env, chatId);
        if (!user?.message_id) return; // No bot message to update

        const lang = (user.language || 'en') as Lang;
        const { renderDraftDetail } = await import('../views/drafts');
        const view = await renderDraftDetail(env, chatId, draftId, user.timezone || 'UTC', lang);

        await editBotMessage(env, chatId, user.message_id, view);
    } catch (error) {
        console.error('[webapp-sync] Failed to sync draft detail:', error);
    }
}

/**
 * Sync the bot message to show the home view.
 * Call this after draft deletion (the draft no longer exists to show).
 */
export async function syncBotHome(env: Env, chatId: string): Promise<void> {
    try {
        const user = await getUser(env, chatId);
        if (!user?.message_id) return;

        const lang = (user.language || 'en') as Lang;
        const { renderHome } = await import('../views/home');
        const view = await renderHome(env, chatId, lang);

        await editBotMessage(env, chatId, user.message_id, view);
    } catch (error) {
        console.error('[webapp-sync] Failed to sync home:', error);
    }
}

/**
 * Low-level: edit a Telegram message with a ViewResult.
 */
async function editBotMessage(
    env: Env,
    chatId: string,
    messageId: number,
    view: ViewResult,
): Promise<void> {
    const { editMessage } = await import('../integrations/telegram');
    await editMessage(env, chatId, messageId, view.text, view.keyboard, {
        disableLinkPreview: view.disableLinkPreview,
    });
}
