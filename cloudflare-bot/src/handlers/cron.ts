/**
 * Cron Handler — Coordinator + Per-User Cron Functions
 *
 * The coordinator finds users with pending work and runs per-user
 * cron tasks inline as parallel promises (no self-fetch fan-out).
 * Each per-user function runs with a hydrated env.
 */

import type { Env, Draft, VideoDraft } from '../types';
import type { Lang } from '../ui/strings';
import { t } from '../ui/strings';
import {
    getDueDraftsByUser,
    getStuckPublishingDrafts,
    getWarmableDraftsByUser,
    updateDraftStatus,
    getStaleGeneratingDraftsByUser,
    getScheduledVideoDraftsByUser,
    updateVideoDraft,
    createVideoPublished,
    getUserLanguage,
} from '../data/db';
import { enqueuePublishJob } from '../data/publish-jobs-db';
import { rearmExpiringWarms } from '../data/media-uploads-db';
import { warmDraftMedia, processMediaWarms } from '../core/media-prewarm';
import { sendMessage, sendVideo } from '../integrations/telegram';
import { updateUser } from '../data/user-db';
import { refreshLongLivedToken, storeInstagramToken } from '../services/instagram-token';
import { sanitizeError, logInfo, logError } from '../infra/security';
import { hydrateEnv } from '../data/user-keys';
import { pollUserAccounts } from '../services/poller';

// ==================== COORDINATOR ====================

/**
 * Coordinator — finds active users with pending work and runs cron tasks inline in parallel
 */
export async function cronCoordinator(env: Env, ctx: ExecutionContext): Promise<void> {
    logInfo('[cron] Coordinator starting');

    // NOTE: Cloudflare D1 caps a compound SELECT at 5 UNION'd terms (SQLITE_ERROR 7500
    // "too many terms in compound SELECT"). This query is AT that limit (5 SELECTs), so do
    // NOT add another UNION — fold any new "users with pending work" condition into one of the
    // existing per-table SELECTs with OR (as the drafts SELECT does for scheduled + stuck-publishing).
    //
    // The drafts SELECT below ORs in "users with warmable media" (media pre-warm, openspec
    // prewarm-media-uploads) rather than adding a 6th UNION: a scheduled draft that has crossed into
    // the 20h warm window, OR a still-unpublished draft with a 'ready' handle nearing expiry that must
    // be re-warmed. See getWarmableDraftsByUser for the matching per-user query.
    const result = await env.DB.prepare(`
        SELECT DISTINCT chat_id FROM (
            SELECT chat_id FROM twitter_accounts WHERE is_watching = 1
            UNION
            SELECT d.chat_id FROM drafts d WHERE (d.status = 'scheduled' AND REPLACE(d.scheduled_at, 'T', ' ') <= datetime('now'))
                OR (d.status = 'publishing' AND d.updated_at <= datetime('now', '-10 minutes'))
                OR (d.status IN ('draft', 'approved', 'scheduled') AND d.scheduled_at IS NOT NULL AND REPLACE(d.scheduled_at, 'T', ' ') <= datetime('now', '+20 hours'))
                OR (d.status NOT IN ('published', 'publishing') AND EXISTS (
                    SELECT 1 FROM media_uploads m
                    WHERE m.draft_id = d.id AND m.status = 'ready' AND m.expires_at IS NOT NULL AND m.expires_at <= datetime('now', '+4 hours')
                ))
            UNION
            SELECT chat_id FROM video_drafts WHERE status = 'generating' AND updated_at <= datetime('now', '-30 minutes')
            UNION
            SELECT chat_id FROM video_drafts WHERE status = 'scheduled' AND REPLACE(scheduled_at, 'T', ' ') <= datetime('now')
            UNION
            SELECT chat_id FROM users WHERE has_instagram = 1 AND instagram_token_expires_at IS NOT NULL AND instagram_token_expires_at <= datetime('now', '+7 days')
        )
    `).all<{ chat_id: string }>();

    const users = result.results || [];

    if (users.length === 0) {
        logInfo('[cron] No users with pending work');
        return;
    }

    logInfo(`[cron] Processing ${users.length} users inline`);

    // Run all users in parallel — no self-fetch, direct execution
    const results = await Promise.allSettled(
        users.map(user => processUserCron(env, user.chat_id))
    );

    // Log results
    for (let i = 0; i < results.length; i++) {
        const r = results[i];
        const chatId = users[i].chat_id;
        if (r.status === 'rejected') {
            logError(`[cron] User ${chatId} failed:`, r.reason instanceof Error ? r.reason.message : String(r.reason));
        }
    }

    logInfo(`[cron] Completed ${users.length} users`);
}

