/**
 * Compose mode actions — pen down, toggles, cancel
 */

import type { HandlerContext } from '../core/router';
import type { ViewResult, DraftContent, HandwriteState } from '../types';
import type { Lang } from '../ui/strings';
import { t } from '../ui/strings';
import { getChatState, parseContext, updateChatState, createDraft, getTimezone } from '../data/db';
import { getUser } from '../data/user-db';
import { sendMessage, editMessage, deleteMessage, sendPhoto, sendMediaGroup } from '../integrations/telegram';
import { ensureImage } from '../data/storage';
import { renderCompose, renderDraftDetail } from '../views';
import { truncateHtml } from '../ui/utils';
import { renderHome } from '../views/home';
import { sanitizeError } from '../infra/security';

export async function composeAction(
    ctx: HandlerContext & { value: string; extra?: string }
): Promise<ViewResult | void> {
    const lang = (ctx.lang || 'en') as Lang;
    const { env, chatId, value } = ctx;
    const state = await getChatState(env, chatId);
    const context = parseContext(state);
    const handwrite = context.handwrite;

    switch (value) {
        case 'pendown':
            await handlePenDown(env, chatId, handwrite, lang);
            return; // void — handled sending ourselves
        case 'toggle_image':
            return handleToggle(env, chatId, context, handwrite, 'imageGen', lang);
        case 'toggle_ai': {
            // When turning AI off, also clear analyzeImages
            if (handwrite?.aiRefine) {
                handwrite.analyzeImages = false;
            }
            return handleToggle(env, chatId, context, handwrite, 'aiRefine', lang);
        }
        case 'toggle_analyze': {
            // When turning Analyze ON, auto-enable AI (images are sent to AI)
            if (handwrite && !handwrite.analyzeImages) {
                handwrite.aiRefine = true;
            }
            return handleToggle(env, chatId, context, handwrite, 'analyzeImages', lang);
        }
        case 'toggle_instruct':
            return handleInstruct(env, chatId, context, handwrite, lang);
        case 'cancel':
            await handleCancel(env, chatId, ctx.messageId, handwrite, lang);
            return; // void — handled sending ourselves
        default:
            return renderHome(env, chatId, lang);
    }
}

async function handlePenDown(
    env: import('../types').Env,
    chatId: string,
    handwrite: HandwriteState | undefined,
    lang: Lang = 'en'
): Promise<void> {
    const hasInstruction = !!(handwrite?.instruction && handwrite.aiRefine);
    const hasTweets = handwrite && handwrite.tweets.length > 0;

    // 8.2 Allow pen down with instruction + no tweets
    if (!handwrite || (!hasTweets && !hasInstruction)) {
        const view = renderCompose([], [], handwrite?.imageGen ?? false, handwrite?.aiRefine ?? false, lang);
        await sendMessage(env, chatId, view.text, view.keyboard);
        return;
    }

    // 8.3 Status message reflects instruction-based generation
    const statusText = hasInstruction && !hasTweets
        ? t(lang, 'compose.generatingFromInstruction')
        : handwrite.aiRefine && handwrite.imageGen
            ? '✨ Refining text & generating image...'
            : handwrite.aiRefine
                ? '✨ Refining with AI...'
                : handwrite.imageGen
                    ? '🖼 Generating image prompt...'
                    : '💾 Saving draft...';
    const statusMsgId = await sendMessage(env, chatId, statusText);

    // Collect all original media for re-attachment
    const allOriginalMedia = handwrite.tweets.flatMap(tw => tw.media || []);

    // Build DraftContent from buffer
    const tweets = handwrite.tweets.map((t, i) => ({
        text: t.text,
        index: i,
        media: t.media,
    }));

    let content: DraftContent = {
        format: tweets.length === 1 ? 'single' : (tweets.length === 0 ? 'single' : 'thread'),
        tweets,
    };

    // If AI refine or image gen is enabled, call Gemini
    if (handwrite.aiRefine || handwrite.imageGen) {
        try {
            const { refineHandwrittenContent, buildImageParts } = await import('../ai/gemini');

            // Build multimodal parts when analyzeImages is enabled — sent in the SAME API call
            let imageParts: import('../ai/gemini').ImagePart[] | undefined;
            if (handwrite.analyzeImages && allOriginalMedia.length > 0) {
                imageParts = await buildImageParts(env, content.tweets);
            }

            content = await refineHandwrittenContent(env, content, {
                refineText: handwrite.aiRefine,
                generateImagePrompt: handwrite.imageGen,
                instruction: handwrite.instruction,
                imageParts: imageParts?.length ? imageParts : undefined,
            }, lang, chatId);

            // Re-attach media: when AI changes tweet count, attach all to first tweet
            if (content.tweets.length === tweets.length) {
                content.tweets = content.tweets.map((t, i) => ({
                    ...t,
                    media: handwrite.tweets[i]?.media,
                }));
            } else if (allOriginalMedia.length > 0) {
                content.tweets = content.tweets.map((t, i) => ({
                    ...t,
                    media: i === 0 ? allOriginalMedia : undefined,
                }));
            }
        } catch (error) {
            console.error('AI refinement failed, using original:', error);
            // Continue with original content
        }
    }

    const firstTweet = content.tweets[0]?.text || 'Handwritten draft';
    const prTitle = firstTweet.length > 100 ? firstTweet.substring(0, 97) + '...' : firstTweet;

    // Get user's default publish targets
    const user = await getUser(env, chatId);
    const hasVideo = content.tweets.some(t => t.media?.some(m => m.type === 'video')) ? 1 : 0;

    let draftId: string;
    try {
        draftId = await createDraft(env, chatId, {
            pr_number: 0,
            pr_title: prTitle,
            commit_sha: '',
            content: JSON.stringify(content),
            source: 'handwrite',
            publish_targets: user?.default_publish_targets || undefined,
            has_video: hasVideo,
        });
    } catch (dbError) {
        console.error('createDraft failed:', dbError);
        throw dbError;
    }

    // Check for per-tweet media photos (user-attached images)
    const perTweetMediaUrls: string[] = [];
    if (env.WORKER_URL) {
        for (const tweet of content.tweets) {
            for (const media of tweet.media || []) {
                if (media.type === 'photo') {
                    perTweetMediaUrls.push(`${env.WORKER_URL}/media/${media.key}`);
                }
            }
        }
    }

    // Generate image if imageGen was toggled on (only when no per-tweet media)
    let imageUrl: string | null = null;
    if (perTweetMediaUrls.length > 0) {
        imageUrl = perTweetMediaUrls[0];
    } else if (content.imagePrompt) {
        await editMessage(env, chatId, statusMsgId, '🎨 Generating image...');
        try {
            const ensuredUrl = await ensureImage(env, chatId, { id: draftId, content: JSON.stringify(content) });
            if (ensuredUrl) {
                imageUrl = `${env.WORKER_URL}${ensuredUrl}`;
            }
        } catch (imgError) {
            console.error('Image generation failed:', sanitizeError(imgError));
        }
    }

    const tz = await getTimezone(env, chatId);
    const view = await renderDraftDetail(env, chatId, draftId, tz, lang);

    let finalMessageId: number;
    let albumMessageIds: number[] | undefined;

    if (imageUrl) {
        // Send album for additional images (2nd–10th)
        if (perTweetMediaUrls.length >= 2) {
            try {
                albumMessageIds = await sendMediaGroup(env, chatId, perTweetMediaUrls.slice(1, 10));
            } catch (albumError) {
                console.error('Album send failed:', sanitizeError(albumError));
            }
        }

        // Delete status message and send photo with draft detail
        try {
            await deleteMessage(env, chatId, statusMsgId);
        } catch { /* ignore */ }
        const caption = truncateHtml(view.text, 1024);
        finalMessageId = await sendPhoto(env, chatId, imageUrl, caption, view.keyboard);
    } else {
        // No image — edit status message with draft detail
        await editMessage(env, chatId, statusMsgId, view.text, view.keyboard);
        finalMessageId = statusMsgId;
    }

    // Clear compose state and set draft view
    await updateChatState(env, chatId, {
        message_id: finalMessageId,
        current_view: 'draft',
        context: { selected_draft_id: draftId, album_message_ids: albumMessageIds },
    });
}

