/**
 * Durable publish-job queue — every-minute cron processor
 *
 * Why this exists: a publish (multi-platform, possibly multi-video) can exceed one Worker budget
 * (~30s). Running publishDraft inline risks a hard-cancel that orphans the draft in 'publishing'
 * with empty publish_results. Instead, entry points enqueue a row in publish_jobs (data/publish-jobs-db.ts)
 * and this processor runs publishDraft on a FRESH ~30s budget each tick, persisting partial `progress`
 * between ticks so a heavy publish completes across multiple ticks without re-uploading media or
 * double-posting — giving effectively unbounded total budget.
 *
 * This generalizes the deferred-X-video pattern (core/x-pending.ts) into a per-draft publish queue.
 * The two queues are orthogonal: when publishDraft finishes an X-video upload it still enqueues
 * x_pending_posts for the tweet-creation wait and returns deferredX; this processor completes its
 * own upload/post work and lets the x_pending processor finalize X later.
 *
 * Each run claims due jobs with a lease (so overlapping ticks / the inline first chunk never process
 * the same job concurrently), computes a soft deadline, and calls publishDraft(env, chatId, draft,
 * progress, deadline). Outcomes:
 *   - done && success:   publishDraft already finalized status + published record → send the single
 *                        rich publish notification (moved here from the entry points) → delete job.
 *   - done && deferredX: the upload/post work is complete; X is handled later by x_pending → delete
 *                        job WITHOUT a premature 'published' notification (mirrors deferred-X UX).
 *   - done && !success:  all platforms failed → restore prior_status, notify failure, delete job.
 *   - !done (needs-more):persist progress and leave the row due so the next tick resumes.
 *   - thrown error:      reschedule with backoff; on attempts >= max_attempts → fail (dead-letter)
 *                        + restore prior_status + dead-letter notification.
 *
 * Idempotency: one row per draft (PK draft_id); each run re-reads the draft and skips/deletes the
 * row unless it is still 'publishing' with no published record yet — a lost success or a duplicate
 * tick cannot double-post. See openspec/changes/durable-publish-queue/design.md.
 */

import type { Env, Draft } from '../types';
import { publishDraft, type PublishResult } from './publish';
import { hydrateEnv } from '../data/user-keys';
import {
    claimDuePublishJobs,
    claimPublishJob,
    saveProgressAndRequeue,
    reschedulePublishJob,
    failPublishJob,
    deletePublishJob,
    type PublishJobRow,
} from '../data/publish-jobs-db';
import {
    getDraft,
    getPublishedByPR,
    updateDraftStatus,
    getTimezone,
} from '../data/db';
import { sendMessage } from '../integrations/telegram';
import { syncBotMessage } from '../services/webapp-sync';
import { t, type Lang } from '../ui/strings';
import { platformEmoji, formatPlatformSummary } from '../views/platform-toggle';
import { formatLocalTime } from '../infra/timezone';
import { logInfo, logError } from '../infra/security';

/** Soft per-tick budget for publishDraft — well under the ~30s wall-clock so progress persists. */
const SOFT_DEADLINE_MS = 18000;

/**
 * Soft budget for the inline first chunk kicked from a request-context entry point via waitUntil.
 * Same conservative cap as the cron tick: a light post finishes here; a heavy post returns
 * needs-more and the * * * * * processor continues it. Exported so entry points share one value.
 */
export const INLINE_DEADLINE_MS = SOFT_DEADLINE_MS;

/**
 * Cron entry point ("* * * * *"): claim due publish jobs (lease), group by user, hydrate the
 * per-user env ONCE, and process each user's jobs (mirrors processPendingXPosts / cronCoordinator).
 * Early-returns when nothing is due (the common case — a single conditional UPDATE that claims none).
 */
export async function processPublishJobs(env: Env): Promise<void> {
    const due = await claimDuePublishJobs(env, 5);
    if (due.length === 0) return;

    logInfo(`[publish-jobs] Processing ${due.length} publish job(s)`);

    // Group claimed jobs by chat_id so we hydrate each user's env exactly once.
    const byChat = new Map<string, PublishJobRow[]>();
    for (const row of due) {
        const list = byChat.get(row.chat_id) || [];
        list.push(row);
        byChat.set(row.chat_id, list);
    }

    const results = await Promise.allSettled(
        Array.from(byChat.entries()).map(async ([chatId, rows]) => {
            const userEnv = await hydrateEnv(env, chatId);
            const deadline = Date.now() + SOFT_DEADLINE_MS;
            for (const row of rows) {
                try {
                    await runPublishJob(userEnv, row, deadline);
                } catch (err) {
                    logError(`[publish-jobs] row ${row.draft_id} failed:`, err instanceof Error ? err.message : String(err));
                }
            }
        })
    );

    for (const r of results) {
        if (r.status === 'rejected') {
            logError('[publish-jobs] user batch failed:', r.reason instanceof Error ? r.reason.message : String(r.reason));
        }
    }
}