/**
 * Run all cron tasks for a single user — hydrates env, polls, publishes, etc.
 */
async function processUserCron(env: Env, chatId: string): Promise<void> {
    logInfo(`[cron] Starting per-user cron for chat ${chatId}`);

    const userEnv = await hydrateEnv(env, chatId);
    const lang = (await getUserLanguage(env, chatId)) as Lang;

    const results: Record<string, string> = {};

    try {
        await pollUserAccounts(userEnv, chatId);
        results.poller = 'ok';
    } catch (error) {
        logError(`[cron] Poller failed for chat ${chatId}:`, sanitizeError(error));
        results.poller = 'error';
    }

    try {
        await refreshUserInstagramToken(userEnv, chatId, lang);
        results.instagramToken = 'ok';
    } catch (error) {
        logError(`[cron] Instagram token refresh failed for chat ${chatId}:`, sanitizeError(error));
        results.instagramToken = 'error';
    }

    try {
        await publishUserDrafts(userEnv, chatId, lang);
        results.drafts = 'ok';
    } catch (error) {
        logError(`[cron] Draft publishing failed for chat ${chatId}:`, sanitizeError(error));
        results.drafts = 'error';
    }

    try {
        await recoverStuckPublishingDrafts(userEnv, chatId, lang);
        results.stuckPublishing = 'ok';
    } catch (error) {
        logError(`[cron] Stuck-publish recovery failed for chat ${chatId}:`, sanitizeError(error));
        results.stuckPublishing = 'error';
    }

    try {
        await warmUserDrafts(userEnv, chatId);
        results.mediaWarm = 'ok';
    } catch (error) {
        logError(`[cron] Media warm scan failed for chat ${chatId}:`, sanitizeError(error));
        results.mediaWarm = 'error';
    }

    try {
        await checkUserStaleVideos(userEnv, chatId, lang);
        results.staleVideos = 'ok';
    } catch (error) {
        logError(`[cron] Stale video check failed for chat ${chatId}:`, sanitizeError(error));
        results.staleVideos = 'error';
    }

    try {
        await publishUserScheduledVideos(userEnv, chatId, lang);
        results.scheduledVideos = 'ok';
    } catch (error) {
        logError(`[cron] Scheduled video publishing failed for chat ${chatId}:`, sanitizeError(error));
        results.scheduledVideos = 'error';
    }

    logInfo(`[cron] Completed for chat ${chatId}:`, JSON.stringify(results));
}

// ==================== PER-USER CRON FUNCTIONS ====================

/**
 * Refresh a user's long-lived Instagram token before it expires.
 * Selected by the coordinator when the token is within 7 days of expiry.
 * No-op when Instagram isn't connected or no expiry is recorded (lazy-migration safe).
 */
