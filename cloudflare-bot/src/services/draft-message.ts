/**
 * Draft → Telegram message reconciliation (shared by the bot's draft view and the webapp sync).
 *
 * A draft is shown in Telegram either as a TEXT message or, when it has an image, as a PHOTO
 * message (image + caption). Editing must use the matching method (`editMessageText` vs
 * `editMessageCaption`); using the wrong one — or a stale `message_id` — fails ("there is no
 * text/caption in the message to edit", "message to edit not found"). This helper picks the right
 * method, falls back to delete+resend on a type mismatch / stale id, and returns the resulting
 * message id so callers can persist it to `users.message_id`.
 */

import type { Env, DraftContent, ViewResult } from '../types';
import { editMessage, editMessageCaption, deleteMessage, sendPhoto, sendMessage } from '../integrations/telegram';
import { truncateHtml } from '../ui/utils';

/** Telegram photo-caption length cap used for draft cards. */
const CAPTION_MAX = 1000;

/**
 * Resolve a draft's primary image URL (the one shown on the bot's photo message), or null for a
 * text draft. Mirrors `draftDetailAction`: per-tweet photo media takes priority (served from
 * `/media/<key>`), otherwise the creation-time `draft.image_url` (served from `/image/<key>`).
 */
export function getDraftPrimaryImageUrl(
    content: DraftContent,
    draft: { image_url: string | null },
    workerUrl?: string,
): string | null {
    if (!workerUrl) return null;

    for (const tweet of content.tweets) {
        for (const media of tweet.media || []) {
            if (media.type === 'photo') {
                return `${workerUrl}/media/${media.key}`;
            }
        }
    }

    if (draft.image_url) {
        return `${workerUrl}/image/${draft.image_url}`;
    }

    return null;
}

/**
 * Update the bot message for a draft, choosing the method that matches its current type and
 * resending if the in-place edit fails (wrong type / deleted message). Returns the resulting
 * message id: unchanged when edited in place, NEW when resent (caller MUST persist it).
 *
 * The in-place edit is always attempted (non-destructive). The delete+resend fallback is gated by
 * `allowResend` — callers that aren't certain the stored message is this draft (the webapp sync)
 * pass false so a stale id can't delete an unrelated message; on a failed edit with `allowResend`
 * false, the original error is rethrown for the caller to log/swallow and the message is left as-is.
 */
export async function reconcileDraftBotMessage(
    env: Env,
    chatId: string,
    messageId: number,
    imageUrl: string | null,
    view: ViewResult,
    allowResend = true,
): Promise<number> {
    if (imageUrl) {
        const caption = truncateHtml(view.text, CAPTION_MAX);
        try {
            // Already a photo message → update the caption in place (id unchanged).
            await editMessageCaption(env, chatId, messageId, caption, view.keyboard);
            return messageId;
        } catch (err) {
            if (!allowResend) throw err;
            // Not a photo / stale id → transition to a photo message.
            try { await deleteMessage(env, chatId, messageId); } catch { /* best-effort */ }
            return await sendPhoto(env, chatId, imageUrl, caption, view.keyboard);
        }
    }

    try {
        // Already a text message → edit in place (id unchanged).
        await editMessage(env, chatId, messageId, view.text, view.keyboard, {
            disableLinkPreview: view.disableLinkPreview,
        });
        return messageId;
    } catch (err) {
        if (!allowResend) throw err;
        // Was a photo / stale id → transition back to a text message.
        try { await deleteMessage(env, chatId, messageId); } catch { /* best-effort */ }
        return await sendMessage(env, chatId, view.text, view.keyboard);
    }
}
