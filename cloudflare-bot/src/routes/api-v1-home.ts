/**
 * GET /api/v1/home — Aggregated Home screen payload (read-only)
 *
 * Returns everything the v2 webapp Home screen needs in one request:
 *  - scheduled:     ordered list of upcoming scheduled drafts
 *  - notifications: pre-draft indicators (commit events + repost candidates
 *                   that have NOT yet been turned into a draft)
 *  - counts:        draft status counts (for the Drafts hub)
 *  - isAdmin:       admin flag
 *
 * Composes existing DB reads only — no schema changes, no mutations, no bot sync.
 */

import type { DraftContent, PublishTargets } from '../types';
import {
    getScheduledDrafts,
    getDraftStatusCounts,
    getDraftSourceCounts,
    getPendingRepostCandidates,
} from '../data/db';
import { getPendingCommitEvents } from '../data/commit-events-db';
import { getTweetUrl } from '../integrations/x';
import { parsePublishTargets } from '../views/platform-toggle';
import type { ApiContext } from './api-v1';
import { jsonResponse, errorResponse } from './api-v1';

interface HomeScheduled {
    id: string;
    title: string;
    firstTweet: string;
    scheduledAt: string | null;
    format: string;
    targets: PublishTargets;
}

interface HomeNotification {
    kind: 'commit' | 'repost';
    id: string;
    title: string;
    preview: string;
    repo?: string;
    score?: number;
    // Deep-link seed payloads for the Composer:
    //  - commit notifications carry the commit SHA  → seed { kind: 'commit', sha }
    //  - repost notifications carry the tweet URL    → seed { kind: 'repost', url }
    sha?: string;
    url?: string;
}

export async function handleHomeApi(ctx: ApiContext): Promise<Response> {
    const { env, chatId, isAdmin } = ctx;

    if (ctx.request.method !== 'GET') {
        return errorResponse('Method Not Allowed', 405);
    }

    const [scheduledDrafts, counts, sourceCounts, commitEvents, repostCandidates] = await Promise.all([
        getScheduledDrafts(env, chatId),
        getDraftStatusCounts(env, chatId),
        getDraftSourceCounts(env, chatId),
        getPendingCommitEvents(env, chatId),
        getPendingRepostCandidates(env, chatId),
    ]);

    // ---- scheduled timeline ----
    const scheduled: HomeScheduled[] = [];
    for (const d of scheduledDrafts) {
        let firstTweet = d.pr_title;
        let format = 'single';
        try {
            const content = JSON.parse(d.content) as DraftContent;
            firstTweet = content.tweets[0]?.text || d.pr_title;
            format = content.format === 'single' ? 'single' : `thread-${content.tweets.length}`;
        } catch { /* fall back to pr_title / single */ }
        scheduled.push({
            id: d.id,
            title: d.pr_title,
            firstTweet,
            scheduledAt: d.scheduled_at,
            format,
            targets: parsePublishTargets(d.publish_targets),
        });
    }

    // ---- notifications: pre-draft commit events + repost candidates ----
    const notifications: HomeNotification[] = [];

    for (const ev of commitEvents) {
        notifications.push({
            kind: 'commit',
            id: ev.id,
            title: ev.title,
            preview: truncate(ev.title, 120),
            repo: shortRepo(ev),
            // Carry the commit SHA so Home can seed the Composer's `[+ commit]` flow.
            sha: ev.commit_sha || undefined,
        });
    }

    for (const tw of repostCandidates) {
        const preview = truncate(tw.text.replace(/\n/g, ' '), 120);
        notifications.push({
            kind: 'repost',
            id: tw.id,
            title: `@${tw.account_username}`,
            preview,
            score: tw.relevance_score ?? undefined,
            // Carry the tweet URL so Home can seed the Composer's repost flow.
            url: tw.tweet_url || getTweetUrl(tw.id),
        });
    }

    return jsonResponse({
        scheduled,
        notifications,
        counts: {
            // By status
            draft: counts['draft'] || 0,
            approved: counts['approved'] || 0,
            scheduled: counts['scheduled'] || 0,
            published: counts['published'] || 0,
            publishing: counts['publishing'] || 0,
            // By source/type ('auto' + 'commit' are both code-sourced → merged into "commit")
            commit: (sourceCounts['commit'] || 0) + (sourceCounts['auto'] || 0),
            repost: sourceCounts['repost'] || 0,
            handwrite: sourceCounts['handwrite'] || 0,
        },
        isAdmin,
    });
}

function truncate(s: string, max: number): string {
    if (s.length <= max) return s;
    return s.substring(0, max - 1).trimEnd() + '…';
}

/** Derive a "owner/repo" short label from a commit event's source data, if available. */
function shortRepo(ev: { source_data: string }): string | undefined {
    try {
        const src = JSON.parse(ev.source_data) as { repo?: string };
        if (src.repo) {
            // src.repo is "owner/name" — return as-is.
            return src.repo;
        }
    } catch { /* ignore */ }
    return undefined;
}