/**
 * Process exactly one publish job by draft id — used by the inline first-chunk waitUntil from the
 * request-context entry points so light posts finish without waiting for the next cron tick. It
 * atomically CLAIMS (leases) the row itself, so this inline pass and a concurrent cron tick never
 * work the same row: whichever side flips it out of 'pending' wins; the other gets null and no-ops.
 * `deadline` is the soft budget (epoch ms).
 */
export async function processPublishJobOnce(env: Env, draftId: string, deadline: number): Promise<void> {
    const row = await claimPublishJob(env, draftId);
    if (!row) return; // missing, already claimed elsewhere, or terminal — nothing to do inline.

    const userEnv = await hydrateEnv(env, row.chat_id);
    try {
        await runPublishJob(userEnv, row, deadline);
    } catch (err) {
        logError(`[publish-jobs] inline row ${row.draft_id} failed:`, err instanceof Error ? err.message : String(err));
    }
}

/**
 * Run one publish job. `env` is already hydrated for row.chat_id. Advances the publish as far as the
 * soft `deadline` allows, persisting progress, and reschedules (transient) or finalizes (done) the job.
 */
async function runPublishJob(env: Env, row: PublishJobRow, deadline: number): Promise<void> {
    const lang = (row.lang || 'en') as Lang;

    // Idempotency re-read: only act on a still-'publishing' draft with no published record yet.
    // Anything else (deleted, already published/reverted, double-tick) → drop the row, no publish.
    const draft = await getDraft(env, row.draft_id, row.chat_id);
    if (!draft || draft.status !== 'publishing') {
        await deletePublishJob(env, row.draft_id);
        return;
    }
    const existing = await getPublishedByPR(env, row.chat_id, draft.pr_number);
    if (existing.some(p => p.draft_id === row.draft_id)) {
        await deletePublishJob(env, row.draft_id);
        return;
    }

    const progress = row.progress ? JSON.parse(row.progress) : {};
    const attempt = row.attempts + 1;

    let result: PublishResult;
    try {
        result = await publishDraft(env, row.chat_id, draft, progress, deadline);
    } catch (error) {
        // publishDraft threw (e.g. malformed content, or an unwrapped failure). Reschedule with
        // backoff; dead-letter once the attempt budget is exhausted.
        const msg = error instanceof Error ? error.message : String(error);
        if (attempt < row.max_attempts) {
            await reschedulePublishJob(env, row.draft_id, attempt, msg);
            logInfo(`[publish-jobs] draft ${row.draft_id} retry ${attempt}/${row.max_attempts} after throw`);
            return;
        }
        await failPublishJob(env, row.draft_id, msg);
        await restorePriorStatus(env, draft, row);
        await notifyFailure(env, draft, lang, msg, false, true);
        logError(`[publish-jobs] draft ${row.draft_id} dead-lettered (throw): ${msg}`);
        return;
    }

    // Needs more: budget hit mid-upload. Persist progress AND requeue the row to 'pending' (due now)
    // so the next tick re-claims and resumes from exactly where this stopped. Does NOT count as an
    // attempt — chunking a large publish must never dead-letter it. (A run that is hard-cancelled
    // before reaching here is recovered separately via the claim's stale-lease reclaim.)
    if (!result.done) {
        await saveProgressAndRequeue(env, row.draft_id, result.progress);
        logInfo(`[publish-jobs] draft ${row.draft_id} needs more — progress persisted, requeued for next tick`);
        return;
    }

    // Deferred X video: publishDraft uploaded the media and enqueued x_pending_posts; the X tweet is
    // posted later by the x_pending processor, which sends the final notification. This job's work is
    // complete — delete it WITHOUT a premature 'published' notification (mirrors deferred-X UX).
    if (result.deferredX) {
        await deletePublishJob(env, row.draft_id);
        logInfo(`[publish-jobs] draft ${row.draft_id}: X video post deferred to x-pending processor`);
        return;
    }

    // All platforms failed: publishDraft already wrote results and reverted a scheduled draft to
    // 'approved'. Restore the prior status defensively, notify failure, delete the job.
    if (!result.success) {
        await restorePriorStatus(env, draft, row);
        await notifyFailure(env, draft, lang, formatErrors(result), result.results.needsInstagramReconnect);
        await deletePublishJob(env, row.draft_id);
        logError(`[publish-jobs] draft ${row.draft_id}: all platforms failed`);
        return;
    }

    // Terminal success: publishDraft already created the published record and set status 'published'.
    // Send the single rich publish notification (moved here from the entry points), then delete.
    await notifySuccess(env, draft, lang, result);
    await deletePublishJob(env, row.draft_id);
    logInfo(`[publish-jobs] draft ${row.draft_id} published: ${result.url}`);
}

/**
 * Restore the draft to its prior status on failure. Uses the job's captured prior_status when it is
 * approved/scheduled; otherwise falls back to 'scheduled' if scheduled_at is still in the future else
 * 'approved'. publishDraft may already have reverted a scheduled draft to 'approved'; this is the
 * defensive backstop so a draft never orphans in 'publishing'.
 */
