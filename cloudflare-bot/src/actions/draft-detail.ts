import type { HandlerContext } from '../core/router';
import type { ViewResult, DraftContent } from '../types';
import type { Lang } from '../ui/strings';
import { getDraft, getChatState, parseContext, updateChatState, getTimezone } from '../data/db';
import { ensureImage } from '../data/storage';
import { editMessage, editMessageCaption, deleteMessage, sendPhoto, sendMediaGroup } from '../integrations/telegram';
import { renderDraftDetail, renderError } from '../views';
import { truncateHtml } from '../ui/utils';
import { sanitizeError } from '../infra/security';

/**
 * Extract all photo media URLs from per-tweet media entries.
 * Returns public URLs for each photo, in tweet order.
 */
function extractPerTweetMediaUrls(content: DraftContent, workerUrl: string): string[] {
    const urls: string[] = [];
    for (const tweet of content.tweets) {
        for (const media of tweet.media || []) {
            if (media.type === 'photo') {
                urls.push(`${workerUrl}/media/${media.key}`);
            }
        }
    }
    return urls;
}

export async function draftDetailAction(ctx: HandlerContext & { value: string }): Promise<ViewResult | void> {
    const lang = (ctx.lang || 'en') as Lang;
    const { env, chatId, value: draftId, messageId } = ctx;

    const draft = await getDraft(env, draftId, chatId);
    if (!draft) {
        return renderError('Draft not found.', lang);
    }

    // Parse content once for media extraction
    let content: DraftContent;
    try {
        content = JSON.parse(draft.content) as DraftContent;
    } catch {
        return renderError('Failed to parse draft content.', lang);
    }

    // Check for per-tweet media photos first (user-attached images)
    const perTweetMediaUrls = env.WORKER_URL
        ? extractPerTweetMediaUrls(content, env.WORKER_URL)
        : [];

    let imageUrl: string | null = null;

    if (perTweetMediaUrls.length > 0) {
        // Per-tweet media takes priority — use first image as primary
        imageUrl = perTweetMediaUrls[0];
    } else {
        // Fall back to existing ensureImage behavior
        const shouldEnsureImage = draft.source !== 'handwrite' || !!content.imagePrompt;
        if (shouldEnsureImage) {
            if (messageId && !draft.image_url) {
                try {
                    await editMessage(env, chatId, messageId, '⏳ <b>Retrieving your draft...</b>');
                } catch {
                    try {
                        await editMessageCaption(env, chatId, messageId, '⏳ <b>Retrieving your draft...</b>');
                    } catch { /* ignore — loading state is non-critical */ }
                }
            }
            try {
                const ensuredUrl = await ensureImage(env, chatId, draft);
                if (ensuredUrl) {
                    imageUrl = `${env.WORKER_URL}${ensuredUrl}`;
                }
            } catch (imgError) {
                console.error('Image generation failed:', sanitizeError(imgError));
            }
        }
    }

    // Capture origin list info before overwriting state
    const currentState = await getChatState(env, chatId);
    const currentContext = parseContext(currentState);
    let draftListType: string | undefined;
    let draftListPage: number | undefined;
    if (currentState.current_view?.startsWith('drafts_')) {
        draftListType = currentState.current_view.replace('drafts_', '');
        draftListPage = currentContext.page ?? 0;
    }

    const tz = await getTimezone(env, chatId);
    const view = await renderDraftDetail(env, chatId, draftId, tz, lang);

    await updateChatState(env, chatId, {
        current_view: 'draft',
        context: { selected_draft_id: draftId, draft_list_type: draftListType, draft_list_page: draftListPage },
    });

    if (imageUrl && messageId) {
        const caption = truncateHtml(view.text, 1000);

        // Send additional images as album first (if multiple per-tweet media)
        if (perTweetMediaUrls.length >= 2) {
            const albumUrls = perTweetMediaUrls.slice(1, 10); // images 2–10
            try {
                await sendMediaGroup(env, chatId, albumUrls);
            } catch (albumError) {
                console.error('Album send failed:', sanitizeError(albumError));
                // Continue — primary image will still be sent below
            }
        }

        // If message is already a photo, update caption in place
        try {
            await editMessageCaption(env, chatId, messageId, caption, view.keyboard);
            return; // void — photo preserved, caption updated
        } catch {
            // Not a photo message — transition from text to photo
            try {
                await deleteMessage(env, chatId, messageId);
            } catch { /* ignore */ }
            await sendPhoto(env, chatId, imageUrl, caption, view.keyboard);
            return; // void — handled sending ourselves
        }
    }

    return view; // let router handle editMessage
}
