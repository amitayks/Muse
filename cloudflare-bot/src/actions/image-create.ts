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

const GEMINI_API = 'https://generativelanguage.googleapis.com/v1beta';
const GEMINI_IMAGE_MODEL = 'gemini-3-pro-image-preview';

/**
 * Enter image create compose mode: sends initial status message, sets state
 */
export async function enterImageCompose(env: Env, chatId: string, lang: Lang): Promise<void> {
    const state: ImageComposeState = {
        active: true,
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
                // Clean up R2 images
                if (draft.source_image_key) {
                    try { await env.IMAGES.delete(draft.source_image_key); } catch { /* ignore */ }
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
    // Validate prompt is set
    if (!ic.prompt) {
        if (callbackId) {
            await answerCallback(env, callbackId, t(lang, 'imgcreate.missingPrompt'));
        }
        return;
    }

    // Send a "generating" message
    const generatingMsgId = await sendMessage(env, chatId, t(lang, 'imgcreate.generating'), []);

    try {
        // Build Gemini request parts
        const parts: Array<{ text: string } | { inline_data: { mime_type: string; data: string } }> = [
            { text: ic.prompt },
        ];

        // If reference image exists, add it
        if (ic.imageKey) {
            const imageObj = await env.IMAGES.get(ic.imageKey);
            if (imageObj) {
                const buffer = await imageObj.arrayBuffer();
                const bytes = new Uint8Array(buffer);
                let binary = '';
                for (let i = 0; i < bytes.length; i++) {
                    binary += String.fromCharCode(bytes[i]);
                }
                const base64 = btoa(binary);
                let mimeType = imageObj.httpMetadata?.contentType || 'image/jpeg';
                if (mimeType === 'application/octet-stream') mimeType = 'image/jpeg';
                parts.push({ inline_data: { mime_type: mimeType, data: base64 } });
            }
        }

        // Call Gemini image model
        logInfo('Generating image, prompt length:', ic.prompt.length);
        const url = `${GEMINI_API}/models/${GEMINI_IMAGE_MODEL}:generateContent?key=${env.GOOGLE_API_KEY}`;
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts }],
                generationConfig: {
                    responseModalities: ['IMAGE', 'TEXT'],
                    imageConfig: { imageSize: '4K' },
                },
            }),
        });

        if (!response.ok) {
            const errText = await response.text();
            logError('Gemini image generation failed:', response.status, errText.substring(0, 500));
            const detail = errText.substring(0, 300).replace(/</g, '&lt;').replace(/>/g, '&gt;');
            await sendMessage(env, chatId, `${t(lang, 'imgcreate.generationFailed')}\n\n<code>${response.status}: ${detail}</code>`, [[homeButton(lang)]]);
            return;
        }

        const result = await response.json() as {
            candidates?: [{
                content?: {
                    parts?: Array<{
                        text?: string;
                        inlineData?: { mimeType: string; data: string };
                    }>;
                };
            }];
        };

        const resultParts = result.candidates?.[0]?.content?.parts || [];
        const imagePart = resultParts.find(p => p.inlineData);

        if (!imagePart?.inlineData) {
            const textParts = resultParts.filter(p => p.text).map(p => p.text).join(' ');
            logError('No image data in Gemini response. Text parts:', textParts.substring(0, 300));
            const detail = textParts ? textParts.substring(0, 300).replace(/</g, '&lt;').replace(/>/g, '&gt;') : 'No image in response';
            await sendMessage(env, chatId, `${t(lang, 'imgcreate.generationFailed')}\n\n<code>${detail}</code>`, [[homeButton(lang)]]);
            return;
        }

        // Decode and store result in R2
        const imageId = crypto.randomUUID();
        const resultBinaryStr = atob(imagePart.inlineData.data);
        const resultBytes = new Uint8Array(resultBinaryStr.length);
        for (let i = 0; i < resultBinaryStr.length; i++) {
            resultBytes[i] = resultBinaryStr.charCodeAt(i);
        }
        const resultMime = imagePart.inlineData.mimeType;
        const ext = resultMime.includes('png') ? 'png' : 'jpg';
        const resultKey = `images/${chatId}/${imageId}/result.${ext}`;

        await env.IMAGES.put(resultKey, resultBytes.buffer, {
            httpMetadata: { contentType: resultMime },
        });
        logInfo('Image stored in R2:', resultKey);

        // Save image draft to D1
        const { createImageDraft } = await import('../data/image-create-db');
        const savedImageId = await createImageDraft(env, chatId, {
            prompt: ic.prompt,
            source_image_key: ic.imageKey || null,
            result_image_key: resultKey,
        });

        // Delete the "generating" message, then send result via multipart upload
        try { await deleteMessage(env, chatId, generatingMsgId); } catch { /* ignore */ }

        const filename = `image.${ext}`;
        const caption = renderImageDraftCaption(ic.prompt, lang);
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
