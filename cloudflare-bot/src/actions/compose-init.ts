/**
 * Shared compose mode initialization — reusable entry point for handwrite, repost, and commit modes.
 */

import type { Env, ComposeState, ComposeSourceTweet, ComposeSourceCommit } from '../types';
import type { Lang } from '../ui/strings';
import { updateChatState, getCommitDefaults } from '../data/db';
import { sendMessage } from '../integrations/telegram';
import { renderCompose } from '../views';

export interface EnterComposeOptions {
    mode: 'handwrite' | 'repost' | 'commit';
    sourceTweet?: ComposeSourceTweet;
    sourceAccountId?: string;
    batchTweetId?: string;
    sourceCommit?: ComposeSourceCommit;
    eventId?: string;
    existingDraftId?: string;
    /** Override default AI toggle (handwrite defaults OFF, repost/commit defaults ON) */
    aiRefine?: boolean;
    imageGen?: boolean;
}

/**
 * Enter compose mode: sends the compose message and updates chat state.
 * Returns the message ID of the compose message.
 */
export async function enterComposeMode(
    env: Env,
    chatId: string,
    lang: Lang,
    options: EnterComposeOptions,
): Promise<number> {
    const { mode, sourceTweet, sourceAccountId, batchTweetId, sourceCommit, existingDraftId } = options;

    // For commit mode, read user's commit default settings (overridable by explicit options)
    let commitAiDefault = true;
    let commitImageDefault = true;
    if (mode === 'commit') {
        const commitDefaults = await getCommitDefaults(env, chatId);
        commitAiDefault = commitDefaults.commitFastAi;
        commitImageDefault = commitDefaults.commitFastImage;
    }

    // Mode-aware defaults: repost and commit default AI ON, handwrite OFF
    const aiRefine = options.aiRefine ?? (mode === 'repost' ? true : mode === 'commit' ? commitAiDefault : false);
    const imageGen = options.imageGen ?? (mode === 'commit' ? commitImageDefault : false);

    const view = renderCompose([], [], imageGen, aiRefine, lang, {
        sourceTweet,
        sourceCommit,
        existingDraftId,
    });

    const msgId = await sendMessage(env, chatId, view.text, view.keyboard);

    const compose: ComposeState = {
        mode,
        tweets: [],
        imageGen,
        aiRefine,
        analyzeImages: false,
        statusMessageId: msgId,
        sourceTweet,
        sourceAccountId,
        batchTweetId,
        sourceCommit,
        eventId: options.eventId,
    };

    await updateChatState(env, chatId, {
        current_view: 'compose',
        message_id: msgId,
        context: {
            awaiting_input: 'handwrite',
            compose,
        },
    });

    return msgId;
}
