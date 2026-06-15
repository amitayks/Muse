/**
 * Deferred X Video Post — every-minute cron processor
 *
 * Why this exists: an X VIDEO media object needs ~10–60s AFTER its chunked-upload STATUS
 * reaches "succeeded" before POST /2/tweets will accept it (images are attachable instantly).
 * The inline publish path (core/publish.ts) uploads the media within its ~30s waitUntil budget,
 * then ENQUEUES a row in x_pending_posts and leaves the draft in 'publishing'. A separate
 * every-minute cron tick ("* * * * *") runs processPendingXPosts here on a fresh ~30s budget,
 * retrying the tweet-creation (postThread/postQuoteTweet) over the already-uploaded media ids
 * until it succeeds or a bounded attempt budget is exhausted.
 *
 * On success it creates the published record, finalizes the draft, and notifies on Telegram
 * (mirroring publishUserDrafts in handlers/cron.ts). On give-up / non-retryable error it records
 * errors.x, finalizes the draft, and notifies failure.
 *
 * Idempotency: one row per draft (UNIQUE draft_id); each attempt re-reads the draft and
 * skips+deletes the row unless it is still 'publishing' with no published record yet — a lost
 * success or a duplicate tick cannot double-post.
 *
 * See openspec/changes/add-x-oauth2-media/design-deferred-video-post.md.
 */

import type { Env, PublishResults } from '../types';
import { XReconnectError } from '../integrations/x';
import { postResolvedX } from './publish';
import { hydrateEnv } from '../data/user-keys';
import {
    getDuePendingXPosts,
    reschedulePendingXPost,
    deletePendingXPost,
    BACKOFF_SECS,
    type XPendingRow,
    type PendingXPayload,
} from '../data/x-pending-db';
import {
    getDraft,
    getPublishedByPR,
    updateDraftPublishResults,
    updateDraftStatus,
    createPublished,
    getUserLanguage,
} from '../data/db';
import { sendMessage } from '../integrations/telegram';
import { syncBotMessage } from '../services/webapp-sync';
import { t, type Lang } from '../ui/strings';
import { platformEmoji, formatPlatformSummary } from '../views/platform-toggle';
import { logInfo, logError } from '../infra/security';

/**
 * True for the "Your media IDs are invalid" 400 — the signal that the video media is uploaded
 * and processed but not yet attachable. This is the retryable case (wait + try again).
 */
export function isMediaNotReadyError(error: unknown): boolean {
    const msg = (error instanceof Error ? error.message : String(error)).toLowerCase();
    return /media ids? (?:is|are) invalid/.test(msg);
}

/** True for transient 5xx surfaced by postTweet/postQuoteTweet ("X API error 5xx: …"). */
function isTransient5xx(error: unknown): boolean {
    const msg = error instanceof Error ? error.message : String(error);
    return /X API error 5\d\d:/.test(msg);
}

/**
 * Cron entry point ("* * * * *"): select due deferred X posts, group by user, hydrate the
 * per-user OAuth2 bearer ONCE, and process each user's rows in parallel (mirrors cronCoordinator).
 * Early-returns when nothing is due (the common case — a single indexed SELECT).
 */
export async function processPendingXPosts(env: Env): Promise<void> {
    const due = await getDuePendingXPosts(env, 10);
    if (due.length === 0) return;

    logInfo(`[x-pending] Processing ${due.length} deferred X post(s)`);

    // Group rows by chat_id so we hydrate each user's env exactly once.
    const byChat = new Map<string, XPendingRow[]>();
    for (const row of due) {
        const list = byChat.get(row.chat_id) || [];
        list.push(row);
        byChat.set(row.chat_id, list);
    }

    const results = await Promise.allSettled(
        Array.from(byChat.entries()).map(async ([chatId, rows]) => {
            const userEnv = await hydrateEnv(env, chatId);
            for (const row of rows) {
                try {
                    await runPendingXPost(userEnv, row);
                } catch (err) {
                    logError(`[x-pending] row ${row.draft_id} failed:`, err instanceof Error ? err.message : String(err));
                }
            }
        })
    );

    for (const r of results) {
        if (r.status === 'rejected') {
            logError('[x-pending] user batch failed:', r.reason instanceof Error ? r.reason.message : String(r.reason));
        }
    }
}