async function refreshUserInstagramToken(env: Env, chatId: string, lang: Lang = 'en'): Promise<void> {
    const token = env.INSTAGRAM_ACCESS_TOKEN;
    const expiresAt = env.INSTAGRAM_TOKEN_EXPIRES_AT;
    if (!token || !expiresAt) return; // not connected / nothing to refresh

    const expMs = Date.parse(expiresAt);
    if (Number.isNaN(expMs)) return;

    const now = Date.now();
    const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
    if (expMs > now + SEVEN_DAYS) return; // not due yet

    const result = await refreshLongLivedToken(token);
    if (result.ok) {
        await storeInstagramToken(env, chatId, result.token, result.expiresInSec);
        logInfo(`[cron] Refreshed Instagram token for chat ${chatId}`);
        return;
    }

    // Refresh failed. If the token is already expired it cannot be recovered — stop
    // retrying (null the expiry so the coordinator no longer selects this user) and
    // notify the user once to reconnect. If it's still valid this was likely transient;
    // leave the expiry intact so we retry on the next tick (no notification, no spam).
    logError(`[cron] Instagram token refresh failed for chat ${chatId}:`, result.message);
    if (expMs <= now) {
        await updateUser(env, chatId, { instagram_token_expires_at: null });
        await sendMessage(
            env,
            chatId,
            t(lang, 'notifications.instagramReconnectNeeded'),
            [[{ text: t(lang, 'notifications.btnReconnectInstagram'), callback_data: 'settings:update:instagram' }]]
        ).catch(() => {});
    }
}

/**
 * Enqueue due scheduled drafts for a specific user onto the durable publish-job queue.
 * Called with already-hydrated env.
 *
 * No inline publish and no inline notification here anymore: each due draft is flipped to
 * 'publishing' and enqueued in publish_jobs; the every-minute publish-job processor
 * (core/publish-jobs.ts) runs publishDraft on a fresh budget, finalizes status/record, and sends
 * the single per-draft notification — so a heavy multi-video scheduled publish completes across
 * ticks instead of being hard-cancelled inside this cron task. See openspec durable-publish-queue.
 */
export async function publishUserDrafts(env: Env, chatId: string, lang: Lang = 'en'): Promise<void> {
    const drafts = await getDueDraftsByUser(env, chatId);

    if (drafts.length === 0) return;

    logInfo(`[cron] Enqueuing ${drafts.length} scheduled drafts for chat ${chatId}`);

    for (const draft of drafts) {
        try {
            // Mark 'publishing' before enqueueing — this transition both reserves the draft against
            // a duplicate enqueue on the next tick and satisfies the processor's idempotency guard
            // (it only finalizes a still-'publishing' draft). prior_status='scheduled' so a full
            // failure restores the scheduled status when it is still in the future.
            await updateDraftStatus(env, draft.id, chatId, 'publishing');
            await enqueuePublishJob(env, { draftId: draft.id, chatId, lang, priorStatus: 'scheduled' });
        } catch (error) {
            // Enqueue threw — reset the draft so it doesn't orphan in 'publishing' (the next tick
            // re-picks it as due once it's back to 'scheduled'). Continue so one bad draft doesn't
            // abort the rest of the batch.
            logError(`[cron] enqueuePublishJob threw for scheduled draft ${draft.id}:`, sanitizeError(error));
            await updateDraftStatus(env, draft.id, chatId, 'scheduled').catch(() => {});
        }
    }
}

/**
 * Recover drafts orphaned in 'publishing' for a specific user (>10 min).
 *
 * A publish flips the draft to 'publishing' before running; if the worker is terminated
 * mid-publish (isolate eviction, CPU/wall-clock limit, a killed waitUntil() task) or
 * publishDraft throws in an unguarded spot, nothing resets the status and the draft is
 * orphaned. No try/catch can cover a worker kill, so this sweep is the durable safety net.
 * getStuckPublishingDrafts already excludes legit deferred-X-video posts and anything with a
 * published record. Reset → 'scheduled' if scheduled_at is still in the future, else 'approved'.
 * Called with already-hydrated env.
 */
