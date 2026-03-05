/**
 * Tweet Generate Action — Handler for action:tw_gen:TWEET_ID
 *
 * Called when user clicks [Generate] on a batch notification.
 * Generates repost content, creates a draft, updates tweet status,
 * edits the batch notification button for that tweet, and sends a
 * separate "ready" message with a [View] button.
 */

import type { HandlerContext } from '../core/router';
import type { ViewResult } from '../types';
import type { Lang } from '../ui/strings';
import { t } from '../ui/strings';
import { getTwitterTweet, getTwitterAccount, updateTwitterTweet, getScoredTweetsByBatchMessage, createDraft, parseTwitterAccountConfig, getPageSize } from '../data/db';
import { generateRepostContent } from '../ai/repost-generate';
import { editMessage, sendMessage } from '../integrations/telegram';
import { renderError } from '../views';

export async function tweetGenerateAction(ctx: HandlerContext & { extra?: string }): Promise<ViewResult | void> {
    const lang = (ctx.lang || 'en') as Lang;
    const tweetId = ctx.extra!;

    const tweet = await getTwitterTweet(ctx.env, ctx.chatId, tweetId);
    if (!tweet) {
        return renderError('Tweet not found.', lang);
    }

    // Check if already drafted
    if (tweet.draft_id) {
        return renderError('A draft has already been generated for this tweet.', lang);
    }

    const account = await getTwitterAccount(ctx.env, tweet.account_id, ctx.chatId);
    if (!account) {
        return renderError('Account not found.', lang);
    }

    const config = parseTwitterAccountConfig(account);

    // Generate content (with media if enabled)
    const imageUrl = config.analyzeMedia ? tweet.media_url : null;
    const content = await generateRepostContent(ctx.env, tweet, account.id, config, undefined, imageUrl);
    if (!content) {
        return renderError('Failed to generate content. Please try again.', lang);
    }

    // Create draft
    const tweetPreview = tweet.text.substring(0, 30).replace(/\n/g, ' ');
    const draftId = await createDraft(ctx.env, ctx.chatId, {
        pr_number: 0,
        pr_title: `@${account.username} | ${tweetPreview}...`,
        commit_sha: tweet.id,
        source: 'repost',
        content: JSON.stringify(content),
        original_tweet_id: tweet.id,
        original_tweet_url: tweet.tweet_url || undefined,
    });

    // Update tweet status
    await updateTwitterTweet(ctx.env, tweetId, {
        status: 'drafted',
        draft_id: draftId,
    });

    // Edit batch message in-place (just update buttons, keep content)
    if (tweet.batch_message_id) {
        try {
            await rebuildBatchMessage(ctx.env, ctx.chatId, tweet.batch_message_id);
        } catch (error) {
            console.error('[tw_gen] Failed to edit batch message:', error);
        }
    }

    // Send a separate "ready" notification
    await sendMessage(ctx.env, ctx.chatId,
        `${t(lang, 'actions.repostDraftGenerated')}\n\n${t(lang, 'actions.repostDraftGeneratedMsg').replace('{username}', account.username).replace('{preview}', tweetPreview)}`,
        [[{ text: t(lang, 'actions.btnViewDraft'), callback_data: `tw_view:${draftId}` }]]
    );

    // Return void — we handled messaging ourselves
    return;
}

/**
 * Rebuild and edit a batch notification message after generating a draft.
 * Finds which page the tweet is on and rebuilds that page.
 */
async function rebuildBatchMessage(env: import('../types').Env, chatId: string, batchMessageId: number): Promise<void> {
    const tweets = await getScoredTweetsByBatchMessage(env, chatId, batchMessageId);
    if (tweets.length === 0) return;

    // Fetch accounts for all tweets
    const accountIds = [...new Set(tweets.map(t => t.account_id))];
    const accounts = new Map<string, import('../types').TwitterAccount>();

    for (const accountId of accountIds) {
        const account = await getTwitterAccount(env, accountId, chatId);
        if (account) {
            accounts.set(accountId, account);
        }
    }

    const pageSize = await getPageSize(env, chatId);

    // Always rebuild page 1 (user can navigate to other pages)
    const totalPages = Math.ceil(tweets.length / pageSize);
    const pageItems = tweets.slice(0, pageSize);

    const pageLabel = totalPages > 1 ? ` (1/${totalPages})` : '';
    // Note: rebuildBatchMessage doesn't have lang context, using English default
    const lines: string[] = [`${t('en', 'notifications.newTweetsDetected')}${pageLabel}\n`];
    const keyboard: Array<Array<{ text: string; callback_data?: string; url?: string }>> = [];

    for (const tweet of pageItems) {
        const account = accounts.get(tweet.account_id);
        if (!account) continue;

        const score = tweet.relevance_score || 0;
        const scoreEmoji = score >= 8 ? '🔥' : score >= 6 ? '⭐' : '📝';
        const threadLabel = tweet.is_thread ? ' [Thread]' : '';
        const preview = tweet.text.substring(0, 80).replace(/\n/g, ' ');

        lines.push(`${scoreEmoji} <b>@${account.username}</b> (${score}/10)${threadLabel}`);
        lines.push(`${preview}${tweet.text.length > 80 ? '...' : ''}`);
        if (tweet.relevance_reason) {
            lines.push(`<i>${tweet.relevance_reason}</i>`);
        }
        lines.push('');

        const row: Array<{ text: string; callback_data?: string; url?: string }> = [];
        if (tweet.draft_id) {
            row.push({ text: t('en', 'notifications.generated'), callback_data: `noop:${tweet.id}` });
        } else {
            row.push({ text: t('en', 'notifications.generateFor').replace('{username}', account.username), callback_data: `action:tw_gen:${tweet.id}` });
        }
        if (tweet.tweet_url) {
            row.push({ text: t('en', 'notifications.openLink'), url: tweet.tweet_url });
        }
        keyboard.push(row);
    }

    if (totalPages > 1) {
        lines.push(`<i>${tweets.length} ${t('en', 'notifications.tweetsTotal')}</i>`);
        keyboard.push([{ text: t('en', 'common.next'), callback_data: `tw_batch:1` }]);
    }

    await editMessage(env, chatId, batchMessageId, lines.join('\n'), keyboard);
}
