/**
 * Image create compose action handler
 *
 * Handles all `imgcreate:` callback prefixes: pen down, cancel,
 * draft detail, full-res download, and delete.
 */

import type { HandlerContext } from '../core/router';
import type { Env, ViewResult, ImageComposeState } from '../types';
import type { Lang } from '../ui/strings';
import { t } from '../ui/strings';
import { updateChatState, getChatState, parseContext } from '../data/db';
import { getImageDraft, deleteImageDraft } from '../data/image-create-db';
import { sendMessage, sendPhotoBuffer, sendDocumentBuffer, editMessage, deleteMessage, answerCallback } from '../integrations/telegram';
import { logInfo, logError } from '../infra/security';
import { renderImageCompose, renderImageDraftCaption, renderImageDraftButtons, renderImageDeleteConfirm } from '../views/image-create';
import { homeButton } from '../ui/components';
import { generateGeminiImage, GeminiImageError, type GeminiImageResult } from '../ai/gemini';

/**
 * Enter image create compose mode: sends initial status message, sets state
 */
export async function enterImageCompose(env: Env, chatId: string, lang: Lang): Promise<void> {
    const state: ImageComposeState = {
        active: true,
        segments: [],
        images: [],
        statusMessageId: 0,
    };

    const view = renderImageCompose(state, lang);
    const msgId = await sendMessage(env, chatId, view.text, view.keyboard);
    state.statusMessageId = msgId;

    await updateChatState(env, chatId, {
        current_view: 'image_compose',
        message_id: msgId,
        context: { imageCompose: state },
    });
}

/**
 * Main callback handler for `imgcreate:` prefix
 */
export async function imageCreateAction(
    ctx: HandlerContext & { value: string; extra?: string },
): Promise<ViewResult | void> {
    const { env, chatId, value, extra } = ctx;
    const lang = (ctx.lang || 'en') as Lang;

    switch (value) {
        case 'pendown': {
            const state = await getChatState(env, chatId);
            const context = parseContext(state);
            const ic = context.imageCompose;
            if (!ic?.active) return;

            await handleImagePenDown(env, chatId, ic, lang, ctx.callbackId);
            return;
        }

        case 'cancel': {
            await updateChatState(env, chatId, { current_view: 'home', context: null });
            const { renderHome } = await import('../views');
            return renderHome(env, chatId, lang);
        }

        case 'detail': {
            const imageId = extra || '';
            await handleImageDetail(env, chatId, imageId, lang);
            return;
        }

        case 'fullres': {
            const imageId = extra || '';
            await handleImageFullRes(env, chatId, imageId, lang);
            return;
        }

        case 'delete': {
            const imageId = extra || '';
            const draft = await getImageDraft(env, imageId, chatId);
            if (!draft) return;
            const view = renderImageDeleteConfirm(imageId, draft.prompt, lang);
            return view;
        }

        case 'confirm_delete': {
            const imageId = extra || '';
            const draft = await getImageDraft(env, imageId, chatId);
            if (draft) {
                // Clean up R2 images — every source image plus the result.
                // Prefer the multi-image JSON column; fall back to the legacy single key.
                const sourceKeys: string[] = [];
                if (draft.source_image_keys) {
                    try {
                        const parsed = JSON.parse(draft.source_image_keys);
                        if (Array.isArray(parsed)) {
                            sourceKeys.push(...parsed.filter((k): k is string => typeof k === 'string'));
                        }
                    } catch { /* malformed JSON — fall through to legacy key */ }
                }
                if (sourceKeys.length === 0 && draft.source_image_key) {
                    sourceKeys.push(draft.source_image_key);
                }
                for (const key of sourceKeys) {
                    try { await env.IMAGES.delete(key); } catch { /* ignore */ }
                }
                if (draft.result_image_key) {
                    try { await env.IMAGES.delete(draft.result_image_key); } catch { /* ignore */ }
                }
                await deleteImageDraft(env, imageId, chatId);
            }
            // Navigate back to image drafts list
            const { renderImageDraftsList } = await import('../views/image-create-drafts');
            return renderImageDraftsList(env, chatId, 0, lang);
        }

        case 'list': {
            const page = parseInt(extra || '0', 10);
            const { renderImageDraftsList } = await import('../views/image-create-drafts');
            return renderImageDraftsList(env, chatId, page, lang);
        }

        default:
            return;
    }
}

