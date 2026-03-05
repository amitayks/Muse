/**
 * Twitter Database Operations
 *
 * CRUD for twitter_accounts, twitter_account_overviews, and twitter_tweets tables.
 * SECURITY: All data operations require and filter by chat_id for ownership verification.
 */

import type { Env, TwitterAccount, TwitterAccountConfig, TwitterAccountOverview, TwitterTweet } from '../types';
import { DEFAULT_TWITTER_ACCOUNT_CONFIG } from '../types';

/**
 * Generate a UUID v4
 */
function generateId(): string {
    return crypto.randomUUID();
}

// ==================== TWITTER ACCOUNTS ====================

/**
 * Create a new Twitter account to follow
 */
export async function createTwitterAccount(
    env: Env,
    chatId: string,
    data: {
        username: string;
        user_id?: string;
        display_name?: string;
        config?: TwitterAccountConfig;
    }
): Promise<string> {
    const id = generateId();
    const config = data.config || DEFAULT_TWITTER_ACCOUNT_CONFIG;

    await env.DB.prepare(
        `INSERT INTO twitter_accounts (id, chat_id, username, user_id, display_name, config)
         VALUES (?, ?, ?, ?, ?, ?)`
    )
        .bind(id, chatId, data.username, data.user_id || null, data.display_name || null, JSON.stringify(config))
        .run();

    return id;
}

/**
 * Get all Twitter accounts for a user
 */
export async function getTwitterAccounts(env: Env, chatId: string): Promise<TwitterAccount[]> {
    const result = await env.DB.prepare(
        'SELECT * FROM twitter_accounts WHERE chat_id = ? ORDER BY created_at DESC'
    )
        .bind(chatId)
        .all<TwitterAccount>();
    return result.results || [];
}

/**
 * Get a single Twitter account by ID - verifies ownership
 */
export async function getTwitterAccount(env: Env, accountId: string, chatId: string): Promise<TwitterAccount | null> {
    return env.DB.prepare('SELECT * FROM twitter_accounts WHERE id = ? AND chat_id = ?')
        .bind(accountId, chatId)
        .first<TwitterAccount>();
}

/**
 * Update a Twitter account - verifies ownership
 */
export async function updateTwitterAccount(
    env: Env,
    accountId: string,
    chatId: string,
    updates: {
        is_watching?: number;
        config?: TwitterAccountConfig;
        last_tweet_id?: string | null;
        thread_buffer?: string | null;
        user_id?: string;
        display_name?: string;
    }
): Promise<boolean> {
    const sets: string[] = [];
    const values: (string | number | null)[] = [];

    if (updates.is_watching !== undefined) {
        sets.push('is_watching = ?');
        values.push(updates.is_watching);
    }
    if (updates.config !== undefined) {
        sets.push('config = ?');
        values.push(JSON.stringify(updates.config));
    }
    if (updates.last_tweet_id !== undefined) {
        sets.push('last_tweet_id = ?');
        values.push(updates.last_tweet_id);
    }
    if (updates.thread_buffer !== undefined) {
        sets.push('thread_buffer = ?');
        values.push(updates.thread_buffer);
    }
    if (updates.user_id !== undefined) {
        sets.push('user_id = ?');
        values.push(updates.user_id);
    }
    if (updates.display_name !== undefined) {
        sets.push('display_name = ?');
        values.push(updates.display_name);
    }

    if (sets.length === 0) return false;

    sets.push("updated_at = datetime('now')");
    values.push(accountId, chatId);

    const result = await env.DB.prepare(
        `UPDATE twitter_accounts SET ${sets.join(', ')} WHERE id = ? AND chat_id = ?`
    )
        .bind(...values)
        .run();
    return (result.meta?.changes ?? 0) > 0;
}

/**
 * Delete a Twitter account and all related data - verifies ownership
 */
export async function deleteTwitterAccount(env: Env, accountId: string, chatId: string): Promise<boolean> {
    // Delete related tweets and overview first
    await env.DB.prepare('DELETE FROM twitter_tweets WHERE account_id = ? AND chat_id = ?')
        .bind(accountId, chatId)
        .run();
    await env.DB.prepare('DELETE FROM twitter_account_overviews WHERE account_id = ?')
        .bind(accountId)
        .run();

    const result = await env.DB.prepare('DELETE FROM twitter_accounts WHERE id = ? AND chat_id = ?')
        .bind(accountId, chatId)
        .run();
    return (result.meta?.changes ?? 0) > 0;
}