/**
 * Attempt one deferred X post. `env` is already hydrated for row.chat_id.
 * Retries on "media not ready" / transient 5xx until the attempt budget is exhausted;
 * finalizes (published + notify, or errors.x + notify) otherwise.
 */
export async function runPendingXPost(env: Env, row: XPendingRow): Promise<void> {
    const payload = JSON.parse(row.payload) as PendingXPayload;

    // Idempotency re-read: only act on a still-'publishing' draft with no published record yet.
    // Anything else (deleted, already published/reverted, double-tick) → drop the row, no post.
    const draft = await getDraft(env, payload.draftId, payload.chatId);
    if (!draft || draft.status !== 'publishing') {
        await deletePendingXPost(env, payload.draftId);
        return;
    }
    const existing = await getPublishedByPR(env, payload.chatId, payload.prNumber);
    if (existing.some(p => p.draft_id === payload.draftId)) {
        await deletePendingXPost(env, payload.draftId);
        return;
    }

    const attempt = row.attempts + 1;

    try {
        const xResult = await postResolvedX(env, payload.content, {
            source: payload.source,
            original_tweet_id: payload.originalTweetId,
            original_tweet_url: payload.originalTweetUrl,
        }, payload.media);

        await finalizeSuccess(env, payload, xResult);
        await deletePendingXPost(env, payload.draftId);
    } catch (error) {
        const retryable = isMediaNotReadyError(error) || isTransient5xx(error);
        const isAuth = error instanceof XReconnectError;

        if (retryable && !isAuth && attempt < row.max_attempts) {
            const delay = BACKOFF_SECS[Math.min(attempt - 1, BACKOFF_SECS.length - 1)];
            const msg = error instanceof Error ? error.message : String(error);
            await reschedulePendingXPost(env, payload.draftId, attempt, delay, msg);
            logInfo(`[x-pending] draft ${payload.draftId} retry ${attempt}/${row.max_attempts} in ${delay}s`);
            return;
        }

        // Terminal: out of attempts, auth error, or other non-retryable error.
        const giveUpError = (retryable && !isAuth)
            ? new Error('media_not_ready_timeout')
            : error;
        await finalizeFailure(env, payload, giveUpError, isAuth);
        await deletePendingXPost(env, payload.draftId);
    }
}

/**
 * On X success: merge IG + X results, write publish_results, create the published record,
 * set status 'published', notify the user (mirrors handlers/cron.ts publishUserDrafts).
 */
async function finalizeSuccess(
    env: Env,
    payload: PendingXPayload,
    xResult: { tweet_ids: string[]; url: string },
): Promise<void> {
    const results: PublishResults = {
        ...payload.igResults,
        x: xResult,
        x_pending: false,
    };

    await updateDraftPublishResults(env, payload.draftId, payload.chatId, results);

    const igResult = results.instagram_post || results.instagram_story || results.instagram_reel;
    await createPublished(env, payload.chatId, {
        draft_id: payload.draftId,
        pr_number: payload.prNumber,
        tweet_ids: xResult.tweet_ids.join(','),
        tweet_url: xResult.url,
        instagram_post_id: igResult?.post_id ?? null,
        instagram_url: (results.instagram_post?.url || results.instagram_reel?.url) ?? null,
    });
    await updateDraftStatus(env, payload.draftId, payload.chatId, 'published');

    await notify(env, payload, { success: true, url: xResult.url, results });
    logInfo(`[x-pending] draft ${payload.draftId} published: ${xResult.url}`);
}

/**
 * On X give-up / non-retryable error: record errors.x (+ needsXReconnect if auth), keep any
 * Instagram results, finalize draft status, notify failure. If Instagram succeeded the draft IS
 * published (X just failed); otherwise revert to 'approved' so the user can retry.
 */
