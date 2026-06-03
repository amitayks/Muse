/**
 * GET /api/v1/dashboard — status counts and next scheduled draft
 */

import type { DraftContent } from '../types';
import { getDraftStatusCounts, getNextScheduledDraft } from '../data/db';
import { getUser } from '../data/user-db';
import type { ApiContext } from './api-v1';
import { jsonResponse } from './api-v1';

export async function handleDashboardApi(ctx: ApiContext): Promise<Response> {
    const { env, chatId, isAdmin } = ctx;

    const [counts, nextDraft, user] = await Promise.all([
        getDraftStatusCounts(env, chatId),
        getNextScheduledDraft(env, chatId),
        getUser(env, chatId),
    ]);

    let nextScheduled = null;
    if (nextDraft) {
        try {
            const content = JSON.parse(nextDraft.content) as DraftContent;
            nextScheduled = {
                id: nextDraft.id,
                title: nextDraft.pr_title,
                firstTweet: content.tweets[0]?.text || nextDraft.pr_title,
                scheduledAt: nextDraft.scheduled_at,
                format: content.format === 'single' ? 'single' : `thread-${content.tweets.length}`,
            };
        } catch { /* skip if content parse fails */ }
    }

    return jsonResponse({
        counts: {
            draft: counts['draft'] || 0,
            approved: counts['approved'] || 0,
            scheduled: counts['scheduled'] || 0,
            published: counts['published'] || 0,
        },
        nextScheduled,
        isAdmin,
        language: user?.language || 'en',
        timezone: user?.timezone || 'UTC',
    });
}