/**
 * Get all watching Twitter accounts (no chatId filter — for coordinator query)
 * SECURITY: Only use in cron coordinator context
 */
export async function getWatchingTwitterAccounts(env: Env): Promise<TwitterAccount[]> {
    const result = await env.DB.prepare(
        'SELECT * FROM twitter_accounts WHERE is_watching = 1 ORDER BY created_at DESC'
    ).all<TwitterAccount>();
    return result.results || [];
}

/**
 * Get watching Twitter accounts for a specific user (for per-user poller fan-out)
 */
export async function getWatchingTwitterAccountsByUser(env: Env, chatId: string): Promise<TwitterAccount[]> {
    const result = await env.DB.prepare(
        'SELECT * FROM twitter_accounts WHERE chat_id = ? AND is_watching = 1 ORDER BY created_at DESC'
    )
        .bind(chatId)
        .all<TwitterAccount>();
    return result.results || [];
}

// ==================== TWITTER ACCOUNT OVERVIEWS ====================

/**
 * Get persona overview for a Twitter account — verifies account ownership
 */
export async function getTwitterAccountOverview(env: Env, chatId: string, accountId: string): Promise<TwitterAccountOverview | null> {
    // Verify the caller owns this account
    const account = await env.DB.prepare('SELECT id FROM twitter_accounts WHERE id = ? AND chat_id = ?')
        .bind(accountId, chatId)
        .first();
    if (!account) return null;

    return env.DB.prepare('SELECT * FROM twitter_account_overviews WHERE account_id = ?')
        .bind(accountId)
        .first<TwitterAccountOverview>();
}

/**
 * Create or update persona overview for a Twitter account
 */
