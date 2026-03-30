/**
 * Thumbnail compose action handler
 *
 * Handles all `thumb:` callback prefixes: ratio toggle, pen down, cancel,
 * draft detail, full-res download, and delete.
 */

import type { HandlerContext } from '../core/router';
import type { Env, ViewResult, ThumbComposeState } from '../types';
import type { Lang } from '../ui/strings';
import { t } from '../ui/strings';
import { updateChatState, getChatState, parseContext } from '../data/db';
import { getThumbDraft, deleteThumbDraft, countThumbDrafts, getThumbDrafts } from '../data/thumb-db';
import { sendMessage, sendPhoto, sendDocument, editMessage, deleteMessage, answerCallback } from '../integrations/telegram';
import { getPrompt } from '../ai/prompts';
import { logInfo, logError } from '../infra/security';
import { renderThumbCompose, renderThumbDraftCaption, renderThumbDraftButtons, renderThumbDeleteConfirm } from '../views/thumb';
import { homeButton, backButton } from '../ui/components';

const GEMINI_API = 'https://generativelanguage.googleapis.com/v1beta';
const GEMINI_IMAGE_MODEL = 'gemini-3-pro-image-preview';

/**
 * Enter thumbnail compose mode: sends initial status message, sets state
 */
export async function enterThumbCompose(env: Env, chatId: string, lang: Lang): Promise<void> {
    const state: ThumbComposeState = {
        active: true,
        ratio: '16:9',
        statusMessageId: 0,
    };

    const view = renderThumbCompose(state, lang);
    const msgId = await sendMessage(env, chatId, view.text, view.keyboard);
    state.statusMessageId = msgId;

    await updateChatState(env, chatId, {
        current_view: 'thumb_compose',
        message_id: msgId,
        context: { thumbCompose: state },
    });
}

/**
 * Main callback handler for `thumb:` prefix
 */
export async function thumbAction(
    ctx: HandlerContext & { value: string; extra?: string },
): Promise<ViewResult | void> {
    const { env, chatId, value, extra } = ctx;
    const lang = (ctx.lang || 'en') as Lang;

    switch (value) {
        case 'ratio': {
            const newRatio = extra === '9x16' ? '9:16' : '16:9';
            const state = await getChatState(env, chatId);
            const context = parseContext(state);
            const tc = context.thumbCompose;
            if (!tc?.active) return;

            tc.ratio = newRatio;
            await updateChatState(env, chatId, { context: { ...context, thumbCompose: tc } });

            const view = renderThumbCompose(tc, lang);
            try {
                await editMessage(env, chatId, tc.statusMessageId, view.text, view.keyboard);
            } catch { /* message may be gone */ }
            return;
        }

        case 'pendown': {
            const state = await getChatState(env, chatId);
            const context = parseContext(state);
            const tc = context.thumbCompose;
            if (!tc?.active) return;

            await handleThumbPenDown(env, chatId, tc, lang, ctx.callbackId);
            return;
        }

        case 'cancel': {
            await updateChatState(env, chatId, { current_view: 'home', context: null });
            const { renderHome } = await import('../views');
            return renderHome(env, chatId, lang);
        }

        case 'detail': {
            const thumbId = extra || '';
            await handleThumbDetail(env, chatId, thumbId, lang);
            return;
        }

        case 'fullres': {
            const thumbId = extra || '';
            await handleThumbFullRes(env, chatId, thumbId, lang);
            return;
        }

        case 'delete': {
            const thumbId = extra || '';
            const draft = await getThumbDraft(env, thumbId, chatId);
            if (!draft) return;
            const view = renderThumbDeleteConfirm(thumbId, draft.title, lang);
            return view;
        }

        case 'confirm_delete': {
            const thumbId = extra || '';
            const draft = await getThumbDraft(env, thumbId, chatId);
            if (draft) {
                // Clean up R2 images
                if (draft.source_image_key) {
                    try { await env.IMAGES.delete(draft.source_image_key); } catch { /* ignore */ }
                }
                if (draft.result_image_key) {
                    try { await env.IMAGES.delete(draft.result_image_key); } catch { /* ignore */ }
                }
                await deleteThumbDraft(env, thumbId, chatId);
            }
            // Navigate back to thumb drafts list
            const { renderThumbDraftsList } = await import('../views/thumb-drafts');
            return renderThumbDraftsList(env, chatId, 0, lang);
        }

        case 'list': {
            const page = parseInt(extra || '0', 10);
            const { renderThumbDraftsList } = await import('../views/thumb-drafts');
            return renderThumbDraftsList(env, chatId, page, lang);
        }

        default:
            return;
    }
}

