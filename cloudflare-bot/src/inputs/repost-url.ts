/**
 * Repost URL Input Handler
 *
 * Parses tweet URL → fetches tweet + author → enters compose mode with source tweet.
 */

import type { HandlerContext, InputHandler } from '../core/router';
import type { ChatContext, ComposeSourceTweet } from '../types';
import type { Lang } from '../ui/strings';
import { t } from '../ui/strings';
import { getExistingRepostDraft, getTwitterAccounts } from '../data/db';
import { getRepostDefaults } from '../data/user-settings-db';
import { getTweetById } from '../integrations/x';
import { cancelRow } from '../ui/components';
import { sendMessage } from '../integrations/telegram';
import { enterComposeMode } from '../actions/compose-init';

/** Parse a tweet URL and extract username + tweet ID */
function parseTweetUrl(text: string): { username: string; tweetId: string } | null {
    // Match x.com or twitter.com URLs
    const match = text.match(
        /(?:https?:\/\/)?(?:www\.)?(?:x\.com|twitter\.com)\/([a-zA-Z0-9_]+)\/status\/(\d+)/
    );
    if (match) {
        return { username: match[1], tweetId: match[2] };
    }
    return null;
}

export const repostUrlInput: InputHandler = async (
    ctx: HandlerContext & { text: string; context: ChatContext }
) => {
    const { env, chatId, text: input } = ctx;
    const lang = ((ctx as any).lang || 'en') as Lang;

    const parsed = parseTweetUrl(input.trim());
    if (!parsed) {
        await sendMessage(env, chatId,
            `${t(lang, 'repostInput.invalidTweetUrl')}\n\n${t(lang, 'repostInput.invalidTweetUrlMsg')}\n\n${t(lang, 'repost.supportedFormats')}\n<code>https://x.com/username/status/123456</code>\n<code>https://twitter.com/username/status/123456</code>\n\nTry again:`,
            [cancelRow('view:home', lang)]
        );
        return;
    }

    const { username, tweetId } = parsed;

    // Fetch the tweet
    let result;
    try {
        result = await getTweetById(env, tweetId);
    } catch (fetchError) {
        const msg = fetchError instanceof Error ? fetchError.message : '';
        if (msg === 'rate_limit') {
            await sendMessage(env, chatId,
                `${t(lang, 'repostInput.tweetNotFound')}\n\n${t(lang, 'repostInput.rateLimited')}`,
                [cancelRow('view:home', lang)]
            );
        } else if (msg === 'credits_depleted') {
            await sendMessage(env, chatId,
                `${t(lang, 'repostInput.tweetNotFound')}\n\n${t(lang, 'repostInput.creditsDepleted')}`,
                [cancelRow('view:home', lang)]
            );
        } else {
            await sendMessage(env, chatId,
                `${t(lang, 'repostInput.tweetNotFound')}\n\n${t(lang, 'repostInput.tweetNotFoundMsg').replace('{tweetId}', tweetId).replace('{username}', username)}`,
                [cancelRow('view:home', lang)]
            );
        }
        return;
    }
    if (!result) {
        await sendMessage(env, chatId,
            `${t(lang, 'repostInput.tweetNotFound')}\n\n${t(lang, 'repostInput.tweetNotFoundMsg').replace('{tweetId}', tweetId).replace('{username}', username)}`,
            [cancelRow('view:home', lang)]
        );
        return;
    }

    const { tweet, author, media } = result;

    // Extract first photo URL (skip videos/gifs)
    const photoMedia = media?.find(m => m.type === 'photo');
    const mediaUrl = photoMedia?.url || undefined;

    // Collect all media URLs from the initial tweet
    const allMediaUrls: string[] = [];
    if (media) {
        for (const m of media) {
            const url = m.type === 'photo' ? m.url : m.preview_image_url;
            if (url) allMediaUrls.push(url);
        }
    }

    // Check for duplicates
    const existingDraft = await getExistingRepostDraft(env, chatId, tweetId);

    // Check if we follow this account
    const accounts = await getTwitterAccounts(env, chatId);
    const followedAccount = accounts.find(
        a => a.username.toLowerCase() === (author?.username || username).toLowerCase()
    );

    // Extract metrics
    const metrics = tweet.public_metrics ? {
        likes: tweet.public_metrics.like_count,
        retweets: tweet.public_metrics.retweet_count,
        quotes: tweet.public_metrics.quote_count,
        replies: tweet.public_metrics.reply_count,
    } : undefined;

    // Build source tweet for compose mode
    // Thread fetch is deferred — user can toggle it ON in compose mode
    const tweetUrl = `https://x.com/${author?.username || username}/status/${tweetId}`;
    const sourceTweet: ComposeSourceTweet = {
        tweetId,
        username: author?.username || username,
        displayName: author?.name,
        text: tweet.text,
        mediaUrl,
        mediaUrls: allMediaUrls.length > 0 ? allMediaUrls : undefined,
        isThread: false,
        metrics,
        tweetUrl,
    };

    // Read user's repost defaults to initialize compose toggles
    const defaults = await getRepostDefaults(env, chatId);

    // Enter compose mode directly (replaces old repost_preview flow)
    await enterComposeMode(env, chatId, lang, {
        mode: 'repost',
        sourceTweet,
        sourceAccountId: followedAccount?.id,
        existingDraftId: existingDraft?.id,
        imageGen: defaults.fastGenerateImage,
    });
};
