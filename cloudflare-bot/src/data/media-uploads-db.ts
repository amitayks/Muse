/**
 * Pre-warmed media uploads — D1 warm store + warm queue (source of truth)
 *
 * Publishing pays the slow per-platform media upload at publish time (X chunked video ≈ 25s, Instagram
 * video container processing, LinkedIn upload). But platform media handles are reusable ahead of time
 * (X media_id valid 24h, IG container 24h, LinkedIn asset URN durable). So we pre-upload ("warm") each
 * media item to its target platforms BEFORE publish and store the handle here; at publish, publishDraft
 * seeds its resumable `progress` from these handles, skips the upload, and posts instantly.
 *
 * One row per (draft_id, media_key, platform). The scheduling columns (status, attempts,
 * next_attempt_at) let this table double as the warm queue — the every-minute warm processor
 * (core/media-prewarm.ts) claims due rows on a lease, runs the shared upload primitive, and records the
 * handle. This mirrors publish_jobs (data/publish-jobs-db.ts) and x_pending_posts (data/x-pending-db.ts).
 *
 * Warming is BEST-EFFORT and NEVER a correctness dependency: a missing / 'failed' / 'expired' handle
 * just falls back to inline upload at publish.
 *
 * SECURITY: every row carries chat_id for ownership; the composite PK (draft_id, media_key, platform)
 * scopes a row to one draft's media item on one platform.
 */

import type { Env, MediaWarmPlatform, MediaUploadStatus } from '../types';

/** Row shape of media_uploads. */
export interface MediaUploadRow {
    draft_id: string;
    chat_id: string;
    media_key: string;
    platform: MediaWarmPlatform;
    media_kind: 'photo' | 'video';
    handle: string | null;
    caption_hash: string | null;
    status: MediaUploadStatus;
    expires_at: string | null;
    attempts: number;
    max_attempts: number;
    last_error: string | null;
    next_attempt_at: string;
    /** When the row last entered 'processing' (set by claimDueWarms); null until first claimed. */
    started_at: string | null;
    created_at: string;
    updated_at: string;
}

// Backoff between warm retries (seconds), indexed by attempt. max_attempts caps the budget. Mirrors
// publish_jobs; a warm chunk (chunked video upload) can take a full tick so the tail is long.
export const BACKOFF_SECS = [30, 30, 60, 60, 120];
export const MAX_ATTEMPTS = 6;

// A claim leases a warm row forward by this many seconds so a stuck 'processing' run (worker
// hard-cancelled mid-upload) is eventually re-claimed by a later tick (mirrors publish_jobs LEASE).
export const LEASE_SECS = 90;

/** Composite-key identity of a single warm row. */
export interface WarmKey {
    draftId: string;
    mediaKey: string;
    platform: MediaWarmPlatform;
}

/** Everything needed to enqueue a pending warm for one media item on one platform. */
export interface UpsertPendingWarmInput {
    draftId: string;
    chatId: string;
    mediaKey: string;
    platform: MediaWarmPlatform;
    mediaKind: 'photo' | 'video';
    /** Instagram only — the caption baked into the container; null/undefined otherwise. */
    captionHash?: string | null;
}

/**
 * Enqueue (or re-arm) a pending warm row. UPSERT on the composite PK keeps exactly one row per
 * (draft, media, platform) (idempotency — never duplicate). Created 'pending' with attempts=0, no
 * handle, and due immediately (next_attempt_at <= now) so the attach-time kick or the next warm tick
 * can claim it.
 *
 * Avoids needless re-warm: an already-'ready' row is KEPT (not reset to pending / handle cleared) when
 * the inputs are unchanged — same media_kind and (for IG) same caption_hash. The container/handle is
 * still valid, so re-warming would waste an upload and platform quota. A change in media_kind or
 * caption_hash (IG) means the baked handle no longer matches, so the conflict resets it to 'pending'
 * and clears the handle for a fresh warm. (X/LinkedIn pass captionHash null → caption-independent, so
 * an existing 'ready' row always survives.)
 */
