/**
 * Durable publish-job queue — D1 schedule store (source of truth)
 *
 * A publish (multi-platform, possibly multi-video) can exceed one Worker budget (~30s). Instead of
 * running publishDraft inline and risking a hard-cancel that orphans the draft in 'publishing', we
 * enqueue a row here and the every-minute cron processor (core/publish-jobs.ts) runs publishDraft on
 * a fresh budget, persisting partial `progress` between ticks so a heavy publish completes across
 * multiple ticks without re-uploading media or double-posting.
 *
 * This generalizes the deferred-X-video pattern (data/x-pending-db.ts) into a per-draft publish
 * queue. The two queues are orthogonal: when publishDraft defers an X video it still enqueues
 * x_pending_posts for the tweet-creation wait; this queue tracks the publish work itself.
 *
 * This table is the scheduling source of truth (one row per draft, keyed by draft_id for
 * idempotency). See openspec/changes/durable-publish-queue/design.md.
 *
 * SECURITY: keyed by draft_id (1:1 with a draft); all rows carry chat_id for ownership.
 */

import type { Env, PublishProgress } from '../types';

export type { PublishProgress };

/** Row shape of publish_jobs. */
export interface PublishJobRow {
    draft_id: string;
    chat_id: string;
    lang: string | null;
    prior_status: string | null;
    state: 'pending' | 'processing' | 'done' | 'failed';
    progress: string | null; // JSON PublishProgress
    attempts: number;
    max_attempts: number;
    last_error: string | null;
    next_attempt_at: string;
    created_at: string;
    updated_at: string;
}

// Backoff between retries (seconds), indexed by attempt. max_attempts caps the budget.
// Mirrors x_pending_posts; longer tail because a heavy publish chunk can take a full tick.
export const BACKOFF_SECS = [30, 30, 60, 60, 120];
export const MAX_ATTEMPTS = 6;

// A claim leases a job forward by this many seconds so a stuck processing run is eventually retried
// by a later tick even if the worker that claimed it was hard-cancelled mid-publish.
const LEASE_SECS = 90;

/** Everything an entry point provides to enqueue a publish job. */
export interface EnqueuePublishJobInput {
    draftId: string;
    chatId: string;
    lang: string;
    /** Status to restore on failure — the draft's status before it was set to 'publishing'. */
    priorStatus: string;
}

/**
 * Enqueue (or re-arm) a publish job. UPSERT on draft_id keeps exactly one row per draft
 * (idempotency — re-publishing the same draft resets, never duplicates). Created 'pending' with
 * attempts=0, no progress, and due immediately (next_attempt_at <= now) so the inline first chunk
 * or the next cron tick can claim it.
 */
export async function enqueuePublishJob(env: Env, input: EnqueuePublishJobInput): Promise<void> {
    await env.DB.prepare(
        `INSERT INTO publish_jobs
            (draft_id, chat_id, lang, prior_status, state, progress, attempts, max_attempts, last_error, next_attempt_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'pending', NULL, 0, ?, NULL, datetime('now'), datetime('now'), datetime('now'))
         ON CONFLICT(draft_id) DO UPDATE SET
            chat_id = excluded.chat_id,
            lang = excluded.lang,
            prior_status = excluded.prior_status,
            state = 'pending',
            progress = NULL,
            attempts = 0,
            max_attempts = excluded.max_attempts,
            last_error = NULL,
            next_attempt_at = datetime('now'),
            updated_at = datetime('now')`
    )
        .bind(input.draftId, input.chatId, input.lang, input.priorStatus, MAX_ATTEMPTS)
        .run();
}

/**
 * Claim due jobs with a lease: atomically transition due rows to 'processing', pushing
 * next_attempt_at forward by the lease, and RETURN the claimed rows. The conditional UPDATE
 * guarantees overlapping ticks (or the inline first chunk + a cron tick) each get a disjoint set —
 * a row can only be claimed once because the UPDATE pushes next_attempt_at into the future, so the
 * `next_attempt_at <= now` guard excludes it for the other side.
 *
 * Claims both 'pending' rows AND 'processing' rows whose lease has EXPIRED (next_attempt_at <= now).
 * The latter recovers a job whose previous run was hard-cancelled mid-chunk (the worker died before
 * it could requeue/reschedule) — once the 90s lease lapses, a later tick re-claims and resumes from
 * the last persisted progress. Without this, a hard-cancelled 'processing' row would never be
 * re-claimed and the draft would orphan despite the reaper (which skips live jobs).
 */
