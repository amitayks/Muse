import type { HandlerContext } from '../core/router';
import type { ViewResult, DraftContent } from '../types';
import type { Lang } from '../ui/strings';
import { getDraft, getChatState, parseContext, updateChatState, getTimezone } from '../data/db';
import { sendMediaGroup } from '../integrations/telegram';
import { renderDraftDetail, renderError } from '../views';
import { getDraftPrimaryImageUrl, reconcileDraftBotMessage } from '../services/draft-message';
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

    // Primary image URL — single source of truth shared with the webapp sync.
    const imageUrl = getDraftPrimaryImageUrl(content, draft, env.WORKER_URL);

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

    let albumMessageIds: number[] | undefined;

    await updateChatState(env, chatId, {
        current_view: 'draft',
        context: { selected_draft_id: draftId, draft_list_type: draftListType, draft_list_page: draftListPage },
    });

    if (imageUrl && messageId) {
        // Send additional images as album first (if multiple per-tweet media)
        if (perTweetMediaUrls.length >= 2) {
            const albumUrls = perTweetMediaUrls.slice(1, 10); // images 2–10
            try {
                albumMessageIds = await sendMediaGroup(env, chatId, albumUrls);
            } catch (albumError) {
                console.error('Album send failed:', sanitizeError(albumError));
                // Continue — primary image will still be sent below
            }
        }

        // Store album message IDs so they can be cleaned up on navigation
        if (albumMessageIds?.length) {
            await updateChatState(env, chatId, {
                context: { selected_draft_id: draftId, draft_list_type: draftListType, draft_list_page: draftListPage, album_message_ids: albumMessageIds },
            });
        }

        // Media-aware edit-or-resend (shared with the webapp sync). Persist the new id when the
        // message is resent (text→photo transition) so a later webapp sync edits the live photo
        // message in place rather than a deleted one.
        const newId = await reconcileDraftBotMessage(env, chatId, messageId, imageUrl, view);
        if (newId !== messageId) {
            await updateChatState(env, chatId, { message_id: newId });
        }
        return; // void — handled sending ourselves
    }

    return view; // let router handle editMessage
}
