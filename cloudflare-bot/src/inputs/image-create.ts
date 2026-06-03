/**
 * Image create compose input handler — processes text and image messages during image compose mode
 */

import type { Env, ChatContext, ImageComposeState } from '../types';
import type { Lang } from '../ui/strings';
import { updateChatState } from '../data/db';
import { editMessage } from '../integrations/telegram';
import { storeUserMedia, storeUserDocument } from '../data/storage';
import { renderImageCompose } from '../views/image-create';

interface ImageCreateInputContext {
    env: Env;
    chatId: string;
    text: string;
    context: ChatContext;
    lang: Lang;
    message?: {
        message_id: number;
        photo?: Array<{ file_id: string; file_size?: number }>;
        document?: { file_id: string; file_name?: string; mime_type?: string; file_size?: number };
        caption?: string;
    };
}

export async function imageComposeInput(ctx: ImageCreateInputContext): Promise<void> {
    const { env, chatId, context, lang } = ctx;
    const ic = context.imageCompose;
    if (!ic?.active) return;

    const isPhoto = ctx.message?.photo && ctx.message.photo.length > 0;
    const isDocument = ctx.message?.document != null;
    const isTextMessage = !isPhoto && !isDocument && ctx.text;

    if (isTextMessage) {
        // Full text message becomes the prompt
        ic.prompt = ctx.text;
    } else if (isPhoto) {
        // Store largest photo variant
        const photos = ctx.message!.photo!;
        const largestPhoto = photos[photos.length - 1];
        const mediaKey = await storeUserMedia(env, chatId, ctx.message!.message_id, largestPhoto.file_id);
        if (mediaKey) {
            ic.imageKey = mediaKey;
        }
        // Also use caption as prompt if present
        if (ctx.message!.caption) {
            ic.prompt = ctx.message!.caption;
        }
    } else if (isDocument) {
        // Store document if it's an image
        const doc = ctx.message!.document!;
        const mediaKey = await storeUserDocument(env, chatId, ctx.message!.message_id, doc.file_id, doc.mime_type);
        if (mediaKey) {
            ic.imageKey = mediaKey;
        }
        // Also use caption as prompt if present
        if (ctx.message!.caption) {
            ic.prompt = ctx.message!.caption;
        }
    }

    // Update state
    await updateChatState(env, chatId, {
        context: { ...context, imageCompose: ic },
    });

    // Re-render status message
    if (ic.statusMessageId) {
        const view = renderImageCompose(ic, lang);
        try {
            await editMessage(env, chatId, ic.statusMessageId, view.text, view.keyboard);
        } catch {
            // Status message may have been deleted
        }
    }
}