/**
 * Handle pen down — validate, compose prompt, call Gemini, save result
 */
async function handleThumbPenDown(
    env: Env,
    chatId: string,
    tc: ThumbComposeState,
    lang: Lang,
    callbackId?: string,
): Promise<void> {
    // Validate all fields
    const missing: string[] = [];
    if (!tc.title) missing.push(t(lang, 'thumb.labelTitle'));
    if (!tc.color) missing.push(t(lang, 'thumb.labelColor'));
    if (!tc.icons) missing.push(t(lang, 'thumb.labelIcons'));
    if (!tc.imageKey) missing.push(t(lang, 'thumb.labelImage'));

    if (missing.length > 0) {
        if (callbackId) {
            await answerCallback(env, callbackId, `${t(lang, 'thumb.missing')}: ${missing.join(', ')}`);
        }
        return;
    }

    // Send a NEW "generating" message (keep compose status message as-is)
    const generatingMsgId = await sendMessage(env, chatId, t(lang, 'thumb.generating'), []);

    try {
        // 1. Load thumbnail skill prompt (always English — it's an image model prompt)
        const promptTemplate = await getPrompt(env, chatId, 'thumbnail', 'en');

        // 2. Replace placeholders
        const finalPrompt = promptTemplate
            .replace(/\[TITLE\]/g, tc.title!)
            .replace(/\[GLOW_COLOR\]/g, tc.color!)
            .replace(/\[ICONS\]/g, tc.icons!)
            .replace(/\[ASPECT\]/g, tc.ratio);

        // 3. Fetch source image from R2 and base64 encode
        const imageObj = await env.IMAGES.get(tc.imageKey!);
        if (!imageObj) {
            await sendMessage(env, chatId, t(lang, 'thumb.imageNotFound'), [[homeButton(lang)]]);
            await updateChatState(env, chatId, { current_view: 'home', context: null });
            return;
        }
        const buffer = await imageObj.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.length; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        const base64 = btoa(binary);
        let mimeType = imageObj.httpMetadata?.contentType || 'image/jpeg';
        // Telegram often returns application/octet-stream for photos — fix to image/jpeg
        if (mimeType === 'application/octet-stream') mimeType = 'image/jpeg';

        // 4. Call Gemini image model with prompt + image
        logInfo('Generating thumbnail, prompt length:', finalPrompt.length);
        const url = `${GEMINI_API}/models/${GEMINI_IMAGE_MODEL}:generateContent?key=${env.GOOGLE_API_KEY}`;
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{
                    parts: [
                        { text: finalPrompt },
                        { inline_data: { mime_type: mimeType, data: base64 } },
                    ],
                }],
                generationConfig: {
                    responseModalities: ['IMAGE', 'TEXT'],
                },
            }),
        });

        if (!response.ok) {
            const errText = await response.text();
            logError('Gemini thumbnail generation failed:', response.status, errText.substring(0, 500));
            const detail = errText.substring(0, 300).replace(/</g, '&lt;').replace(/>/g, '&gt;');
            await sendMessage(env, chatId, `${t(lang, 'thumb.generationFailed')}\n\n<code>${response.status}: ${detail}</code>`, [[homeButton(lang)]]);
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

        const parts = result.candidates?.[0]?.content?.parts || [];
        const imagePart = parts.find(p => p.inlineData);

        if (!imagePart?.inlineData) {
            const textParts = parts.filter(p => p.text).map(p => p.text).join(' ');
            logError('No image data in Gemini thumbnail response. Text parts:', textParts.substring(0, 300));
            const detail = textParts ? textParts.substring(0, 300).replace(/</g, '&lt;').replace(/>/g, '&gt;') : 'No image in response';
            await sendMessage(env, chatId, `${t(lang, 'thumb.generationFailed')}\n\n<code>${detail}</code>`, [[homeButton(lang)]]);
            return;
        }

        // 5. Decode and store result in R2
        const thumbId = crypto.randomUUID();
        const resultBinaryStr = atob(imagePart.inlineData.data);
        const resultBytes = new Uint8Array(resultBinaryStr.length);
        for (let i = 0; i < resultBinaryStr.length; i++) {
            resultBytes[i] = resultBinaryStr.charCodeAt(i);
        }
        const resultMime = imagePart.inlineData.mimeType;
        const ext = resultMime.includes('png') ? 'png' : 'jpg';
        const resultKey = `thumbs/${chatId}/${thumbId}/result.${ext}`;

        await env.IMAGES.put(resultKey, resultBytes.buffer, {
            httpMetadata: { contentType: resultMime },
        });
        logInfo('Thumbnail stored in R2:', resultKey);

        // 6. Save thumb draft to D1
        const { createThumbDraft } = await import('../data/thumb-db');
        const savedThumbId = await createThumbDraft(env, chatId, {
            title: tc.title!,
            color: tc.color!,
            icons: tc.icons!,
            ratio: tc.ratio,
            source_image_key: tc.imageKey!,
            result_image_key: resultKey,
        });

        // 7. Delete the "generating" message, then send result as draft detail
        try { await deleteMessage(env, chatId, generatingMsgId); } catch { /* ignore */ }

        const workerUrl = env.WORKER_URL || '';
        const imageUrl = `${workerUrl}/media/${resultKey}`;
        const caption = renderThumbDraftCaption(tc.title!, tc.color!, tc.icons!, tc.ratio, lang);
        const keyboard = renderThumbDraftButtons(savedThumbId, lang);

        await sendPhoto(env, chatId, imageUrl, caption, keyboard);

        // 8. Clear compose state
        await updateChatState(env, chatId, { current_view: 'home', context: null });

    } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        logError('Thumbnail pen down error:', errMsg);
        const detail = errMsg.substring(0, 300).replace(/</g, '&lt;').replace(/>/g, '&gt;');
        await sendMessage(env, chatId, `${t(lang, 'thumb.generationFailed')}\n\n<code>${detail}</code>`, [[homeButton(lang)]]);
    }
}