export async function upsertPendingWarm(env: Env, input: UpsertPendingWarmInput): Promise<void> {
    const captionHash = input.captionHash ?? null;
    await env.DB.prepare(
        `INSERT INTO media_uploads
            (draft_id, chat_id, media_key, platform, media_kind, handle, caption_hash, status, expires_at, attempts, max_attempts, last_error, next_attempt_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, NULL, ?, 'pending', NULL, 0, ?, NULL, datetime('now'), datetime('now'), datetime('now'))
         ON CONFLICT(draft_id, media_key, platform) DO UPDATE SET
            chat_id = excluded.chat_id,
            media_kind = excluded.media_kind,
            caption_hash = excluded.caption_hash,
            max_attempts = excluded.max_attempts,
            -- Keep an already-ready, unchanged handle (avoid needless re-warm). Otherwise reset to
            -- pending + clear the handle so the next tick re-warms with the new inputs.
            status = CASE
                WHEN media_uploads.status = 'ready'
                     AND media_uploads.media_kind = excluded.media_kind
                     AND IFNULL(media_uploads.caption_hash, '') = IFNULL(excluded.caption_hash, '')
                THEN media_uploads.status
                ELSE 'pending'
            END,
            handle = CASE
                WHEN media_uploads.status = 'ready'
                     AND media_uploads.media_kind = excluded.media_kind
                     AND IFNULL(media_uploads.caption_hash, '') = IFNULL(excluded.caption_hash, '')
                THEN media_uploads.handle
                ELSE NULL
            END,
            expires_at = CASE
                WHEN media_uploads.status = 'ready'
                     AND media_uploads.media_kind = excluded.media_kind
                     AND IFNULL(media_uploads.caption_hash, '') = IFNULL(excluded.caption_hash, '')
                THEN media_uploads.expires_at
                ELSE NULL
            END,
            attempts = CASE
                WHEN media_uploads.status = 'ready'
                     AND media_uploads.media_kind = excluded.media_kind
                     AND IFNULL(media_uploads.caption_hash, '') = IFNULL(excluded.caption_hash, '')
                THEN media_uploads.attempts
                ELSE 0
            END,
            last_error = CASE
                WHEN media_uploads.status = 'ready'
                     AND media_uploads.media_kind = excluded.media_kind
                     AND IFNULL(media_uploads.caption_hash, '') = IFNULL(excluded.caption_hash, '')
                THEN media_uploads.last_error
                ELSE NULL
            END,
            next_attempt_at = CASE
                WHEN media_uploads.status = 'ready'
                     AND media_uploads.media_kind = excluded.media_kind
                     AND IFNULL(media_uploads.caption_hash, '') = IFNULL(excluded.caption_hash, '')
                THEN media_uploads.next_attempt_at
                ELSE datetime('now')
            END,
            updated_at = datetime('now')`
    )
        .bind(
            input.draftId,
            input.chatId,
            input.mediaKey,
            input.platform,
            input.mediaKind,
            captionHash,
            MAX_ATTEMPTS,
        )
        .run();
}

/**
 * Claim due warm rows with a lease: atomically transition due rows to 'processing', pushing
 * next_attempt_at forward by the lease, and RETURN the claimed rows. The conditional UPDATE guarantees
 * overlapping ticks each get a disjoint set — a row can only be claimed once because the UPDATE pushes
 * next_attempt_at into the future, so the `next_attempt_at <= now` guard excludes it for the other side.
 *
 * Claims both 'pending' rows AND 'processing' rows whose lease has EXPIRED (next_attempt_at <= now) —
 * the latter recovers a warm whose previous run was hard-cancelled mid-upload (mirrors
 * claimDuePublishJobs). Terminal rows ('ready' / 'failed' / 'expired') are never claimed.
 *
 * Selection is by the composite PK tuple (draft_id, media_key, platform) since media_uploads has no
 * single-column id.
 */
export async function claimDueWarms(env: Env, limit = 10): Promise<MediaUploadRow[]> {
    const result = await env.DB.prepare(
        `UPDATE media_uploads
         SET status = 'processing',
             started_at = datetime('now'),
             next_attempt_at = datetime('now', ? || ' seconds'),
             updated_at = datetime('now')
         WHERE (draft_id, media_key, platform) IN (
            SELECT draft_id, media_key, platform FROM media_uploads
            WHERE status IN ('pending', 'processing') AND next_attempt_at <= datetime('now')
            ORDER BY next_attempt_at ASC
            LIMIT ?
         )
         RETURNING *`
    )
        .bind(String(LEASE_SECS), limit)
        .all<MediaUploadRow>();
    return result.results || [];
}