export async function recoverStuckPublishingDrafts(env: Env, chatId: string, lang: Lang = 'en'): Promise<void> {
    const STUCK_MINUTES = 10;
    const stuck = await getStuckPublishingDrafts(env, chatId, STUCK_MINUTES);
    if (stuck.length === 0) return;

    for (const draft of stuck) {
        try {
            const future = !!draft.scheduled_at && new Date(draft.scheduled_at.replace(' ', 'T')) > new Date();
            const next = future ? 'scheduled' : 'approved';
            await updateDraftStatus(env, draft.id, chatId, next);
            logInfo(`[cron] Recovered orphaned 'publishing' draft ${draft.id} → ${next}`);

            try {
                await sendMessage(
                    env,
                    chatId,
                    t(lang, 'notifications.publishStuckRecovered').replace('{title}', draft.pr_title || 'your post'),
                    [[{ text: t(lang, 'notifications.btnViewDrafts'), callback_data: 'view:drafts' }]],
                );
            } catch (notifyError) {
                logError('Failed to send stuck-publish recovery notification:', notifyError);
            }
        } catch (err) {
            logError('Stuck-publish recovery error for draft:', draft.id, err instanceof Error ? err.message : String(err));
        }
    }
}

/**
 * Pre-warm media uploads for a specific user — media pre-warm cron scan (openspec
 * prewarm-media-uploads). Called with already-hydrated env.
 *
 * The attach-time triggers (webapp PUT / bot edit) cover unscheduled now/near-term drafts. This cron
 * scan is the durable safety net for the two cases attach-time can't reach:
 *   - a far-scheduled draft that has since crossed into the 20h warm window (it wasn't warm-eligible
 *     when its media was attached);
 *   - a still-unpublished draft whose 'ready' handle is nearing expiry and must be re-warmed.
 *
 * For each such draft: re-arm any expiring 'ready' rows (→ 'pending', due now), then warmDraftMedia
 * enqueues/keeps the pending warm set (gated on the same 20h eligibility). A single processMediaWarms()
 * pass then performs the due warms for ALL of this user's drafts in one bounded batch — it's
 * user-agnostic (claims globally), so we run it once here rather than per-draft. Best-effort throughout:
 * nothing here throws into the cron task, and publish falls back to inline upload regardless.
 */
export async function warmUserDrafts(env: Env, chatId: string): Promise<void> {
    const drafts = await getWarmableDraftsByUser(env, chatId);
    if (drafts.length === 0) return;

    logInfo(`[cron] Warming media for ${drafts.length} draft(s) for chat ${chatId}`);

    for (const draft of drafts) {
        try {
            await rearmExpiringWarms(env, draft.id);
            await warmDraftMedia(env, draft);
        } catch (error) {
            logError(`[cron] warm enqueue failed for draft ${draft.id}:`, sanitizeError(error));
        }
    }

    // Perform the due warms now (don't wait for the every-minute processor) — one bounded batch for
    // all of this user's just-armed rows. processMediaWarms is best-effort and never throws.
    await processMediaWarms(env);
}

/**
 * Check for stale generating video drafts for a specific user (>30 min)
 * Called with already-hydrated env
 */
