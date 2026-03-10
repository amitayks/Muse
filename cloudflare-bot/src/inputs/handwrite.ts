/**
 * Handwrite input handler — buffers user messages as tweets during compose mode
 */

import type { HandlerContext } from '../core/router';
import type { ChatContext, HandwriteState, HandwriteTweet } from '../types';
import type { Lang } from '../ui/strings';
import { updateChatState, getChatState, parseContext } from '../data/db';
import { editMessage } from '../integrations/telegram';
import { storeUserMedia } from '../data/storage';
import { renderCompose } from '../views';

interface HandwriteInputContext extends HandlerContext {
    text: string;
    context: ChatContext;
    message?: {
        message_id: number;
        photo?: Array<{ file_id: string; file_size?: number }>;
        caption?: string;
        media_group_id?: string;
    };
    isEdit?: boolean;
}

export async function handwriteInput(ctx: HandwriteInputContext): Promise<void> {
    const { env, chatId, context } = ctx;
    const lang = ((ctx as any).lang || 'en') as Lang;
    const handwrite = context.handwrite;

    if (!handwrite) {
        // No handwrite state, clear and go home
        await updateChatState(env, chatId, { context: null });
        return;
    }

    const messageId = ctx.message?.message_id || 0;

    const isPhoto = ctx.message?.photo && ctx.message.photo.length > 0;
    const isTextMessage = !isPhoto && ctx.text;

    if (ctx.isEdit) {
        // 5.3 Instruction edit detection: update instruction if the edited message is the instruction
        if (isTextMessage && messageId === handwrite.instructionMessageId) {
            handwrite.instruction = ctx.text;
        } else {
            // Edit existing tweet in buffer
            const tweetIndex = handwrite.tweets.findIndex(t => t.messageId === messageId);
            if (tweetIndex >= 0) {
                handwrite.tweets[tweetIndex].text = ctx.text;
                // Handle photo added/changed via edit — only add if image actually changed
                if (isPhoto) {
                    const largestPhoto = ctx.message!.photo![ctx.message!.photo!.length - 1];
                    const mediaKey = await storeUserMedia(env, chatId, messageId, largestPhoto.file_id);
                    if (mediaKey) {
                        const existing = handwrite.tweets[tweetIndex].media || [];
                        // Replace if same key exists (same message, re-uploaded), otherwise add
                        const existingIdx = existing.findIndex(m => m.key === mediaKey);
                        if (existingIdx >= 0) {
                            existing[existingIdx] = { key: mediaKey, type: 'photo' };
                        } else {
                            existing.push({ key: mediaKey, type: 'photo' });
                        }
                        handwrite.tweets[tweetIndex].media = existing;
                    }
                    if (ctx.message!.caption) {
                        handwrite.tweets[tweetIndex].text = ctx.message!.caption;
                    }
                }
            }
        }
        // If not found, ignore (edit for message we don't track)
    } else if (handwrite.awaitingInstruction && isTextMessage) {
        // 5.1 Instruction capture: store text as instruction, not as a tweet
        handwrite.instruction = ctx.text;
        handwrite.instructionMessageId = messageId;
        handwrite.awaitingInstruction = false;
        handwrite.aiRefine = true; // auto-enable AI — guards edge case where user toggled AI off between Instruct click and typing
    } else if (handwrite.awaitingInstruction && isPhoto) {
        // 5.2 Photo during awaiting: treat as regular tweet, clear awaiting
        handwrite.awaitingInstruction = false;
        // Fall through to photo handling below
        await handleNewPhoto(env, chatId, messageId, ctx, handwrite);
    } else if (isPhoto) {
        // Handle photo attachment
        await handleNewPhoto(env, chatId, messageId, ctx, handwrite);
    } else {
        // Text-only message — buffer as a new tweet
        handwrite.tweets.push({
            messageId,
            text: ctx.text,
        });
    }

    // Build tweet previews and character warnings
    const charWarnings: number[] = [];
    const composeTweets = handwrite.tweets.map((t, i) => {
        if (t.text.length > 280) charWarnings.push(i + 1);
        return { text: t.text, mediaCount: t.media?.length || 0 };
    });

    // Update state
    await updateChatState(env, chatId, {
        context: {
            ...context,
            handwrite,
        },
    });

    // 5.5 Update the status message with live preview, passing instruction flags
    const state = await getChatState(env, chatId);
    const statusMessageId = handwrite.statusMessageId || state.message_id;

    if (statusMessageId) {
        const view = renderCompose(composeTweets, charWarnings, handwrite.imageGen, handwrite.aiRefine, lang, {
            instruction: handwrite.instruction,
            awaitingInstruction: handwrite.awaitingInstruction,
            analyzeImages: handwrite.analyzeImages,
        });
        try {
            await editMessage(env, chatId, statusMessageId, view.text, view.keyboard);
        } catch {
            // Status message may have been deleted, ignore
        }
    }
}

/** Handle new photo attachment — extracted for reuse in awaiting-instruction + normal paths */
async function handleNewPhoto(
    env: import('../types').Env,
    chatId: string,
    messageId: number,
    ctx: HandwriteInputContext,
    handwrite: HandwriteState,
): Promise<void> {
    const largestPhoto = ctx.message!.photo![ctx.message!.photo!.length - 1];
    const mediaKey = await storeUserMedia(env, chatId, messageId, largestPhoto.file_id);
    const mediaGroupId = ctx.message!.media_group_id;

    // 5.4 Auto-disable imageGen when first photo is attached
    if (handwrite.imageGen) {
        handwrite.imageGen = false;
    }

    // Check if this photo belongs to the same group as the last tweet
    const lastTweet = handwrite.tweets[handwrite.tweets.length - 1];
    if (mediaGroupId && lastTweet?.mediaGroupId === mediaGroupId) {
        // Append to existing tweet's media array
        if (mediaKey) {
            lastTweet.media = lastTweet.media || [];
            lastTweet.media.push({ key: mediaKey, type: 'photo' });
        }
    } else {
        // New tweet (new group or single photo)
        const tweet: HandwriteTweet = {
            messageId,
            text: ctx.message!.caption || '',
            mediaGroupId,
        };
        if (mediaKey) {
            tweet.media = [{ key: mediaKey, type: 'photo' }];
        }
        handwrite.tweets.push(tweet);
    }
}
