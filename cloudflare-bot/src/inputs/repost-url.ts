/**
 * Repost URL Input Handler
 *
 * Parses tweet URL → fetches tweet + author → checks duplicates → shows preview.
 */

import type { HandlerContext, InputHandler } from '../core/router';
import type { ChatContext } from '../types';
import type { Lang } from '../ui/strings';
import { t } from '../ui/strings';
import { updateChatState, getExistingRepostDraft, getTwitterAccounts } from '../data/db';
import { getTweetById } from '../integrations/x';
import { cancelRow } from '../ui/components';
import { renderRepostPreview } from '../views/repost';
import { sendMessage } from '../integrations/telegram';

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
    const result = await getTweetById(env, tweetId);
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
    const mediaUrl = photoMedia?.url || null;

    // Check for thread
    const isThread = !!(tweet.conversation_id && tweet.referenced_tweets?.some(
        r => r.type === 'replied_to'
    ) && tweet.in_reply_to_user_id === tweet.author_id);

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

    // Store preview state in context
    await updateChatState(env, chatId, {
        current_view: 'repost_preview',
        context: {
            repost_preview: {
                tweet_id: tweetId,
                username: author?.username || username,
                tweet_text: tweet.text,
                author_name: author?.name || null,
                author_bio: author?.description || null,
                is_followed: !!followedAccount,
                user_id: author?.id || null,
                media_url: mediaUrl,
            },
        },
    });

    const view = renderRepostPreview({
        tweetId,
        username: author?.username || username,
        displayName: author?.name,
        tweetText: tweet.text,
        isThread,
        metrics,
        existingDraftId: existingDraft?.id,
        hasImage: !!mediaUrl,
    }, lang);

    await sendMessage(env, chatId, view.text, view.keyboard);
};
