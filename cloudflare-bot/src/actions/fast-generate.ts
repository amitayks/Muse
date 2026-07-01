/**
 * Fast Generate Action — Handler for action:fast_gen:TWEET_ID
 *
 * Called when user clicks [Fast] on a batch notification.
 * Generates repost content using user's repost default settings,
 * WITHOUT image by default (unless fast_generate_image is enabled).
 */

import type { HandlerContext } from '../core/router';
import type { ViewResult } from '../types';
import type { Lang } from '../ui/strings';
import { t } from '../ui/strings';
import { getTwitterTweet, getTwitterAccount, updateTwitterTweet, createDraft, parseTwitterAccountConfig } from '../data/db';
import { getUser } from '../data/user-db';
import { getRepostDefaults } from '../data/user-settings-db';
import { generateRepostContent } from '../ai/repost-generate';
import { generateTweetImage } from '../ai/tweet-image';
import { sendMessage } from '../integrations/telegram';
import { renderError } from '../views';
import { sanitizeError } from '../infra/security';

export async function fastGenerateAction(ctx: HandlerContext & { extra?: string }): Promise<ViewResult | void> {
    const lang = (ctx.lang || 'en') as Lang;
    const tweetId = ctx.extra!;

    const tweet = await getTwitterTweet(ctx.env, ctx.chatId, tweetId);
    if (!tweet) return renderError('Tweet not found.', lang);

    if (tweet.draft_id) {
        return renderError('A draft has already been generated for this tweet.', lang);
    }

    const account = await getTwitterAccount(ctx.env, tweet.account_id, ctx.chatId);
    if (!account) return renderError('Account not found.', lang);

    const config = parseTwitterAccountConfig(account);
    const defaults = await getRepostDefaults(ctx.env, ctx.chatId);

    // Source image: use user's analyze_source_image setting
    const imageUrls = defaults.analyzeSourceImage && tweet.media_url ? [tweet.media_url] : [];

    const content = await generateRepostContent(ctx.env, tweet, account.id, config, {
        imageUrls,
        language: lang,
        relevanceReason: tweet.relevance_reason,
    });
    if (!content) {
        return renderError('Failed to generate content. Please try again.', lang);
    }

    // Create draft
    const tweetPreview = tweet.text.substring(0, 30).replace(/\n/g, ' ');
    const tgUser = await getUser(ctx.env, ctx.chatId);
    const draftId = await createDraft(ctx.env, ctx.chatId, {
        pr_number: 0,
        pr_title: `@${account.username} | ${tweetPreview}...`,
        commit_sha: tweet.id,
        source: 'repost',
        content: JSON.stringify(content),
        original_tweet_id: tweet.id,
        original_tweet_url: tweet.tweet_url || undefined,
        publish_targets: tgUser?.default_publish_targets || undefined,
        language: lang,
    });

    // Update tweet status
    await updateTwitterTweet(ctx.env, tweetId, { status: 'drafted', draft_id: draftId });

    // Edit batch message in-place
    if (tweet.batch_message_id) {
        try {
            // Re-use the rebuild function from tweet-generate
            const { rebuildBatchMessage } = await import('./tweet-generate');
            await rebuildBatchMessage(ctx.env, ctx.chatId, tweet.batch_message_id, lang);
        } catch (error) {
            console.error('[fast_gen] Failed to edit batch message:', error);
        }
    }

    // Image generation if user has fast_generate_image enabled — per-tweet pipeline into tweets[0].media
    if (defaults.fastGenerateImage) {
        try {
            await generateTweetImage(ctx.env, ctx.chatId, draftId, 0);
        } catch (imgError) {
            console.error('[fast_gen] Image generation failed:', sanitizeError(imgError));
        }
    }

    // Send "ready" notification
    await sendMessage(ctx.env, ctx.chatId,
        `${t(lang, 'actions.repostDraftGenerated')}\n\n${t(lang, 'actions.repostDraftGeneratedMsg').replace('{username}', account.username).replace('{preview}', tweetPreview)}`,
        [[{ text: t(lang, 'actions.btnViewDraft'), callback_data: `tw_view:${draftId}` }]]
    );
}
