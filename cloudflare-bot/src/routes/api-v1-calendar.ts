/**
 * GET /api/v1/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD — content-calendar feed (read-only)
 *
 * Returns the authenticated user's posts within a date window so the webapp's calendar
 * scheduling picker can render a month at a glance: future **scheduled** drafts and past
 * **published** posts, both as timezone-agnostic UTC instants the webapp positions in the
 * user's configured offset.
 *
 * `from`/`to` are LOCAL calendar dates in the user's `users.timezone` (same wall-clock contract
 * as the schedule input). The backend expands them to a UTC window and runs two scoped reads —
 * no schema changes, no mutations, no bot sync.
 */

import type { DraftContent, PublishTargets } from '../types';
import { getScheduledDraftsInRange, getPublishedInRange, getTimezone } from '../data/db';
import { localDateRangeToUTC } from '../infra/timezone';
import { parsePublishTargets } from '../views/platform-toggle';
import type { ApiContext } from './api-v1';
import { jsonResponse, errorResponse } from './api-v1';

interface CalendarItem {
    id: string;
    kind: 'scheduled' | 'published';
    at: string;            // ISO-ish UTC instant (scheduled_at / published_at)
    title: string;
    firstTweet: string;
    format: string;        // 'single' | `thread-${n}`
    targets: PublishTargets;
    draftId: string;
    url?: string;          // permalink, published items only
}

/** Defensive cap per window — a heavy poster could otherwise return an unbounded month. */
const WINDOW_CAP = 500;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function handleCalendarApi(ctx: ApiContext): Promise<Response> {
    const { env, chatId } = ctx;

    if (ctx.request.method !== 'GET') {
        return errorResponse('Method Not Allowed', 405);
    }

    const url = new URL(ctx.request.url);
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');
    if (!from || !to || !DATE_RE.test(from) || !DATE_RE.test(to)) {
        return errorResponse('from and to (YYYY-MM-DD) are required', 400);
    }

    const tz = await getTimezone(env, chatId);
    const { fromUTC, toUTC } = localDateRangeToUTC(from, to, tz);

    // Fetch one past the cap so we can detect (and log) truncation.
    const [scheduled, published] = await Promise.all([
        getScheduledDraftsInRange(env, chatId, fromUTC, toUTC, WINDOW_CAP + 1),
        getPublishedInRange(env, chatId, fromUTC, toUTC, WINDOW_CAP + 1),
    ]);

    if (scheduled.length > WINDOW_CAP || published.length > WINDOW_CAP) {
        console.warn(`[calendar] window ${from}..${to} truncated for ${chatId}: scheduled=${scheduled.length} published=${published.length} cap=${WINDOW_CAP}`);
    }

    const items: CalendarItem[] = [];

    for (const d of scheduled.slice(0, WINDOW_CAP)) {
        if (!d.scheduled_at) continue;
        const { firstTweet, format } = describeContent(d.content, d.pr_title);
        items.push({
            id: d.id,
            kind: 'scheduled',
            at: d.scheduled_at,
            title: d.pr_title,
            firstTweet,
            format,
            targets: parsePublishTargets(d.publish_targets),
            draftId: d.id,
        });
    }

    for (const p of published.slice(0, WINDOW_CAP)) {
        const title = p.pr_title || (p.pr_number ? `PR #${p.pr_number}` : 'Published post');
        const { firstTweet, format } = describeContent(p.content, title);
        items.push({
            id: p.id,
            kind: 'published',
            at: p.published_at,
            title,
            firstTweet,
            format,
            targets: parsePublishTargets(p.publish_targets),
            draftId: p.draft_id,
            url: p.tweet_url || p.instagram_url || undefined,
        });
    }

    // Sort the merged feed chronologically; the webapp buckets by day in the user's offset.
    items.sort((a, b) => a.at.localeCompare(b.at));

    return jsonResponse({ items });
}

/** Extract the first-tweet preview and thread format from a draft/published content JSON blob. */
function describeContent(content: string | null, fallbackTitle: string): { firstTweet: string; format: string } {
    if (!content) return { firstTweet: fallbackTitle, format: 'single' };
    try {
        const parsed = JSON.parse(content) as DraftContent;
        const firstTweet = parsed.tweets?.[0]?.text || fallbackTitle;
        const format = parsed.format === 'single' ? 'single' : `thread-${parsed.tweets?.length ?? 1}`;
        return { firstTweet, format };
    } catch {
        return { firstTweet: fallbackTitle, format: 'single' };
    }
}