async function restorePriorStatus(env: Env, draft: Draft, row: PublishJobRow): Promise<void> {
    const future = !!draft.scheduled_at && new Date(draft.scheduled_at.replace(' ', 'T')) > new Date();
    let next: 'scheduled' | 'approved';
    if (row.prior_status === 'scheduled' || row.prior_status === 'approved') {
        next = row.prior_status === 'scheduled' && future ? 'scheduled' : 'approved';
    } else {
        next = future ? 'scheduled' : 'approved';
    }
    await updateDraftStatus(env, draft.id, draft.chat_id, next).catch(() => {});
}

/** Comma-join the per-platform errors for a failure notification. */
function formatErrors(result: PublishResult): string {
    return Object.entries(result.results.errors || {})
        .map(([p, msg]) => `${platformEmoji(p)} ${msg}`)
        .join('\n');
}

/**
 * Telegram success notification mirroring handlers/cron.ts publishUserDrafts (the canonical
 * scheduled-path notification): title (full vs partial), platform summary, errors, and action
 * buttons. Plus a webapp message sync. All best-effort — the draft is already finalized.
 */
async function notifySuccess(env: Env, draft: Draft, lang: Lang, result: PublishResult): Promise<void> {
    try {
        const tz = await getTimezone(env, draft.chat_id);
        const publishTime = formatLocalTime(new Date().toISOString(), tz);
        const summary = formatPlatformSummary(result.results, lang);
        const hasErrors = result.results.errors && Object.keys(result.results.errors).length > 0;
        const title = hasErrors
            ? t(lang, 'notifications.scheduledPostPartial')
            : t(lang, 'notifications.scheduledPostPublished');

        let message = `${title}\n\n` +
            `${draft.pr_title}\n` +
            `${t(lang, 'notifications.publishedAt').replace('{time}', publishTime)}\n\n` +
            `${t(lang, 'notifications.publishedTo').replace('{summary}', summary)}`;

        if (hasErrors) {
            const errorSummary = Object.entries(result.results.errors!)
                .map(([p, msg]) => `${platformEmoji(p)} ${msg}`)
                .join(', ');
            message += `\n${t(lang, 'notifications.publishErrors').replace('{errors}', errorSummary)}`;
        }

        const buttons: Array<Array<{ text: string; callback_data?: string; url?: string }>> = [];
        if (result.results.needsInstagramReconnect) {
            buttons.push([{ text: t(lang, 'notifications.btnReconnectInstagram'), callback_data: 'settings:update:instagram' }]);
        }
        if (result.url) buttons.push([{ text: '🔗 Open', url: result.url }]);
        buttons.push([
            { text: t(lang, 'notifications.btnView'), callback_data: `draft:${draft.id}` },
            { text: t(lang, 'notifications.btnDashboard'), callback_data: 'view:home' },
        ]);

        await sendMessage(env, draft.chat_id, message, buttons).catch(() => {});
    } catch (e) {
        logError('[publish-jobs] success notify failed (non-fatal):', e instanceof Error ? e.message : String(e));
    }

    try {
        await syncBotMessage(env, draft.chat_id, draft.id);
    } catch { /* non-fatal */ }
}

/**
 * Telegram failure / dead-letter notification mirroring handlers/cron.ts publishUserDrafts: title,
 * per-platform errors, a "returned to approved" hint, and action buttons. Plus a webapp sync.
 * `deadLettered` distinguishes the attempts-exhausted dead-letter (a clearer "kept failing" title)
 * from a normal all-platform failure.
 */
async function notifyFailure(
    env: Env,
    draft: Draft,
    lang: Lang,
    errorMessages: string,
    needsInstagramReconnect?: boolean,
    deadLettered?: boolean,
): Promise<void> {
    try {
        const failButtons: Array<Array<{ text: string; callback_data: string }>> = [];
        if (needsInstagramReconnect) {
            failButtons.push([{ text: t(lang, 'notifications.btnReconnectInstagram'), callback_data: 'settings:update:instagram' }]);
        }
        failButtons.push([{ text: t(lang, 'notifications.btnViewDrafts'), callback_data: 'view:drafts' }]);

        const body = errorMessages
            ? `${draft.pr_title}\n\n${errorMessages}\n\n${t(lang, 'notifications.draftReturnedToApproved')}`
            : `${draft.pr_title}\n\n${t(lang, 'notifications.draftReturnedToApproved')}`;

        const title = deadLettered
            ? t(lang, 'notifications.publishJobFailed')
            : t(lang, 'notifications.scheduledPostFailed');

        await sendMessage(
            env,
            draft.chat_id,
            `${title}\n\n${body}`,
            failButtons,
        ).catch(() => {});
    } catch (e) {
        logError('[publish-jobs] failure notify failed (non-fatal):', e instanceof Error ? e.message : String(e));
    }

    try {
        await syncBotMessage(env, draft.chat_id, draft.id);
    } catch { /* non-fatal */ }
}
