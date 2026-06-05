/**
 * Image create compose input handler — processes text and image messages during image compose mode.
 *
 * Accumulates multiple prompt segments and multiple reference images until Pen Down.
 * Each segment/image is keyed by its Telegram message_id, so an edited message updates
 * only its own contribution (mirrors handwrite compose). Upsert-by-messageId means a new
 * message (fresh id) appends, while an edit (matching id) updates in place.
 */

import type { Env, ChatContext, ImageComposeState, ImagePromptSegment, ImageRef } from '../types';
import type { Lang } from '../ui/strings';
import { updateChatState } from '../data/db';
import { editMessage } from '../integrations/telegram';
import { storeUserMedia, storeUserDocument } from '../data/storage';
import { renderImageCompose } from '../views/image-create';
import { logInfo } from '../infra/security';

interface ImageCreateInputContext {
    env: Env;
    chatId: string;
    text: string;
    context: ChatContext;
    lang: Lang;
    isEdit?: boolean;
    message?: {
        message_id: number;
        photo?: Array<{ file_id: string; file_size?: number }>;
        document?: { file_id: string; file_name?: string; mime_type?: string; file_size?: number };
        caption?: string;
    };
}

/**
 * Normalize legacy single-slot state (`prompt`/`imageKey`) into the multi-message
 * shape so compose sessions already in progress at deploy time keep working.
 */
function normalizeState(ic: ImageComposeState): { segments: ImagePromptSegment[]; images: ImageRef[] } {
    const segments = ic.segments ?? (ic.prompt ? [{ messageId: 0, text: ic.prompt }] : []);
    const images = ic.images ?? (ic.imageKey ? [{ messageId: 0, key: ic.imageKey }] : []);
    return { segments: [...segments], images: [...images] };
}

export async function imageComposeInput(ctx: ImageCreateInputContext): Promise<void> {
    const { env, chatId, context, lang, isEdit } = ctx;
    const ic = context.imageCompose;
    if (!ic?.active) return;

    const { segments, images } = normalizeState(ic);
    const messageId = ctx.message?.message_id || 0;

    const isPhoto = ctx.message?.photo && ctx.message.photo.length > 0;
    const isDocument = ctx.message?.document != null;
    const isTextMessage = !isPhoto && !isDocument && !!ctx.text;

    /** Insert or update a prompt segment keyed by messageId. */
    const upsertSegment = (text: string) => {
        const i = segments.findIndex(s => s.messageId === messageId);
        if (i >= 0) segments[i].text = text;
        else segments.push({ messageId, text });
    };
    /** Insert or update a reference image keyed by messageId. */
    const upsertImage = (key: string) => {
        const i = images.findIndex(img => img.messageId === messageId);
        if (i >= 0) images[i].key = key;
        else images.push({ messageId, key });
    };

    if (isTextMessage) {
        // Full text message becomes a prompt segment (append for new, update in place for edits)
        upsertSegment(ctx.text);
    } else if (isPhoto) {
        // Store largest photo variant as a reference image
        const photos = ctx.message!.photo!;
        const largestPhoto = photos[photos.length - 1];
        const mediaKey = await storeUserMedia(env, chatId, messageId, largestPhoto.file_id);
        if (mediaKey) upsertImage(mediaKey);
        // Caption (if present) becomes a tracked segment with the same messageId
        if (ctx.message!.caption) upsertSegment(ctx.message!.caption);
    } else if (isDocument) {
        // Store document if it's an image (non-image MIME returns null and is ignored)
        const doc = ctx.message!.document!;
        const mediaKey = await storeUserDocument(env, chatId, messageId, doc.file_id, doc.mime_type);
        if (mediaKey) upsertImage(mediaKey);
        if (ctx.message!.caption) upsertSegment(ctx.message!.caption);
    }

    logInfo('imageCompose input', isEdit ? '(edit)' : '(new)', 'segments:', segments.length, 'images:', images.length);

    // Persist the multi-message shape, dropping any legacy single-slot fields
    const newState: ImageComposeState = {
        active: true,
        segments,
        images,
        statusMessageId: ic.statusMessageId,
    };
    await updateChatState(env, chatId, {
        context: { ...context, imageCompose: newState },
    });

    // Re-render status message
    if (newState.statusMessageId) {
        const view = renderImageCompose(newState, lang);
        try {
            await editMessage(env, chatId, newState.statusMessageId, view.text, view.keyboard);
        } catch {
            // Status message may have been deleted
        }
    }
}
