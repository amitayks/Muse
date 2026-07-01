/**
 * Stable tweet identity helpers.
 *
 * Media binds to a tweet's stable `id` (see openspec change `server-authoritative-media`,
 * Decision 1), not its array index — so a media-non-destructive content save can reconcile
 * incoming tweets to stored tweets by id across reorder/insert/delete.
 *
 * Ids live INSIDE `content.tweets[i].id` (the `content` JSON), so there is no DB migration:
 *   - New drafts get ids when content is first built (createDraft).
 *   - Legacy id-less drafts are backfilled lazily and idempotently — on read-for-edit
 *     (getDraftDetail) and persisted on the next write.
 *
 * Workers crypto (`crypto.randomUUID`) is always available — do NOT use Math.random.
 */

import type { DraftContent } from '../types';

/** A fresh short, opaque tweet id (sliced uuid). */
export function newTweetId(): string {
    return crypto.randomUUID().slice(0, 8);
}

/**
 * Assign a stable `id` to any tweet missing one (or carrying a duplicate). Idempotent: content
 * whose tweets all already have unique ids is returned UNCHANGED (same reference), so repeated
 * reads/writes converge. Returns a shallow-cloned content (and cloned tweets) only when something
 * actually changed, leaving the caller's input untouched.
 */
export function ensureTweetIds(content: DraftContent): DraftContent {
    if (!content?.tweets?.length) return content;

    let changed = false;
    const seen = new Set<string>();
    const tweets = content.tweets.map(t => {
        if (t.id && !seen.has(t.id)) {
            seen.add(t.id);
            return t;
        }
        let id = newTweetId();
        while (seen.has(id)) id = newTweetId();
        seen.add(id);
        changed = true;
        return { ...t, id };
    });

    return changed ? { ...content, tweets } : content;
}

/**
 * Parse a `content` JSON string, assign-if-missing tweet ids, and re-stringify. Returns the
 * id-bearing JSON string, or the original string unchanged when it can't be parsed as content
 * (defensive — content is always well-formed DraftContent JSON in practice).
 */
export function ensureTweetIdsInJson(contentJson: string): string {
    try {
        const parsed = JSON.parse(contentJson) as DraftContent;
        const withIds = ensureTweetIds(parsed);
        return withIds === parsed ? contentJson : JSON.stringify(withIds);
    } catch {
        return contentJson;
    }
}
