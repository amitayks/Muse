/**
 * Batch Notification Service — Sends scored tweet summaries to Telegram
 *
 * Groups scored tweets per chat, builds paginated HTML messages with inline buttons,
 * and stores the batch_message_id for later edit-in-place.
 */

// ============================================================
// TODO: NOTIFICATION PRIORITY TIERS
// ============================================================
// The what-i-like skill defines behavioral bands that predict
// engagement type. Currently all tweets above threshold are
// notified equally. Future: use score bands for priority tiers:
//
//   9-10: Immediate notification, high priority (separate message)
//   7-8:  Normal batch notification
//   5-6:  Queue silently, show only if user checks
//   1-4:  Don't surface (filtered by threshold)
//
// High-priority tweets (9-10) could get their own notification
// with a pre-generated draft, while normal-priority tweets
// continue to use the current batch format.
//
// Related files:
//   - services/auto-approve.ts (score-band auto-approve)
//   - skills/what-i-like.ts (scoring calibration bands)
//   - types.ts (TwitterAccountConfig.relevanceThreshold)
// ============================================================

import type { Env, TwitterAccount, TwitterTweet } from '../types';
import { parseTwitterAccountConfig, updateTwitterTweet, getPageSize } from '../data/db';
import { sendMessage } from '../integrations/telegram';

/**
 * Send batch notifications for all scored tweets from this polling cycle
 */
export async function sendBatchNotifications(
    env: Env,
    accounts: TwitterAccount[]
): Promise<void> {
    // Group scored tweets by chat_id
    const chatTweets: Record<string, Array<{ tweet: TwitterTweet; account: TwitterAccount }>> = {};

    for (const account of accounts) {
        const config = parseTwitterAccountConfig(account);

        // Get tweets that were just scored
        const result = await env.DB.prepare(
            "SELECT * FROM twitter_tweets WHERE account_id = ? AND status = 'scored' ORDER BY relevance_score DESC"
        )
            .bind(account.id)
            .all<TwitterTweet>();

        const scoredTweets = result.results || [];

        for (const tweet of scoredTweets) {
            // Filter by threshold — skip tweets below account's threshold
            if (tweet.relevance_score !== null && tweet.relevance_score < config.relevanceThreshold) {
                await updateTwitterTweet(env, tweet.id, { status: 'skipped' });
                continue;
            }

            if (!chatTweets[account.chat_id]) {
                chatTweets[account.chat_id] = [];
            }
            chatTweets[account.chat_id].push({ tweet, account });
        }
    }

    // Send paginated batch messages per chat
    for (const [chatId, items] of Object.entries(chatTweets)) {
        if (items.length === 0) continue;

        const pageSize = await getPageSize(env, chatId);
        const totalPages = Math.ceil(items.length / pageSize);

        try {
            // Send page 1
            const pageItems = items.slice(0, pageSize);
            const { text, keyboard } = buildBatchPage(pageItems, 0, totalPages, items.length);
            const messageId = await sendMessage(env, chatId, text, keyboard);

            // Store batch_message_id and mark as notified so they don't appear again
            for (const { tweet } of items) {
                await updateTwitterTweet(env, tweet.id, { batch_message_id: messageId, status: 'notified' });
            }

            console.log(`[batch] Sent notification to chat ${chatId}: ${items.length} tweets, ${totalPages} pages (msg: ${messageId})`);
        } catch (error) {
            console.error(`[batch] Failed to send notification to chat ${chatId}:`, error);
        }
    }
}

/**
 * Build a single page of the batch notification
 */
export function buildBatchPage(
    items: Array<{ tweet: TwitterTweet; account: TwitterAccount }>,
    page: number,
    totalPages: number,
    totalItems: number
): { text: string; keyboard: Array<Array<{ text: string; callback_data?: string; url?: string }>> } {
    const pageLabel = totalPages > 1 ? ` (${page + 1}/${totalPages})` : '';
    const lines: string[] = [`🔔 <b>New Tweets Detected</b>${pageLabel}\n`];

    for (const { tweet, account } of items) {
        const score = tweet.relevance_score || 0;
        const scoreEmoji = score >= 8 ? '🔥' : score >= 6 ? '⭐' : '📝';
        const threadLabel = tweet.is_thread ? ' [Thread]' : '';
        const preview = tweet.text.substring(0, 80).replace(/\n/g, ' ');
        const previewText = `${preview}${tweet.text.length > 80 ? '...' : ''}`;

        lines.push(`${scoreEmoji} <b>@${account.username}</b> (${score}/10)${threadLabel}`);
        // Wrap tweet text as clickable link if URL available
        if (tweet.tweet_url) {
            lines.push(`<a href="${tweet.tweet_url}">${previewText}</a>`);
        } else {
            lines.push(previewText);
        }
        lines.push('');
    }

    if (totalPages > 1) {
        lines.push(`<i>${totalItems} tweets total</i>`);
    }

    const text = lines.join('\n');

    // Build keyboard — 2 buttons per tweet row: [Fast] [Edit] or [Generated]
    const keyboard: Array<Array<{ text: string; callback_data?: string; url?: string }>> = [];

    for (const { tweet } of items) {
        const row: Array<{ text: string; callback_data?: string; url?: string }> = [];

        if (tweet.draft_id) {
            row.push({ text: '✅ Generated', callback_data: `draft:${tweet.draft_id}` });
        } else {
            row.push({ text: '⚡ Fast', callback_data: `action:fast_gen:${tweet.id}` });
            row.push({ text: '✏️ Edit', callback_data: `action:edit_rp:${tweet.id}` });
        }

        keyboard.push(row);
    }

    // Add navigation buttons
    if (totalPages > 1) {
        const navRow: Array<{ text: string; callback_data: string }> = [];
        if (page > 0) {
            navRow.push({ text: '⬅️ Prev', callback_data: `tw_batch:${page - 1}` });
        }
        if (page < totalPages - 1) {
            navRow.push({ text: 'Next ➡️', callback_data: `tw_batch:${page + 1}` });
        }
        if (navRow.length > 0) {
            keyboard.push(navRow);
        }
    }

    return { text, keyboard };
}