async function finalizeFailure(
    env: Env,
    payload: PendingXPayload,
    error: unknown,
    isAuth: boolean,
): Promise<void> {
    const msg = isAuth ? 'needs_x_reconnect' : (error instanceof Error ? error.message : String(error));

    // Any non-X platform that published inline (Instagram OR LinkedIn) means the draft IS published.
    const nonXSucceeded = !!(payload.igResults.instagram_post || payload.igResults.instagram_story || payload.igResults.instagram_reel || payload.igResults.linkedin);
    const results: PublishResults = {
        ...payload.igResults,
        errors: { ...payload.igResults.errors, x: msg },
        x_pending: false,
    };
    if (isAuth) results.needsXReconnect = true;

    await updateDraftPublishResults(env, payload.draftId, payload.chatId, results);

    if (nonXSucceeded) {
        // A non-X platform is live → the draft is published (with an X error recorded).
        const igResult = results.instagram_post || results.instagram_story || results.instagram_reel;
        await createPublished(env, payload.chatId, {
            draft_id: payload.draftId,
            pr_number: payload.prNumber,
            tweet_ids: null,
            tweet_url: null,
            instagram_post_id: igResult?.post_id ?? null,
            instagram_url: (results.instagram_post?.url || results.instagram_reel?.url) ?? null,
        });
        await updateDraftStatus(env, payload.draftId, payload.chatId, 'published');
    } else {
        // X-only → back to approved so the user can retry.
        await updateDraftStatus(env, payload.draftId, payload.chatId, 'approved');
    }

    await notify(env, payload, { success: false, error: msg, results, needsXReconnect: isAuth });
    logError(`[x-pending] draft ${payload.draftId} X give-up: ${msg}`);
}

/**
 * Telegram notification mirroring handlers/cron.ts publishUserDrafts (success + failure shapes),
 * plus a webapp message sync. All best-effort — the draft is already finalized.
 */
async function notify(
    env: Env,
    payload: PendingXPayload,
    outcome: { success: boolean; url?: string; error?: string; results: PublishResults; needsXReconnect?: boolean },
): Promise<void> {
    try {
        const lang = (await getUserLanguage(env, payload.chatId)) as Lang;

        if (outcome.success) {
            const summary = formatPlatformSummary(outcome.results, lang);
            const hasErrors = outcome.results.errors && Object.keys(outcome.results.errors).length > 0;
            const title = hasErrors
                ? t(lang, 'notifications.scheduledPostPartial')
                : t(lang, 'notifications.scheduledPostPublished');
            let message = `${title}\n\n${payload.prTitle}\n\n${t(lang, 'notifications.publishedTo').replace('{summary}', summary)}`;
            if (hasErrors) {
                const errorSummary = Object.entries(outcome.results.errors!)
                    .map(([p, m]) => `${platformEmoji(p)} ${m}`)
                    .join(', ');
                message += `\n${t(lang, 'notifications.publishErrors').replace('{errors}', errorSummary)}`;
            }
            const buttons: Array<Array<{ text: string; callback_data?: string; url?: string }>> = [];
            if (outcome.url) buttons.push([{ text: '🔗 Open', url: outcome.url }]);
            buttons.push([
                { text: t(lang, 'notifications.btnView'), callback_data: `draft:${payload.draftId}` },
                { text: t(lang, 'notifications.btnDashboard'), callback_data: 'view:home' },
            ]);
            await sendMessage(env, payload.chatId, message, buttons).catch(() => {});
        } else {
            // needsXReconnect is recorded in publish_results (the webapp renders the reconnect
            // affordance); the Telegram notice surfaces the error + a drafts shortcut.
            const buttons = [[{ text: t(lang, 'notifications.btnViewDrafts'), callback_data: 'view:drafts' }]];
            const errLine = `${platformEmoji('x')} ${outcome.error}`;
            await sendMessage(
                env,
                payload.chatId,
                `${t(lang, 'notifications.scheduledPostFailed')}\n\n${payload.prTitle}\n\n${errLine}`,
                buttons,
            ).catch(() => {});
        }
    } catch (e) {
        logError('[x-pending] notify failed (non-fatal):', e instanceof Error ? e.message : String(e));
    }

    // Sync the bot's pinned draft message to the final state.
    try {
        await syncBotMessage(env, payload.chatId, payload.draftId);
    } catch { /* non-fatal */ }
}