export async function claimDuePublishJobs(env: Env, limit = 5): Promise<PublishJobRow[]> {
    const result = await env.DB.prepare(
        `UPDATE publish_jobs
         SET state = 'processing',
             next_attempt_at = datetime('now', ? || ' seconds'),
             updated_at = datetime('now')
         WHERE draft_id IN (
            SELECT draft_id FROM publish_jobs
            WHERE state IN ('pending', 'processing') AND next_attempt_at <= datetime('now')
            ORDER BY next_attempt_at ASC
            LIMIT ?
         )
         RETURNING *`
    )
        .bind(String(LEASE_SECS), limit)
        .all<PublishJobRow>();
    return result.results || [];
}

/**
 * Atomically claim a SINGLE due job by draft_id (the inline first-chunk path). Same lease semantics
 * as claimDuePublishJobs but scoped to one draft, so the request-context entry point and a concurrent
 * cron tick never work the same row: the conditional UPDATE only succeeds for the side that flips it
 * out of 'pending', and RETURNING gives that side the leased row (the other side gets null). Returns
 * null when the job is missing or no longer due/pending (already claimed elsewhere, or terminal).
 */
export async function claimPublishJob(env: Env, draftId: string): Promise<PublishJobRow | null> {
    const result = await env.DB.prepare(
        `UPDATE publish_jobs
         SET state = 'processing',
             next_attempt_at = datetime('now', ? || ' seconds'),
             updated_at = datetime('now')
         WHERE draft_id = ? AND state IN ('pending', 'processing') AND next_attempt_at <= datetime('now')
         RETURNING *`
    )
        .bind(String(LEASE_SECS), draftId)
        .first<PublishJobRow>();
    return result || null;
}

/**
 * Persist partial progress for a job that hit its soft budget mid-upload (needs-more) AND requeue it
 * for the next tick to resume. Crucially this returns the row to 'pending' with next_attempt_at=now:
 * claimDuePublishJobs only re-claims due 'pending' (or stale-lease) rows, so leaving it 'processing'
 * with the +90s lease would stall the publish for a full lease (or forever). It does NOT increment
 * attempts — budget exhaustion is normal chunking, not a failure, so a legitimately large publish is
 * never dead-lettered by max_attempts (only transient throws, via reschedulePublishJob, count).
 */
export async function saveProgressAndRequeue(env: Env, draftId: string, progress: PublishProgress): Promise<void> {
    await env.DB.prepare(
        `UPDATE publish_jobs
         SET progress = ?, state = 'pending', next_attempt_at = datetime('now'), updated_at = datetime('now')
         WHERE draft_id = ?`
    )
        .bind(JSON.stringify(progress), draftId)
        .run();
}

/**
 * Reschedule a job for another attempt after a transient failure: bump attempts, record the error,
 * push next_attempt_at out by the backoff for this attempt, and return the row to 'pending' so a
 * later tick re-claims it.
 */
export async function reschedulePublishJob(
    env: Env,
    draftId: string,
    attempts: number,
    lastError: string,
): Promise<void> {
    const delaySecs = BACKOFF_SECS[Math.min(attempts - 1, BACKOFF_SECS.length - 1)];
    await env.DB.prepare(
        `UPDATE publish_jobs
         SET state = 'pending', attempts = ?, last_error = ?, next_attempt_at = datetime('now', ? || ' seconds'), updated_at = datetime('now')
         WHERE draft_id = ?`
    )
        .bind(attempts, lastError.slice(0, 500), String(delaySecs), draftId)
        .run();
}

/**
 * Dead-letter a job (attempts exhausted / non-retryable). Marks it 'failed' and records the error;
 * the row is left for the reaper / manual retry rather than deleted.
 */
export async function failPublishJob(env: Env, draftId: string, lastError: string): Promise<void> {
    await env.DB.prepare(
        `UPDATE publish_jobs
         SET state = 'failed', last_error = ?, updated_at = datetime('now')
         WHERE draft_id = ?`
    )
        .bind(lastError.slice(0, 500), draftId)
        .run();
}

/**
 * Delete a job row (terminal success, or no-longer-relevant on an idempotent re-read).
 */
export async function deletePublishJob(env: Env, draftId: string): Promise<void> {
    await env.DB.prepare('DELETE FROM publish_jobs WHERE draft_id = ?')
        .bind(draftId)
        .run();
}

/**
 * True if the draft has a live (pending/processing) job — used by the reaper to avoid resetting an
 * in-flight chunked publish. A 'failed'/missing row is NOT live (the reaper remains the backstop).
 */
export async function hasLivePublishJob(env: Env, draftId: string): Promise<boolean> {
    const row = await env.DB.prepare(
        `SELECT 1 FROM publish_jobs WHERE draft_id = ? AND state IN ('pending', 'processing') LIMIT 1`
    )
        .bind(draftId)
        .first();
    return !!row;
}
