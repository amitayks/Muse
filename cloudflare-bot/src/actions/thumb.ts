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
import { sendMessage, sendPhotoBuffer, sendDocumentBuffer, editMessage, deleteMessage, answerCallback } from '../integrations/telegram';
import { getPrompt } from '../ai/prompts';
import { logInfo, logError } from '../infra/security';
import { renderThumbCompose, renderThumbDraftCaption, renderThumbDraftButtons, renderThumbDeleteConfirm } from '../views/thumb';
import { homeButton, backButton } from '../ui/components';
import { generateGeminiImage, GeminiImageError, type GeminiImageResult } from '../ai/gemini';

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

        // 4. Generate via the resilient shared helper (retry + 4K→2K fallback + final-image extraction)
        logInfo('Generating thumbnail, prompt length:', finalPrompt.length);
        let image: GeminiImageResult;
        try {
            image = await generateGeminiImage(env, [
                { text: finalPrompt },
                { inline_data: { mime_type: mimeType, data: base64 } },
            ]);
        } catch (genErr) {
            const status = genErr instanceof GeminiImageError ? genErr.status : undefined;
            const rawDetail = genErr instanceof GeminiImageError
                ? genErr.detail
                : (genErr instanceof Error ? genErr.message : String(genErr));
            logError('Gemini thumbnail generation failed:', status, rawDetail.substring(0, 200));
            const detail = rawDetail.substring(0, 300).replace(/</g, '&lt;').replace(/>/g, '&gt;');
            const prefix = status ? `${status}: ` : '';
            await sendMessage(env, chatId, `${t(lang, 'thumb.generationFailed')}\n\n<code>${prefix}${detail}</code>`, [[homeButton(lang)]]);
            return;
        }

        // 5. Store result in R2
        const thumbId = crypto.randomUUID();
        const resultBytes = image.data;
        const resultMime = image.mimeType;
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

        // 7. Delete the "generating" message, then send result via multipart upload
        try { await deleteMessage(env, chatId, generatingMsgId); } catch { /* ignore */ }

        const filename = `thumbnail.${ext}`;
        const caption = renderThumbDraftCaption(tc.title!, tc.color!, tc.icons!, tc.ratio, lang);
        const keyboard = renderThumbDraftButtons(savedThumbId, lang);

        // Upload bytes directly to Telegram (no URL size limits)
        try {
            await sendPhotoBuffer(env, chatId, resultBytes, filename, caption, keyboard);
        } catch {
            await sendDocumentBuffer(env, chatId, resultBytes, filename, caption, keyboard);
        }

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
 * Fetch image bytes from R2 for multipart upload to Telegram
 */
async function fetchR2Image(env: Env, key: string): Promise<{ data: Uint8Array; filename: string } | null> {
    const obj = await env.IMAGES.get(key);
    if (!obj) return null;
    const mimeType = obj.httpMetadata?.contentType || 'image/jpeg';
    const ext = mimeType.includes('png') ? 'png' : 'jpg';
    const buffer = await obj.arrayBuffer();
    return { data: new Uint8Array(buffer), filename: `thumbnail.${ext}` };
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

    const image = await fetchR2Image(env, draft.result_image_key);
    if (!image) {
        await sendMessage(env, chatId, t(lang, 'thumb.imageNotFound'), [[homeButton(lang)]]);
        return;
    }

    const caption = renderThumbDraftCaption(draft.title, draft.color, draft.icons, draft.ratio, lang);
    const keyboard = renderThumbDraftButtons(thumbId, lang);

    try {
        await sendPhotoBuffer(env, chatId, image.data, image.filename, caption, keyboard);
    } catch {
        await sendDocumentBuffer(env, chatId, image.data, image.filename, caption, keyboard);
    }
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

    const image = await fetchR2Image(env, draft.result_image_key);
    if (!image) {
        await sendMessage(env, chatId, t(lang, 'thumb.imageNotFound'), [[homeButton(lang)]]);
        return;
    }

    const caption = `🖼 ${draft.title}`;
    await sendDocumentBuffer(env, chatId, image.data, image.filename, caption);
}
