/**
 * Deferred X Video Post — D1 schedule store (source of truth)
 *
 * An X *video* media object needs ~10–60s after its chunked-upload STATUS reaches
 * "succeeded" before POST /2/tweets accepts it (images are instant). The publish flow
 * uploads the media inline (ids stay valid for hours) but DEFERS the tweet-creation: it
 * enqueues a row here, and the every-minute cron processor (core/x-pending.ts) retries
 * postThread/postQuoteTweet on "Your media IDs are invalid" / transient 5xx until it works
 * or the attempt budget runs out.
 *
 * This table is the scheduling source of truth (one row per draft, keyed by draft_id for
 * idempotency). See openspec/changes/add-x-oauth2-media/design-deferred-video-post.md.
 *
 * SECURITY: keyed by draft_id (1:1 with a draft); all rows carry chat_id for ownership.
 */

import type { Env, DraftContent, PublishResults } from '../types';
import type { ResolvedXMedia } from '../core/publish';

/** Everything needed to post the deferred X tweet later WITHOUT re-uploading media. */
export interface PendingXPayload {
    draftId: string;
    chatId: string;
    prNumber: number;
    prTitle: string;
    source: string;
    originalTweetId: string | null;
    originalTweetUrl: string | null;
    /** Tweet texts + reply-chain order. */
    content: DraftContent;
    /** Already-uploaded X media ids (video + photos); valid for hours. */
    media: ResolvedXMedia;
    /** Instagram results already produced inline (carried so the executor writes one complete record). */
    igResults: Pick<PublishResults, 'instagram_post' | 'instagram_story' | 'instagram_reel' | 'errors' | 'needsInstagramReconnect'>;
}

/** Row shape of x_pending_posts. */
export interface XPendingRow {
    draft_id: string;
    chat_id: string;
    payload: string; // JSON PendingXPayload
    attempts: number;
    max_attempts: number;
    status: 'pending' | 'done' | 'failed';
    last_error: string | null;
    next_attempt_at: string;
    created_at: string;
    updated_at: string;
}

// First attempt centers on the 10–60s readiness window; later entries are the backoff
// between retries. max_attempts caps the budget (~5 min total, well past the window).
export const FIRST_DELAY_SECS = 45;
export const BACKOFF_SECS = [45, 45, 60, 60, 90];
export const MAX_ATTEMPTS = 6;

/**
 * Enqueue (or re-arm) a deferred X video post. INSERT OR REPLACE on draft_id keeps exactly
 * one row per draft (idempotency — re-publishing the same draft replaces, never duplicates).
 * First attempt is scheduled ~45s out.
 */
export async function enqueuePendingXPost(env: Env, payload: PendingXPayload): Promise<void> {
    await env.DB.prepare(
        `INSERT OR REPLACE INTO x_pending_posts
            (draft_id, chat_id, payload, attempts, max_attempts, status, last_error, next_attempt_at, created_at, updated_at)
         VALUES (?, ?, ?, 0, ?, 'pending', NULL, datetime('now', ? || ' seconds'), datetime('now'), datetime('now'))`
    )
        .bind(payload.draftId, payload.chatId, JSON.stringify(payload), MAX_ATTEMPTS, String(FIRST_DELAY_SECS))
        .run();
}

/**
 * Select pending rows whose next_attempt_at is due. Ordered oldest-first, bounded by limit.
 */
export async function getDuePendingXPosts(env: Env, limit = 10): Promise<XPendingRow[]> {
    const result = await env.DB.prepare(
        `SELECT * FROM x_pending_posts
         WHERE status = 'pending' AND next_attempt_at <= datetime('now')
         ORDER BY next_attempt_at ASC
         LIMIT ?`
    )
        .bind(limit)
        .all<XPendingRow>();
    return result.results || [];
}

/**
 * Reschedule a row for another attempt: bump attempts, push next_attempt_at out by delaySecs,
 * record the last error. Row stays 'pending'.
 */
export async function reschedulePendingXPost(
    env: Env,
    draftId: string,
    attempts: number,
    delaySecs: number,
    lastError: string,
): Promise<void> {
    await env.DB.prepare(
        `UPDATE x_pending_posts
         SET attempts = ?, last_error = ?, next_attempt_at = datetime('now', ? || ' seconds'), updated_at = datetime('now')
         WHERE draft_id = ?`
    )
        .bind(attempts, lastError.slice(0, 500), String(delaySecs), draftId)
        .run();
}

/**
 * Delete a pending row (terminal outcome — done, failed, or orphaned).
 */
export async function deletePendingXPost(env: Env, draftId: string): Promise<void> {
    await env.DB.prepare('DELETE FROM x_pending_posts WHERE draft_id = ?')
        .bind(draftId)
        .run();
}
