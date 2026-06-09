/**
 * Draft & Published Database Operations
 *
 * CRUD for drafts and published tables.
 * SECURITY: All data operations require and filter by chat_id for ownership verification.
 */

import type { Env, Draft, ChatContext, Published, DraftStatus, PublishTargets, PublishResults } from '../types';
import { logInfo, logError } from '../infra/security';

/**
 * Generate a UUID v4
 */
function generateId(): string {
    return crypto.randomUUID();
}

// ==================== DRAFTS ====================

/**
 * Get a draft by ID - requires chat_id for ownership verification
 */
export async function getDraft(env: Env, id: string, chatId: string): Promise<Draft | null> {
    return env.DB.prepare('SELECT * FROM drafts WHERE id = ? AND chat_id = ?')
        .bind(id, chatId)
        .first<Draft>();
}

/**
 * Get a draft by ID without ownership check (for internal use only, e.g., cron jobs)
 * SECURITY: Only use this for system operations with env.TELEGRAM_CHAT_ID
 */
export async function getDraftInternal(env: Env, id: string): Promise<Draft | null> {
    return env.DB.prepare('SELECT * FROM drafts WHERE id = ?')
        .bind(id)
        .first<Draft>();
}

/**
 * Check if a draft already exists for a commit SHA (idempotency for webhooks)
 */
export async function getDraftByCommitSha(env: Env, chatId: string, commitSha: string): Promise<Draft | null> {
    return env.DB.prepare('SELECT * FROM drafts WHERE chat_id = ? AND commit_sha = ? LIMIT 1')
        .bind(chatId, commitSha)
        .first<Draft>();
}

/**
 * Get all drafts for a user, optionally filtered by status
 */
export async function getAllDrafts(
    env: Env,
    chatId: string,
    status?: DraftStatus,
    limit = 5,
    offset = 0
): Promise<Draft[]> {
    if (status) {
        const result = await env.DB.prepare(
            'SELECT * FROM drafts WHERE chat_id = ? AND status = ? ORDER BY created_at DESC LIMIT ? OFFSET ?'
        )
            .bind(chatId, status, limit, offset)
            .all<Draft>();
        return result.results || [];
    }

    const result = await env.DB.prepare(
        'SELECT * FROM drafts WHERE chat_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?'
    )
        .bind(chatId, limit, offset)
        .all<Draft>();
    return result.results || [];
}

/**
 * Count drafts for a user by status
 */
export async function countDrafts(env: Env, chatId: string, status?: DraftStatus): Promise<number> {
    if (status) {
        const result = await env.DB.prepare('SELECT COUNT(*) as count FROM drafts WHERE chat_id = ? AND status = ?')
            .bind(chatId, status)
            .first<{ count: number }>();
        return result?.count || 0;
    }

    const result = await env.DB.prepare('SELECT COUNT(*) as count FROM drafts WHERE chat_id = ?')
        .bind(chatId)
        .first<{ count: number }>();
    return result?.count || 0;
}

/**
 * Get the next scheduled draft (soonest scheduled_at)
 */
export async function getNextScheduledDraft(env: Env, chatId: string): Promise<Draft | null> {
    return env.DB.prepare(
        "SELECT * FROM drafts WHERE chat_id = ? AND status = 'scheduled' ORDER BY scheduled_at ASC LIMIT 1"
    )
        .bind(chatId)
        .first<Draft>();
}

/**
 * Get draft counts grouped by status
 */
export async function getDraftStatusCounts(env: Env, chatId: string): Promise<Record<string, number>> {
    const result = await env.DB.prepare(
        'SELECT status, COUNT(*) as count FROM drafts WHERE chat_id = ? GROUP BY status'
    )
        .bind(chatId)
        .all<{ status: string; count: number }>();
    const counts: Record<string, number> = {};
    for (const row of result.results || []) {
        counts[row.status] = row.count;
    }
    return counts;
}

/**
 * Get drafts by source type, filtered by allowed statuses
 */
export async function getDraftsBySource(
    env: Env,
    chatId: string,
    source: string | string[],
    statuses: string[],
    limit = 5,
    offset = 0
): Promise<Draft[]> {
    const sources = Array.isArray(source) ? source : [source];
    const statusPlaceholders = statuses.map(() => '?').join(', ');
    const sourcePlaceholders = sources.map(() => '?').join(', ');
    const result = await env.DB.prepare(
        `SELECT * FROM drafts WHERE chat_id = ? AND source IN (${sourcePlaceholders}) AND status IN (${statusPlaceholders}) ORDER BY created_at DESC LIMIT ? OFFSET ?`
    )
        .bind(chatId, ...sources, ...statuses, limit, offset)
        .all<Draft>();
    return result.results || [];
}

/**
 * Count handwritten drafts (source='handwrite', status='draft')
 */