async function handleToggle(
    env: import('../types').Env,
    chatId: string,
    context: import('../types').ChatContext,
    handwrite: HandwriteState | undefined,
    field: 'imageGen' | 'aiRefine' | 'analyzeImages',
    lang: Lang = 'en'
): Promise<ViewResult> {
    if (!handwrite) {
        return renderHome(env, chatId, lang);
    }

    handwrite[field] = !handwrite[field];

    await updateChatState(env, chatId, {
        context: {
            ...context,
            handwrite,
        },
    });

    return buildComposeView(handwrite, lang);
}

async function handleInstruct(
    env: import('../types').Env,
    chatId: string,
    context: import('../types').ChatContext,
    handwrite: HandwriteState | undefined,
    lang: Lang = 'en'
): Promise<ViewResult> {
    if (!handwrite) {
        return renderHome(env, chatId, lang);
    }

    handwrite.awaitingInstruction = true;
    handwrite.aiRefine = true; // auto-enable AI when instructing

    await updateChatState(env, chatId, {
        context: {
            ...context,
            handwrite,
        },
    });

    const view = buildComposeView(handwrite, lang);
    view.toast = t(lang, 'compose.instructToast');
    return view;
}

function buildComposeView(handwrite: HandwriteState, lang: Lang): ViewResult {
    const charWarnings: number[] = [];
    const composeTweets = handwrite.tweets.map((t, i) => {
        if (t.text.length > 280) charWarnings.push(i + 1);
        return { text: t.text, mediaCount: t.media?.length || 0 };
    });

    return renderCompose(composeTweets, charWarnings, handwrite.imageGen, handwrite.aiRefine, lang, {
        instruction: handwrite.instruction,
        awaitingInstruction: handwrite.awaitingInstruction,
        analyzeImages: handwrite.analyzeImages,
    });
}

async function handleCancel(
    env: import('../types').Env,
    chatId: string,
    messageId: number | undefined,
    handwrite: HandwriteState | undefined,
    lang: Lang = 'en'
): Promise<void> {
    const view = await renderHome(env, chatId, lang);
    const hadTweets = handwrite && handwrite.tweets.length > 0;

    if (hadTweets) {
        // User sent messages — send new message to continue conversation flow
        const newMsgId = await sendMessage(env, chatId, view.text, view.keyboard);
        await updateChatState(env, chatId, {
            message_id: newMsgId,
            current_view: 'home',
            context: null,
        });
    } else {
        // No messages sent — edit the compose message in place
        if (messageId) {
            await editMessage(env, chatId, messageId, view.text, view.keyboard);
        }
        await updateChatState(env, chatId, {
            current_view: 'home',
            context: null,
        });
    }
}
