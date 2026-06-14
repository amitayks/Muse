/**
 * Webapp → Bot Sync
 *
 * When the webapp saves/modifies a draft, this service re-renders the
 * appropriate bot view and calls editMessageText to update the Telegram message.
 * All operations are fire-and-forget — failures are logged but don't affect the webapp.
 */

import type { Env, ViewResult, DraftContent } from '../types';
import { getUser } from '../data/user-db';
import { getDraft, updateChatState } from '../data/db';
import { getDraftPrimaryImageUrl, reconcileDraftBotMessage } from './draft-message';
import type { Lang } from '../ui/strings';

/**
 * Sync the bot message to show the updated draft detail.
 * Call this after draft content, status, or targets change.
 */
export async function syncBotMessage(env: Env, chatId: string, draftId: string): Promise<void> {
    try {
        const user = await getUser(env, chatId);
        if (!user?.message_id) return; // No bot message to update

        const draft = await getDraft(env, draftId, chatId);
        if (!draft) return;

        const lang = (user.language || 'en') as Lang;

        // Determine whether the draft is shown as a photo message (so we edit the caption, not text).
        let imageUrl: string | null = null;
        try {
            const content = JSON.parse(draft.content) as DraftContent;
            imageUrl = getDraftPrimaryImageUrl(content, draft, env.WORKER_URL);
        } catch { /* unparseable content → treat as text */ }

        // Allow the destructive delete+resend ONLY when the bot's stored view points at this draft,
        // so a stale message_id can never delete an unrelated message the user is looking at.
        let allowResend = false;
        try {
            const ctx = user.context ? JSON.parse(user.context) as { selected_draft_id?: string } : {};
            allowResend = ctx.selected_draft_id === draftId;
        } catch { /* no/unparseable context → in-place edit only */ }

        const { renderDraftDetail } = await import('../views/drafts');
        const view = await renderDraftDetail(env, chatId, draftId, user.timezone || 'UTC', lang);

        const newId = await reconcileDraftBotMessage(env, chatId, user.message_id, imageUrl, view, allowResend);
        if (newId !== user.message_id) {
            // The message was resent — keep users.message_id pointed at the live message.
            await updateChatState(env, chatId, { message_id: newId });
        }
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