export async function getHandwriteDraftCount(env: Env, chatId: string): Promise<number> {
    const result = await env.DB.prepare(
        "SELECT COUNT(*) as count FROM drafts WHERE chat_id = ? AND source = 'handwrite' AND status = 'draft'"
    )
        .bind(chatId)
        .first<{ count: number }>();
    return result?.count || 0;
}

/**
 * Count drafts by source
 */
export async function countDraftsBySource(env: Env, chatId: string, source: string | string[], statuses: string[]): Promise<number> {
    const sources = Array.isArray(source) ? source : [source];
    const statusPlaceholders = statuses.map(() => '?').join(', ');
    const sourcePlaceholders = sources.map(() => '?').join(', ');
    const result = await env.DB.prepare(
        `SELECT COUNT(*) as count FROM drafts WHERE chat_id = ? AND source IN (${sourcePlaceholders}) AND status IN (${statusPlaceholders})`
    )
        .bind(chatId, ...sources, ...statuses)
        .first<{ count: number }>();
    return result?.count || 0;
}

/**
 * Get published record by draft ID
 */
export async function getPublishedByDraft(env: Env, chatId: string, draftId: string): Promise<Published | null> {
    return env.DB.prepare(
        'SELECT * FROM published WHERE chat_id = ? AND draft_id = ? LIMIT 1'
    )
        .bind(chatId, draftId)
        .first<Published>();
}

/**
 * Create a new draft with ownership
 */