/**
 * Mark a warm row 'ready' with its platform handle and expiry. expiresAt is null for durable handles
 * (LinkedIn). Clears last_error. The publish path seeds progress only from 'ready', non-expired rows.
 */
export async function markWarmReady(env: Env, key: WarmKey, handle: string, expiresAt: string | null): Promise<void> {
    await env.DB.prepare(
        `UPDATE media_uploads
         SET status = 'ready', handle = ?, expires_at = ?, last_error = NULL, updated_at = datetime('now')
         WHERE draft_id = ? AND media_key = ? AND platform = ?`
    )
        .bind(handle, expiresAt, key.draftId, key.mediaKey, key.platform)
        .run();
}

/**
 * Reschedule a warm row for another attempt after a transient failure: bump attempts, record the
 * error, push next_attempt_at out by the backoff for this attempt, and return the row to 'pending' so
 * a later tick re-claims it (mirrors reschedulePublishJob).
 */
export async function rescheduleWarm(env: Env, key: WarmKey, attempts: number, lastError: string): Promise<void> {
    const delaySecs = BACKOFF_SECS[Math.min(attempts - 1, BACKOFF_SECS.length - 1)];
    await env.DB.prepare(
        `UPDATE media_uploads
         SET status = 'pending', attempts = ?, last_error = ?, next_attempt_at = datetime('now', ? || ' seconds'), updated_at = datetime('now')
         WHERE draft_id = ? AND media_key = ? AND platform = ?`
    )
        .bind(attempts, lastError.slice(0, 500), String(delaySecs), key.draftId, key.mediaKey, key.platform)
        .run();
}

/**
 * Dead-letter a warm row (attempts exhausted / non-retryable). Marks it 'failed' and records the error;
 * publish falls back to inline upload for this media/platform. The row is left for cleanup / re-warm
 * rather than deleted.
 */
export async function failWarm(env: Env, key: WarmKey, lastError: string): Promise<void> {
    await env.DB.prepare(
        `UPDATE media_uploads
         SET status = 'failed', last_error = ?, updated_at = datetime('now')
         WHERE draft_id = ? AND media_key = ? AND platform = ?`
    )
        .bind(lastError.slice(0, 500), key.draftId, key.mediaKey, key.platform)
        .run();
}

/**
 * Ready, non-expired handles for a draft — the publish path's seed set. Returns rows whose status is
 * 'ready' and whose expires_at is null (durable, e.g. LinkedIn) OR still in the future. The caller
 * applies the publish-time safety margin (treating a handle within ~30 min of expiry as not-ready and
 * re-uploading inline), so this returns everything not already past expiry.
 */
export async function getReadyHandlesForDraft(env: Env, draftId: string, chatId: string): Promise<MediaUploadRow[]> {
    const result = await env.DB.prepare(
        `SELECT * FROM media_uploads
         WHERE draft_id = ? AND chat_id = ? AND status = 'ready' AND (expires_at IS NULL OR expires_at > datetime('now'))`
    )
        .bind(draftId, chatId)
        .all<MediaUploadRow>();
    return result.results || [];
}

/** A warm row's progress as surfaced to the webapp's per-media ring (no handle/secret leaked). */
export interface WarmProgressRow {
    media_key: string;
    platform: MediaWarmPlatform;
    status: MediaUploadStatus;
    started_at: string | null;
    updated_at: string;
}

/**
 * ALL warm rows for a draft (ownership-scoped by chat_id) projected to the fields the webapp's
 * per-media progress ring needs — media_key, platform, status, started_at, updated_at. Read-only; the
 * handle / caption_hash / error are deliberately omitted (no secret or internal detail crosses the API).
 */
export async function getWarmRowsForDraft(env: Env, draftId: string, chatId: string): Promise<WarmProgressRow[]> {
    const result = await env.DB.prepare(
        `SELECT media_key, platform, status, started_at, updated_at FROM media_uploads
         WHERE draft_id = ? AND chat_id = ?`
    )
        .bind(draftId, chatId)
        .all<WarmProgressRow>();
    return result.results || [];
}

