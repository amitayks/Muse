/**
 * Thumbnail compose input handler — processes text and image messages during thumb compose mode
 */

import type { Env, ChatContext, ThumbComposeState } from '../types';
import type { Lang } from '../ui/strings';
import { updateChatState } from '../data/db';
import { editMessage } from '../integrations/telegram';
import { storeUserMedia, storeUserDocument } from '../data/storage';
import { renderThumbCompose } from '../views/thumb';

interface ThumbInputContext {
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

/**
 * Parse numbered fields from text message.
 * Lines starting with "1." → title, "2." → color, "3." → icons
 */
function parseThumbFields(text: string): { title?: string; color?: string; icons?: string } {
    const result: { title?: string; color?: string; icons?: string } = {};
    const lines = text.split('\n');

    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.match(/^1\.\s*/)) {
            result.title = trimmed.replace(/^1\.\s*/, '').trim();
        } else if (trimmed.match(/^2\.\s*/)) {
            result.color = trimmed.replace(/^2\.\s*/, '').trim();
        } else if (trimmed.match(/^3\.\s*/)) {
            result.icons = trimmed.replace(/^3\.\s*/, '').trim();
        }
    }

    return result;
}

export async function thumbComposeInput(ctx: ThumbInputContext): Promise<void> {
    const { env, chatId, context, lang } = ctx;
    const tc = context.thumbCompose;
    if (!tc?.active) return;

    const isPhoto = ctx.message?.photo && ctx.message.photo.length > 0;
    const isDocument = ctx.message?.document != null;
    const isTextMessage = !isPhoto && !isDocument && ctx.text;

    if (isTextMessage) {
        // Parse numbered fields from text
        const parsed = parseThumbFields(ctx.text);
        if (parsed.title !== undefined) tc.title = parsed.title;
        if (parsed.color !== undefined) tc.color = parsed.color;
        if (parsed.icons !== undefined) tc.icons = parsed.icons;
    } else if (isPhoto) {
        // Store largest photo variant
        const photos = ctx.message!.photo!;
        const largestPhoto = photos[photos.length - 1];
        const mediaKey = await storeUserMedia(env, chatId, ctx.message!.message_id, largestPhoto.file_id);
        if (mediaKey) {
            tc.imageKey = mediaKey;
        }
        // Also parse caption if present
        if (ctx.message!.caption) {
            const parsed = parseThumbFields(ctx.message!.caption);
            if (parsed.title !== undefined) tc.title = parsed.title;
            if (parsed.color !== undefined) tc.color = parsed.color;
            if (parsed.icons !== undefined) tc.icons = parsed.icons;
        }
    } else if (isDocument) {
        // Store document if it's an image
        const doc = ctx.message!.document!;
        const mediaKey = await storeUserDocument(env, chatId, ctx.message!.message_id, doc.file_id, doc.mime_type);
        if (mediaKey) {
            tc.imageKey = mediaKey;
        }
        // Also parse caption if present
        if (ctx.message!.caption) {
            const parsed = parseThumbFields(ctx.message!.caption);
            if (parsed.title !== undefined) tc.title = parsed.title;
            if (parsed.color !== undefined) tc.color = parsed.color;
            if (parsed.icons !== undefined) tc.icons = parsed.icons;
        }
    }

    // Update state
    await updateChatState(env, chatId, {
        context: { ...context, thumbCompose: tc },
    });

    // Re-render status message
    if (tc.statusMessageId) {
        const view = renderThumbCompose(tc, lang);
        try {
            await editMessage(env, chatId, tc.statusMessageId, view.text, view.keyboard);
        } catch {
            // Status message may have been deleted
        }
    }
}
