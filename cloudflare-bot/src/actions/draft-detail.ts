import type { HandlerContext } from '../core/router';
import type { ViewResult, DraftContent } from '../types';
import type { Lang } from '../ui/strings';
import { getDraft, getChatState, parseContext, updateChatState, getTimezone } from '../data/db';
import { ensureImage } from '../data/storage';
import { editMessage, editMessageCaption, deleteMessage, sendPhoto } from '../integrations/telegram';
import { renderDraftDetail, renderError } from '../views';
import { truncateHtml } from '../ui/utils';
import { sanitizeError } from '../infra/security';

export async function draftDetailAction(ctx: HandlerContext & { value: string }): Promise<ViewResult | void> {
    const lang = (ctx.lang || 'en') as Lang;
    const { env, chatId, value: draftId, messageId } = ctx;

    const draft = await getDraft(env, draftId, chatId);
    if (!draft) {
        return renderError('Draft not found.', lang);
    }

    let imageUrl: string | null = null;
    // For handwritten drafts, only generate images if the user toggled image gen (imagePrompt exists)
    const shouldEnsureImage = draft.source !== 'handwrite' || (() => {
        try {
            const content = JSON.parse(draft.content) as DraftContent;
            return !!content.imagePrompt;
        } catch { return false; }
    })();
    if (shouldEnsureImage) {
        // Only show loading state when image needs generating (not already cached)
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
            imageUrl = await ensureImage(env, chatId, draft);
        } catch (imgError) {
            console.error('Image generation failed:', sanitizeError(imgError));
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
        // If the message is already a photo (e.g. returning from schedule), just update the caption
        try {
            await editMessageCaption(env, chatId, messageId, caption, view.keyboard);
            return; // void — photo preserved, caption updated
        } catch {
            // Not a photo message — transition from text to photo
            try {
                await deleteMessage(env, chatId, messageId);
            } catch { /* ignore */ }
            const fullImageUrl = `${env.WORKER_URL}${imageUrl}`;
            await sendPhoto(env, chatId, fullImageUrl, caption, view.keyboard);
            return; // void — handled sending ourselves
        }
    }

    return view; // let router handle editMessage
}