/**
 * Show thumb draft detail — sends photo with metadata caption
 */
async function handleThumbDetail(env: Env, chatId: string, thumbId: string, lang: Lang): Promise<void> {
    const draft = await getThumbDraft(env, thumbId, chatId);
    if (!draft) {
        await sendMessage(env, chatId, t(lang, 'thumb.notFound'), [[homeButton(lang)]]);
        return;
    }

    if (!draft.result_image_key) {
        await sendMessage(env, chatId, t(lang, 'thumb.imageNotFound'), [
            ...renderThumbDraftButtons(thumbId, lang),
        ]);
        return;
    }

    const workerUrl = env.WORKER_URL || '';
    const imageUrl = `${workerUrl}/media/${draft.result_image_key}`;
    const caption = renderThumbDraftCaption(draft.title, draft.color, draft.icons, draft.ratio, lang);
    const keyboard = renderThumbDraftButtons(thumbId, lang);

    await sendPhoto(env, chatId, imageUrl, caption, keyboard);
}

/**
 * Send full-resolution image as document
 */
async function handleThumbFullRes(env: Env, chatId: string, thumbId: string, lang: Lang): Promise<void> {
    const draft = await getThumbDraft(env, thumbId, chatId);
    if (!draft?.result_image_key) {
        await sendMessage(env, chatId, t(lang, 'thumb.imageNotFound'), [[homeButton(lang)]]);
        return;
    }

    const workerUrl = env.WORKER_URL || '';
    const documentUrl = `${workerUrl}/media/${draft.result_image_key}`;
    const caption = `🖼 ${draft.title}`;

    await sendDocument(env, chatId, documentUrl, caption);
}
