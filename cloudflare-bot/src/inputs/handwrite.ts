/**
 * Handwrite input handler — buffers user messages as tweets during compose mode
 */

import type { HandlerContext } from '../core/router';
import type { ChatContext, ComposeState, ComposeTweet } from '../types';
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
    const compose = context.compose;

    if (!compose) {
        // No compose state, clear and go home
        await updateChatState(env, chatId, { context: null });
        return;
    }

    const messageId = ctx.message?.message_id || 0;

    const isPhoto = ctx.message?.photo && ctx.message.photo.length > 0;
    const isTextMessage = !isPhoto && ctx.text;

    if (ctx.isEdit) {
        // Instruction edit detection: update instruction if the edited message is the instruction
        if (isTextMessage && messageId === compose.instructionMessageId) {
            compose.instruction = ctx.text;
        } else {
            // Edit existing tweet in buffer
            const tweetIndex = compose.tweets.findIndex(t => t.messageId === messageId);
            if (tweetIndex >= 0) {
                compose.tweets[tweetIndex].text = ctx.text;
                // Handle photo added/changed via edit — only add if image actually changed
                if (isPhoto) {
                    const largestPhoto = ctx.message!.photo![ctx.message!.photo!.length - 1];
                    const mediaKey = await storeUserMedia(env, chatId, messageId, largestPhoto.file_id);
                    if (mediaKey) {
                        const existing = compose.tweets[tweetIndex].media || [];
                        // Replace if same key exists (same message, re-uploaded), otherwise add
                        const existingIdx = existing.findIndex(m => m.key === mediaKey);
                        if (existingIdx >= 0) {
                            existing[existingIdx] = { key: mediaKey, type: 'photo' };
                        } else {
                            existing.push({ key: mediaKey, type: 'photo' });
                        }
                        compose.tweets[tweetIndex].media = existing;
                    }
                    if (ctx.message!.caption) {
                        compose.tweets[tweetIndex].text = ctx.message!.caption;
                    }
                }
            }
        }
        // If not found, ignore (edit for message we don't track)
    } else if (compose.awaitingInstruction && isTextMessage) {
        // Instruction capture: store text as instruction, not as a tweet
        compose.instruction = ctx.text;
        compose.instructionMessageId = messageId;
        compose.awaitingInstruction = false;
        compose.aiRefine = true; // auto-enable AI — guards edge case where user toggled AI off between Instruct click and typing
    } else if (compose.awaitingInstruction && isPhoto) {
        // Photo during awaiting: treat as regular tweet, clear awaiting
        compose.awaitingInstruction = false;
        // Fall through to photo handling below
        await handleNewPhoto(env, chatId, messageId, ctx, compose);
    } else if (isPhoto) {
        // Handle photo attachment
        await handleNewPhoto(env, chatId, messageId, ctx, compose);
    } else {
        // Text-only message — buffer as a new tweet
        compose.tweets.push({
            messageId,
            text: ctx.text,
        });
    }

    // Build tweet previews
    const composeTweets = compose.tweets.map((t) => {
        return { text: t.text, mediaCount: t.media?.length || 0 };
    });

    // Update state
    await updateChatState(env, chatId, {
        context: {
            ...context,
            compose,
        },
    });

    // Update the status message with live preview, passing instruction flags
    const state = await getChatState(env, chatId);
    const statusMessageId = compose.statusMessageId || state.message_id;

    if (statusMessageId) {
        const view = renderCompose(composeTweets, [], compose.imageGen, compose.aiRefine, lang, {
            instruction: compose.instruction,
            awaitingInstruction: compose.awaitingInstruction,
            analyzeImages: compose.analyzeImages,
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
    compose: ComposeState,
): Promise<void> {
    const largestPhoto = ctx.message!.photo![ctx.message!.photo!.length - 1];
    const mediaKey = await storeUserMedia(env, chatId, messageId, largestPhoto.file_id);
    const mediaGroupId = ctx.message!.media_group_id;

    // Auto-disable imageGen when first photo is attached
    if (compose.imageGen) {
        compose.imageGen = false;
    }

    // Check if this photo belongs to the same group as the last tweet
    const lastTweet = compose.tweets[compose.tweets.length - 1];
    if (mediaGroupId && lastTweet?.mediaGroupId === mediaGroupId) {
        // Append to existing tweet's media array
        if (mediaKey) {
            lastTweet.media = lastTweet.media || [];
            lastTweet.media.push({ key: mediaKey, type: 'photo' });
        }
    } else {
        // New tweet (new group or single photo)
        const tweet: ComposeTweet = {
            messageId,
            text: ctx.message!.caption || '',
            mediaGroupId,
        };
        if (mediaKey) {
            tweet.media = [{ key: mediaKey, type: 'photo' }];
        }
        compose.tweets.push(tweet);
    }
}