/**
 * Handle pen down — validate, call Gemini (with or without image), save result
 */
async function handleImagePenDown(
    env: Env,
    chatId: string,
    ic: ImageComposeState,
    lang: Lang,
    callbackId?: string,
): Promise<void> {
    // Normalize state (tolerate legacy single-slot shape) and validate at least one segment exists
    const segments = ic.segments ?? (ic.prompt ? [{ messageId: 0, text: ic.prompt }] : []);
    const images = ic.images ?? (ic.imageKey ? [{ messageId: 0, key: ic.imageKey }] : []);
    if (segments.length === 0) {
        if (callbackId) {
            await answerCallback(env, callbackId, t(lang, 'imgcreate.missingPrompt'));
        }
        return;
    }

    // Combine all segments into a single prompt (single-space join, in order received)
    const combinedPrompt = segments.map(s => s.text).join(' ');
    const sourceKeys = images.map(img => img.key);

    // Send a "generating" message
    const generatingMsgId = await sendMessage(env, chatId, t(lang, 'imgcreate.generating'), []);

    try {
        // Build Gemini request parts: combined text first, then one inline_data per reference image
        const parts: Array<{ text: string } | { inline_data: { mime_type: string; data: string } }> = [
            { text: combinedPrompt },
        ];
        for (const img of images) {
            const part = await encodeImagePart(env, img.key);
            if (part) parts.push(part);
        }

        // Generate via the resilient shared helper (retry + 4K→2K fallback + final-image extraction)
        logInfo('Generating image, prompt length:', combinedPrompt.length, 'images:', images.length);
        let image: GeminiImageResult;
        try {
            image = await generateGeminiImage(env, parts);
        } catch (genErr) {
            const status = genErr instanceof GeminiImageError ? genErr.status : undefined;
            const rawDetail = genErr instanceof GeminiImageError
                ? genErr.detail
                : (genErr instanceof Error ? genErr.message : String(genErr));
            logError('Gemini image generation failed:', status, rawDetail.substring(0, 200));
            const detail = rawDetail.substring(0, 300).replace(/</g, '&lt;').replace(/>/g, '&gt;');
            const prefix = status ? `${status}: ` : '';
            await sendMessage(env, chatId, `${t(lang, 'imgcreate.generationFailed')}\n\n<code>${prefix}${detail}</code>`, [[homeButton(lang)]]);
            return;
        }

        // Store result in R2
        const imageId = crypto.randomUUID();
        const resultBytes = image.data;
        const resultMime = image.mimeType;
        const ext = resultMime.includes('png') ? 'png' : 'jpg';
        const resultKey = `images/${chatId}/${imageId}/result.${ext}`;

        await env.IMAGES.put(resultKey, resultBytes.buffer, {
            httpMetadata: { contentType: resultMime },
        });
        logInfo('Image stored in R2:', resultKey);

        // Save image draft to D1
        const { createImageDraft } = await import('../data/image-create-db');
        const savedImageId = await createImageDraft(env, chatId, {
            prompt: combinedPrompt,
            source_image_key: sourceKeys[0] || null,
            source_image_keys: sourceKeys,
            result_image_key: resultKey,
        });

        // Delete the "generating" message, then send result via multipart upload
        try { await deleteMessage(env, chatId, generatingMsgId); } catch { /* ignore */ }

        const filename = `image.${ext}`;
        const caption = renderImageDraftCaption(combinedPrompt, lang);
        const keyboard = renderImageDraftButtons(savedImageId, lang);

        // Upload bytes directly to Telegram (no URL size limits)
        // Try photo (10MB limit, gives inline preview); fall back to document (50MB limit)
        try {
            await sendPhotoBuffer(env, chatId, resultBytes, filename, caption, keyboard);
        } catch {
            await sendDocumentBuffer(env, chatId, resultBytes, filename, caption, keyboard);
        }

        // Clear compose state
        await updateChatState(env, chatId, { current_view: 'home', context: null });

    } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        logError('Image pen down error:', errMsg);
        const detail = errMsg.substring(0, 300).replace(/</g, '&lt;').replace(/>/g, '&gt;');
        await sendMessage(env, chatId, `${t(lang, 'imgcreate.generationFailed')}\n\n<code>${detail}</code>`, [[homeButton(lang)]]);
    }
}