/**
 * Invalidate (delete) warm rows whose media_key is no longer present in the draft content — media was
 * replaced or removed, so the handle is orphaned. keepMediaKeys is the current set of media keys; rows
 * with any other media_key are dropped. An empty keepMediaKeys deletes all rows for the draft.
 */
export async function invalidateWarmsByMediaKeys(env: Env, draftId: string, keepMediaKeys: string[]): Promise<void> {
    if (keepMediaKeys.length === 0) {
        await deleteWarmsForDraft(env, draftId);
        return;
    }
    const placeholders = keepMediaKeys.map(() => '?').join(', ');
    await env.DB.prepare(
        `DELETE FROM media_uploads
         WHERE draft_id = ? AND media_key NOT IN (${placeholders})`
    )
        .bind(draftId, ...keepMediaKeys)
        .run();
}

/**
 * Invalidate (delete) warm rows whose platform is no longer targeted — the draft's publish targets
 * changed, so handles for removed platforms are orphaned. keepPlatforms is the current target set;
 * rows for any other platform are dropped. An empty keepPlatforms deletes all rows for the draft.
 */
export async function invalidateWarmsByPlatforms(env: Env, draftId: string, keepPlatforms: string[]): Promise<void> {
    if (keepPlatforms.length === 0) {
        await deleteWarmsForDraft(env, draftId);
        return;
    }
    const placeholders = keepPlatforms.map(() => '?').join(', ');
    await env.DB.prepare(
        `DELETE FROM media_uploads
         WHERE draft_id = ? AND platform NOT IN (${placeholders})`
    )
        .bind(draftId, ...keepPlatforms)
        .run();
}

/**
 * Invalidate Instagram warm rows whose baked caption no longer matches the draft's current caption.
 * The IG container bakes in the caption, so a caption edit makes the handle stale (X/LinkedIn are
 * caption-independent and untouched). Affected IG rows are reset to 'pending' (handle cleared, due now)
 * so the next warm tick re-warms with the new caption. Matched rows (caption_hash unchanged) survive.
 */
export async function invalidateInstagramOnCaption(env: Env, draftId: string, currentCaptionHash: string): Promise<void> {
    await env.DB.prepare(
        `UPDATE media_uploads
         SET status = 'pending', handle = NULL, expires_at = NULL, caption_hash = ?, attempts = 0, last_error = NULL, next_attempt_at = datetime('now'), updated_at = datetime('now')
         WHERE draft_id = ?
           AND platform IN ('instagram_post', 'instagram_story', 'instagram_reel')
           AND IFNULL(caption_hash, '') != ?`
    )
        .bind(currentCaptionHash, draftId, currentCaptionHash)
        .run();
}

/**
 * Re-arm 'ready' warm rows for a draft whose handle is nearing expiry — reset them to 'pending' (handle
 * cleared, due now) so the next warm tick re-uploads with a fresh handle/expiry. Without this an
 * unchanged 'ready' row is intentionally KEPT by upsertPendingWarm (to avoid needless re-warm), so the
 * cron's re-warm path must explicitly re-arm it. `expirySoonHours` matches getWarmableDraftsByUser's
 * pre-expiry margin (default ~4h). Durable rows (expires_at IS NULL, e.g. LinkedIn) never match.
 */
export async function rearmExpiringWarms(env: Env, draftId: string, expirySoonHours = 4): Promise<void> {
    await env.DB.prepare(
        `UPDATE media_uploads
         SET status = 'pending', handle = NULL, expires_at = NULL, attempts = 0, last_error = NULL, next_attempt_at = datetime('now'), updated_at = datetime('now')
         WHERE draft_id = ?
           AND status = 'ready'
           AND expires_at IS NOT NULL
           AND expires_at <= datetime('now', ?)`
    )
        .bind(draftId, `+${expirySoonHours} hours`)
        .run();
}

/**
 * Delete all warm rows for a draft (draft deleted, or a wholesale invalidation).
 */
export async function deleteWarmsForDraft(env: Env, draftId: string): Promise<void> {
    await env.DB.prepare('DELETE FROM media_uploads WHERE draft_id = ?')
        .bind(draftId)
        .run();
}
