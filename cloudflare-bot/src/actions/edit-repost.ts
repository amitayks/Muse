/**
 * Edit Repost Action — Handler for action:edit_rp:TWEET_ID
 *
 * Called when user clicks [Edit] on a batch notification.
 * Opens compose mode with the tweet as source, allowing the user
 * to add their own tweets, images, and instructions before generating.
 */

import type { HandlerContext } from '../core/router';
import type { ViewResult, ComposeSourceTweet } from '../types';
import type { Lang } from '../ui/strings';
import { getTwitterTweet, getTwitterAccount, getExistingRepostDraft } from '../data/db';
import { getRepostDefaults } from '../data/user-settings-db';
import { getThreadContext } from '../data/twitter-db';
import { enterComposeMode } from './compose-init';
import { renderError } from '../views';

export async function editRepostAction(ctx: HandlerContext & { extra?: string }): Promise<ViewResult | void> {
    const lang = (ctx.lang || 'en') as Lang;
    const tweetId = ctx.extra!;

    const tweet = await getTwitterTweet(ctx.env, ctx.chatId, tweetId);
    if (!tweet) return renderError('Tweet not found.', lang);

    const account = await getTwitterAccount(ctx.env, tweet.account_id, ctx.chatId);

    // Build thread context from stored data if it's a thread
    let threadText: string | undefined;
    if (tweet.is_thread && tweet.conversation_id) {
        threadText = await getThreadContext(ctx.env, ctx.chatId, tweet.conversation_id, tweet.id);
    }

    // Check for existing draft
    const existingDraft = await getExistingRepostDraft(ctx.env, ctx.chatId, tweetId);

    // Extract metrics from stored JSON
    let metrics: ComposeSourceTweet['metrics'];
    if (tweet.metrics) {
        try {
            const parsed = JSON.parse(tweet.metrics);
            metrics = {
                likes: parsed.like_count || 0,
                retweets: parsed.retweet_count || 0,
                replies: parsed.reply_count || 0,
                quotes: parsed.quote_count || 0,
            };
        } catch { /* ignore malformed metrics */ }
    }

    const tweetUrl = tweet.tweet_url || `https://x.com/${tweet.author_username}/status/${tweet.id}`;
    const sourceTweet: ComposeSourceTweet = {
        tweetId: tweet.id,
        username: tweet.author_username,
        displayName: tweet.author_display_name || undefined,
        text: tweet.text,
        threadText,
        mediaUrl: tweet.media_url || undefined,
        isThread: tweet.is_thread === 1,
        metrics,
        tweetUrl,
        relevanceReason: tweet.relevance_reason,
    };

    // Read user's repost defaults to initialize compose toggles
    const defaults = await getRepostDefaults(ctx.env, ctx.chatId);

    // Enter compose mode (sends a new message)
    await enterComposeMode(ctx.env, ctx.chatId, lang, {
        mode: 'repost',
        sourceTweet,
        sourceAccountId: account?.id,
        batchTweetId: tweetId,
        existingDraftId: existingDraft?.id,
        imageGen: defaults.fastGenerateImage,
    });
}