/**
 * Encode an R2 image as a Gemini `inline_data` part. Returns null if the object is missing.
 */
async function encodeImagePart(
    env: Env,
    key: string,
): Promise<{ inline_data: { mime_type: string; data: string } } | null> {
    const imageObj = await env.IMAGES.get(key);
    if (!imageObj) return null;
    const buffer = await imageObj.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    const base64 = btoa(binary);
    let mimeType = imageObj.httpMetadata?.contentType || 'image/jpeg';
    if (mimeType === 'application/octet-stream') mimeType = 'image/jpeg';
    return { inline_data: { mime_type: mimeType, data: base64 } };
}

/**
 * Fetch image bytes from R2 for multipart upload to Telegram
 */
async function fetchR2Image(env: Env, key: string): Promise<{ data: Uint8Array; filename: string } | null> {
    const obj = await env.IMAGES.get(key);
    if (!obj) return null;
    const mimeType = obj.httpMetadata?.contentType || 'image/jpeg';
    const ext = mimeType.includes('png') ? 'png' : 'jpg';
    const buffer = await obj.arrayBuffer();
    return { data: new Uint8Array(buffer), filename: `image.${ext}` };
}

/**
 * Show image draft detail — sends photo with prompt caption
 */
async function handleImageDetail(env: Env, chatId: string, imageId: string, lang: Lang): Promise<void> {
    const draft = await getImageDraft(env, imageId, chatId);
    if (!draft) {
        await sendMessage(env, chatId, t(lang, 'imgcreate.notFound'), [[homeButton(lang)]]);
        return;
    }

    if (!draft.result_image_key) {
        await sendMessage(env, chatId, t(lang, 'imgcreate.imageNotFound'), [
            ...renderImageDraftButtons(imageId, lang),
        ]);
        return;
    }

    const image = await fetchR2Image(env, draft.result_image_key);
    if (!image) {
        await sendMessage(env, chatId, t(lang, 'imgcreate.imageNotFound'), [[homeButton(lang)]]);
        return;
    }

    const caption = renderImageDraftCaption(draft.prompt, lang);
    const keyboard = renderImageDraftButtons(imageId, lang);

    try {
        await sendPhotoBuffer(env, chatId, image.data, image.filename, caption, keyboard);
    } catch {
        await sendDocumentBuffer(env, chatId, image.data, image.filename, caption, keyboard);
    }
}

/**
 * Send full-resolution image as document
 */
async function handleImageFullRes(env: Env, chatId: string, imageId: string, lang: Lang): Promise<void> {
    const draft = await getImageDraft(env, imageId, chatId);
    if (!draft?.result_image_key) {
        await sendMessage(env, chatId, t(lang, 'imgcreate.imageNotFound'), [[homeButton(lang)]]);
        return;
    }

    const image = await fetchR2Image(env, draft.result_image_key);
    if (!image) {
        await sendMessage(env, chatId, t(lang, 'imgcreate.imageNotFound'), [[homeButton(lang)]]);
        return;
    }

    const promptPreview = draft.prompt.length > 40 ? draft.prompt.substring(0, 37) + '...' : draft.prompt;
    const caption = `🎨 ${promptPreview}`;

    await sendDocumentBuffer(env, chatId, image.data, image.filename, caption);
}