export async function createDraft(
    env: Env,
    chatId: string,
    data: {
        pr_number: number;
        pr_title: string;
        commit_sha: string;
        content: string;
        source?: string;
        status?: string;
        original_tweet_id?: string;
        original_tweet_url?: string;
        publish_targets?: string;
        has_video?: number;
        event_id?: string;
    }
): Promise<string> {
    const id = generateId();
    const source = data.source || 'auto';
    const status = data.status || 'draft';
    const publishTargets = data.publish_targets || '{"x":true}';
    const hasVideo = data.has_video || 0;
    await env.DB.prepare(
        `INSERT INTO drafts (id, chat_id, pr_number, pr_title, commit_sha, content, source, status, original_tweet_id, original_tweet_url, publish_targets, has_video, event_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
        .bind(id, chatId, data.pr_number, data.pr_title, data.commit_sha, data.content, source, status, data.original_tweet_id || null, data.original_tweet_url || null, publishTargets, hasVideo, data.event_id || null)
        .run();
    return id;
}

/**
 * Update draft status - verifies ownership
 */
export async function updateDraftStatus(
    env: Env,
    id: string,
    chatId: string,
    status: DraftStatus
): Promise<boolean> {
    const result = await env.DB.prepare(
        "UPDATE drafts SET status = ?, updated_at = datetime('now') WHERE id = ? AND chat_id = ?"
    )
        .bind(status, id, chatId)
        .run();
    return (result.meta?.changes ?? 0) > 0;
}

/**
 * Update draft content - verifies ownership
 */
export async function updateDraftContent(
    env: Env,
    id: string,
    chatId: string,
    content: string
): Promise<boolean> {
    // Recompute the denormalized has_video flag from the new content so the
    // Instagram-Reel publish branch and the drafts-list video badge stay consistent
    // with the actual attached media.
    let hasVideo = 0;
    try {
        const parsed = JSON.parse(content) as { tweets?: Array<{ media?: Array<{ type?: string }> }> };
        hasVideo = parsed.tweets?.some(t => t.media?.some(m => m.type === 'video')) ? 1 : 0;
    } catch {
        hasVideo = 0;
    }
    const result = await env.DB.prepare(
        "UPDATE drafts SET content = ?, has_video = ?, updated_at = datetime('now') WHERE id = ? AND chat_id = ?"
    )
        .bind(content, hasVideo, id, chatId)
        .run();
    return (result.meta?.changes ?? 0) > 0;
}

/**
 * Update draft fields - verifies ownership
 */
export async function updateDraft(
    env: Env,
    id: string,
    chatId: string,
    updates: { content?: string; image_url?: string | null }
): Promise<boolean> {
    const sets: string[] = [];
    const values: (string | null)[] = [];

    if (updates.content !== undefined) {
        sets.push('content = ?');
        values.push(updates.content);
    }
    if (updates.image_url !== undefined) {
        sets.push('image_url = ?');
        values.push(updates.image_url);
    }

    if (sets.length === 0) return false;

    sets.push("updated_at = datetime('now')");
    values.push(id, chatId);

    const result = await env.DB.prepare(
        `UPDATE drafts SET ${sets.join(', ')} WHERE id = ? AND chat_id = ?`
    )
        .bind(...values)
        .run();
    return (result.meta?.changes ?? 0) > 0;
}

/**
 * Update draft publish targets - verifies ownership
 */
export async function updateDraftPublishTargets(
    env: Env,
    id: string,
    chatId: string,
    targets: PublishTargets
): Promise<boolean> {
    const result = await env.DB.prepare(
        "UPDATE drafts SET publish_targets = ?, updated_at = datetime('now') WHERE id = ? AND chat_id = ?"
    )
        .bind(JSON.stringify(targets), id, chatId)
        .run();
    return (result.meta?.changes ?? 0) > 0;
}

/**
 * Update draft publish results - verifies ownership
 */
export async function updateDraftPublishResults(
    env: Env,
    id: string,
    chatId: string,
    results: PublishResults
): Promise<boolean> {
    const result = await env.DB.prepare(
        "UPDATE drafts SET publish_results = ?, updated_at = datetime('now') WHERE id = ? AND chat_id = ?"
    )
        .bind(JSON.stringify(results), id, chatId)
        .run();
    return (result.meta?.changes ?? 0) > 0;
}

/**
 * Schedule a draft - verifies ownership
 */
export async function scheduleDraft(
    env: Env,
    id: string,
    chatId: string,
    scheduledAt: string
): Promise<boolean> {
    // Normalize to SQLite datetime format (YYYY-MM-DD HH:MM:SS) for consistent comparison
    const normalized = scheduledAt.replace('T', ' ').replace(/\.\d{3}Z$/, '').replace('Z', '');
    const result = await env.DB.prepare(
        "UPDATE drafts SET status = 'scheduled', scheduled_at = ?, updated_at = datetime('now') WHERE id = ? AND chat_id = ?"
    )
        .bind(normalized, id, chatId)
        .run();
    return (result.meta?.changes ?? 0) > 0;
}

/**
 * Get scheduled drafts that are due (for cron job)
 * SECURITY: Returns drafts for all users - only use in cron context
 */
export async function getDueDrafts(env: Env): Promise<Draft[]> {
    // Replace 'T' with space to normalize ISO 8601 format for SQLite comparison
    // scheduled_at is stored as ISO (2026-02-10T08:10:00.000Z)
    // datetime('now') returns (2026-02-10 08:48:37)
    const result = await env.DB.prepare(
        "SELECT * FROM drafts WHERE status = 'scheduled' AND REPLACE(scheduled_at, 'T', ' ') <= datetime('now')"
    ).all<Draft>();
    return result.results || [];
}

/**
 * Get scheduled drafts that are due for a specific user (for per-user cron fan-out)
 */
export async function getDueDraftsByUser(env: Env, chatId: string): Promise<Draft[]> {
    const result = await env.DB.prepare(
        "SELECT * FROM drafts WHERE chat_id = ? AND status = 'scheduled' AND REPLACE(scheduled_at, 'T', ' ') <= datetime('now')"
    )
        .bind(chatId)
        .all<Draft>();
    return result.results || [];
}

/**
 * Delete a draft - verifies ownership
 */
export async function deleteDraft(env: Env, id: string, chatId: string): Promise<boolean> {
    const result = await env.DB.prepare('DELETE FROM drafts WHERE id = ? AND chat_id = ?')
        .bind(id, chatId)
        .run();
    return (result.meta?.changes ?? 0) > 0;
}

// ==================== PUBLISHED ====================

/**
 * Create a published record with ownership
 */
export async function createPublished(
    env: Env,
    chatId: string,
    data: {
        draft_id: string;
        pr_number: number;
        tweet_ids?: string | null;
        tweet_url?: string | null;
        instagram_post_id?: string | null;
        instagram_url?: string | null;
    }
): Promise<string> {
    const id = generateId();
    await env.DB.prepare(
        `INSERT INTO published (id, chat_id, draft_id, pr_number, tweet_ids, tweet_url, instagram_post_id, instagram_url)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
        .bind(
            id, chatId, data.draft_id, data.pr_number,
            data.tweet_ids ?? null, data.tweet_url ?? null,
            data.instagram_post_id ?? null, data.instagram_url ?? null
        )
        .run();
    return id;
}

/**
 * Get published posts by PR number for a user
 */
export async function getPublishedByPR(env: Env, chatId: string, prNumber: number): Promise<Published[]> {
    const result = await env.DB.prepare(
        'SELECT * FROM published WHERE chat_id = ? AND pr_number = ? ORDER BY published_at DESC'
    )
        .bind(chatId, prNumber)
        .all<Published>();
    return result.results || [];
}

/**
 * Delete a published record - verifies ownership
 */
export async function deletePublished(env: Env, id: string, chatId: string): Promise<boolean> {
    const result = await env.DB.prepare('DELETE FROM published WHERE id = ? AND chat_id = ?')
        .bind(id, chatId)
        .run();
    return (result.meta?.changes ?? 0) > 0;
}

/**
 * Check if a repost draft already exists for a tweet ID
 */
export async function getExistingRepostDraft(env: Env, chatId: string, tweetId: string): Promise<Draft | null> {
    return env.DB.prepare(
        "SELECT * FROM drafts WHERE chat_id = ? AND source = 'repost' AND original_tweet_id = ? LIMIT 1"
    )
        .bind(chatId, tweetId)
        .first<Draft>();
}