export async function upsertTwitterAccountOverview(
    env: Env,
    accountId: string,
    data: {
        persona?: string | null;
        topics?: string | null;
        communication_style?: string | null;
        notable_context?: string | null;
        recent_themes?: string | null;
    }
): Promise<void> {
    // Direct query (no ownership check) — callers must verify ownership before calling
    const existing = await env.DB.prepare('SELECT * FROM twitter_account_overviews WHERE account_id = ?')
        .bind(accountId)
        .first<TwitterAccountOverview>();

    if (existing) {
        const sets: string[] = [];
        const values: (string | number | null)[] = [];

        if (data.persona !== undefined) { sets.push('persona = ?'); values.push(data.persona); }
        if (data.topics !== undefined) { sets.push('topics = ?'); values.push(data.topics); }
        if (data.communication_style !== undefined) { sets.push('communication_style = ?'); values.push(data.communication_style); }
        if (data.notable_context !== undefined) { sets.push('notable_context = ?'); values.push(data.notable_context); }
        if (data.recent_themes !== undefined) { sets.push('recent_themes = ?'); values.push(data.recent_themes); }

        if (sets.length === 0) return;

        sets.push('version = version + 1');
        sets.push("updated_at = datetime('now')");
        values.push(accountId);

        await env.DB.prepare(
            `UPDATE twitter_account_overviews SET ${sets.join(', ')} WHERE account_id = ?`
        )
            .bind(...values)
            .run();
    } else {
        const id = generateId();
        await env.DB.prepare(
            `INSERT INTO twitter_account_overviews (id, account_id, persona, topics, communication_style, notable_context, recent_themes)
             VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
            .bind(
                id, accountId,
                data.persona || null, data.topics || null,
                data.communication_style || null, data.notable_context || null,
                data.recent_themes || null
            )
            .run();
    }
}

// ==================== TWITTER TWEETS ====================

/**
 * Get a tweet by ID — verifies ownership via chat_id
 */
export async function getTwitterTweet(env: Env, chatId: string, tweetId: string): Promise<TwitterTweet | null> {
    return env.DB.prepare('SELECT * FROM twitter_tweets WHERE id = ? AND chat_id = ?')
        .bind(tweetId, chatId)
        .first<TwitterTweet>();
}

/**
 * Create a tweet record
 */
export async function createTwitterTweet(
    env: Env,
    data: {
        id: string; // Tweet ID from X
        account_id: string;
        chat_id: string;
        conversation_id?: string | null;
        thread_position?: number;
        is_thread?: number;
        text: string;
        author_username: string;
        metrics?: string | null;
        tweet_url?: string | null;
        tweeted_at?: string | null;
        status?: string;
        media_url?: string | null;
    }
): Promise<void> {
    await env.DB.prepare(
        `INSERT OR IGNORE INTO twitter_tweets (id, account_id, chat_id, conversation_id, thread_position, is_thread, text, author_username, metrics, tweet_url, tweeted_at, status, media_url)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
        .bind(
            data.id, data.account_id, data.chat_id,
            data.conversation_id || null, data.thread_position || 0, data.is_thread || 0,
            data.text, data.author_username,
            data.metrics || null, data.tweet_url || null, data.tweeted_at || null,
            data.status || 'pending',
            data.media_url || null
        )
        .run();
}

/**
 * Update a tweet record
 */
export async function updateTwitterTweet(
    env: Env,
    tweetId: string,
    updates: {
        relevance_score?: number | null;
        relevance_reason?: string | null;
        status?: string;
        draft_id?: string | null;
        batch_message_id?: number | null;
        thread_position?: number;
        is_thread?: number;
        text?: string;
    }
): Promise<boolean> {
    const sets: string[] = [];
    const values: (string | number | null)[] = [];

    if (updates.relevance_score !== undefined) { sets.push('relevance_score = ?'); values.push(updates.relevance_score); }
    if (updates.relevance_reason !== undefined) { sets.push('relevance_reason = ?'); values.push(updates.relevance_reason); }
    if (updates.status !== undefined) { sets.push('status = ?'); values.push(updates.status); }
    if (updates.draft_id !== undefined) { sets.push('draft_id = ?'); values.push(updates.draft_id); }
    if (updates.batch_message_id !== undefined) { sets.push('batch_message_id = ?'); values.push(updates.batch_message_id); }
    if (updates.thread_position !== undefined) { sets.push('thread_position = ?'); values.push(updates.thread_position); }
    if (updates.is_thread !== undefined) { sets.push('is_thread = ?'); values.push(updates.is_thread); }
    if (updates.text !== undefined) { sets.push('text = ?'); values.push(updates.text); }

    if (sets.length === 0) return false;

    values.push(tweetId);

    const result = await env.DB.prepare(
        `UPDATE twitter_tweets SET ${sets.join(', ')} WHERE id = ?`
    )
        .bind(...values)
        .run();
    return (result.meta?.changes ?? 0) > 0;
}

/**
 * Get pending tweets for an account (for scoring pipeline)
 */
export async function getPendingTweetsByAccount(env: Env, accountId: string): Promise<TwitterTweet[]> {
    const result = await env.DB.prepare(
        "SELECT * FROM twitter_tweets WHERE account_id = ? AND status = 'pending' ORDER BY created_at ASC"
    )
        .bind(accountId)
        .all<TwitterTweet>();
    return result.results || [];
}

/**
 * Get recent tweets by account — for persona context (last N tweets)
 * Verifies account ownership via twitter_accounts.chat_id before querying.
 */
export async function getRecentTweetsByAccount(env: Env, chatId: string, accountId: string, limit = 50): Promise<TwitterTweet[]> {
    // Verify the caller owns this account
    const account = await env.DB.prepare('SELECT id FROM twitter_accounts WHERE id = ? AND chat_id = ?')
        .bind(accountId, chatId)
        .first();
    if (!account) return [];

    const result = await env.DB.prepare(
        'SELECT * FROM twitter_tweets WHERE account_id = ? AND chat_id = ? ORDER BY created_at DESC LIMIT ?'
    )
        .bind(accountId, chatId, limit)
        .all<TwitterTweet>();
    return result.results || [];
}

/**
 * Get scored tweets by batch message ID — for batch message reconstruction
 */
export async function getScoredTweetsByBatchMessage(env: Env, chatId: string, batchMessageId: number): Promise<TwitterTweet[]> {
    const result = await env.DB.prepare(
        'SELECT * FROM twitter_tweets WHERE batch_message_id = ? AND chat_id = ? ORDER BY relevance_score DESC'
    )
        .bind(batchMessageId, chatId)
        .all<TwitterTweet>();
    return result.results || [];
}

/**
 * Parse config from Twitter account record
 */
export function parseTwitterAccountConfig(account: TwitterAccount): TwitterAccountConfig {
    try {
        return JSON.parse(account.config) as TwitterAccountConfig;
    } catch {
        return DEFAULT_TWITTER_ACCOUNT_CONFIG;
    }
}