export async function checkUserStaleVideos(env: Env, chatId: string, lang: Lang = 'en'): Promise<void> {
    try {
        const staleDrafts = await getStaleGeneratingDraftsByUser(env, chatId, 30);

        for (const draft of staleDrafts) {
            try {
                const { checkVideoStatus, downloadVideo } = await import('../integrations/heygen');
                const status = await checkVideoStatus(env, draft.heygen_video_id!);

                if (status.status === 'completed' && status.video_url) {
                    const { storeVideo } = await import('../data/storage');
                    const { data, contentType } = await downloadVideo(env, status.video_url);
                    const r2Key = await storeVideo(env, draft.id, data, contentType);

                    await updateVideoDraft(env, draft.id, chatId, {
                        status: 'completed',
                        video_url: r2Key,
                    });

                    const workerUrl = env.WORKER_URL!;
                    const mediaUrl = `${workerUrl}/media/${r2Key}`;
                    const caption = `${t(lang, 'notifications.videoReady')}\n\n${t(lang, 'notifications.videoReadyMsg')}`;
                    const buttons = [
                        [
                            { text: t(lang, 'notifications.btnPublish'), callback_data: `action:video_publish:${draft.id}` },
                            { text: t(lang, 'notifications.btnSchedule'), callback_data: `action:video_schedule:${draft.id}` },
                        ],
                        [{ text: t(lang, 'notifications.btnDelete'), callback_data: `action:video_delete:${draft.id}` }],
                        [{ text: t(lang, 'common.home'), callback_data: 'view:home' }],
                    ];

                    try {
                        await sendVideo(env, chatId, mediaUrl, caption, buttons);
                    } catch (videoSendErr) {
                        logError('Cron sendVideo failed, falling back to text:', videoSendErr instanceof Error ? videoSendErr.message : String(videoSendErr));
                        await sendMessage(env, chatId, caption, [
                            ...buttons.slice(0, -1),
                            [{ text: t(lang, 'notifications.btnViewDetails'), callback_data: `view:video_detail:${draft.id}` }],
                            [{ text: t(lang, 'common.home'), callback_data: 'view:home' }],
                        ]);
                    }
                } else if (status.status === 'failed') {
                    await updateVideoDraft(env, draft.id, chatId, { status: 'failed' });
                    await sendMessage(env, chatId,
                        t(lang, 'notifications.videoGenerationFailed').replace('{error}', status.error || 'Unknown error'),
                        [[{ text: t(lang, 'notifications.btnViewDraft'), callback_data: `view:video_detail:${draft.id}` }]]
                    );
                } else {
                    logInfo('Marking stale video as failed:', draft.id);
                    await updateVideoDraft(env, draft.id, chatId, { status: 'failed' });
                    await sendMessage(env, chatId,
                        t(lang, 'notifications.videoGenerationTimedOut'),
                        [[{ text: t(lang, 'notifications.btnViewDraft'), callback_data: `view:video_detail:${draft.id}` }]]
                    );
                }
            } catch (err) {
                logError('Stale video check error for draft:', draft.id, err instanceof Error ? err.message : String(err));
                await updateVideoDraft(env, draft.id, chatId, { status: 'failed' });
            }
        }
    } catch (error) {
        logError('checkUserStaleVideos error:', error instanceof Error ? error.message : String(error));
    }
}

/**
 * Publish scheduled videos for a specific user when scheduled_at <= NOW()
 * Called with already-hydrated env
 */
export async function publishUserScheduledVideos(env: Env, chatId: string, lang: Lang = 'en'): Promise<void> {
    try {
        const scheduled = await getScheduledVideoDraftsByUser(env, chatId);

        for (const draft of scheduled) {
            if (!draft.scheduled_at) continue;

            const scheduledTime = new Date(draft.scheduled_at.replace(' ', 'T') + (draft.scheduled_at.includes('Z') ? '' : 'Z'));
            if (scheduledTime > new Date()) continue;

            logInfo('Publishing scheduled video:', draft.id);

            try {
                const { publishVideoToTwitter } = await import('../services/video-publish');
                const twitterUrl = await publishVideoToTwitter(env, draft);

                await createVideoPublished(env, chatId, {
                    video_draft_id: draft.id,
                    repo_id: draft.repo_id || undefined,
                    twitter_url: twitterUrl || undefined,
                    caption: draft.caption || undefined,
                });

                await updateVideoDraft(env, draft.id, chatId, { status: 'published' });

                await sendMessage(env, chatId,
                    `${t(lang, 'notifications.scheduledVideoPublished')}\n\n${draft.title || 'Video'}\n${twitterUrl || t(lang, 'common.success')}`,
                    [[{ text: t(lang, 'common.home'), callback_data: 'view:home' }]]
                );
            } catch (err) {
                logError('Failed to publish scheduled video:', draft.id, err instanceof Error ? err.message : String(err));
                await sendMessage(env, chatId,
                    `${t(lang, 'notifications.scheduledVideoFailed')}\n\n${draft.title || 'Video'}\n\n${t(lang, 'notifications.videoReturnedToCompleted')}`,
                    [[{ text: t(lang, 'notifications.btnViewVideo'), callback_data: `view:video_detail:${draft.id}` }]]
                );
                await updateVideoDraft(env, draft.id, chatId, { status: 'completed' });
            }
        }
    } catch (error) {
        logError('publishUserScheduledVideos error:', error instanceof Error ? error.message : String(error));
    }
}

// Platform format helpers are imported from views/platform-toggle
