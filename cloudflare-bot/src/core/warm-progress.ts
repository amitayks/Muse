/**
 * Canonical mapping: pre-warmed `media_uploads` handles → `PublishProgress` slots.
 *
 * The single source of truth for HOW a warmed handle (one `media_uploads` row, keyed by
 * `(draft_id, media_key, platform)`) drops into the resumable `PublishProgress` map that `publishDraft`
 * already skips-if-present. Keeping this in one place guarantees the warm engine (core/media-prewarm.ts)
 * and the publish path (core/publish.ts) agree on the keying — so a warmed handle seeds the exact slot
 * the corresponding publish branch reads, and no warmed handle is ever mis-mapped to a "posted" marker.
 *
 * KEYING (must match what resolveXMedia / publishToIGPost / resolveLinkedInMedia expect):
 *
 *   X (progress.x.perTweetMediaIds[tweetIndex]):
 *     resolveXMedia resolves media PER TWEET — `perTweetMediaIds[i]` is the media_id array for tweet i
 *     (video-wins: a video tweet → [videoId]; else the photo ids in order, ≤4). So we re-apply that
 *     exact rule per tweet over the X-targeted media, substituting each media_key's warmed handle.
 *     A tweet is seeded ONLY if EVERY X-targeted media item on it has a ready handle (a partial tweet
 *     is left undefined so resolveXMedia uploads the whole tweet inline — never a half-warmed tweet).
 *
 *   LinkedIn (progress.linkedin.assetUrns):
 *     resolveLinkedInMedia attaches EITHER one video OR the targeted photos in thread order
 *     (video-wins). assetUrns is that ordered list of asset URNs. We seed it ONLY when every item of
 *     the chosen set (the lone video, or all targeted photos) has a ready handle — otherwise leave it
 *     unseeded so the branch uploads inline (avoids a partial multi-image post).
 *
 *   Instagram — NOT seeded into progress here. `progress.instagram_*` slots are POSTED markers in the
 *     current pipeline (a non-empty `progress.instagram_post.mediaIds` means "already published this
 *     post", not "container warmed"). A warmed IG handle is a FINISHED *container id*, which must be
 *     PUBLISHED (media_publish), not treated as posted. So warmed IG container ids are surfaced
 *     separately via `mapInstagramWarmHandles` for the IG branch (S5) to publish directly — they do
 *     NOT go through this progress-seed. Mixing them into progress.instagram_* would suppress the post.
 *
 * A row counts as a usable warmed handle only when status is 'ready', it has a non-null handle, and it
 * is outside the publish-time expiry safety margin (computed by the caller via isHandleUsableAtPublish).
 */

import type { DraftContent, PublishProgress, MediaWarmPlatform } from '../types';
import type { MediaUploadRow } from '../data/media-uploads-db';
import { isMediaTargeted, collectTargetedMedia } from './media-targets';

/**
 * Publish-time expiry safety margin (ms). A warmed handle within this window of its `expires_at` is
 * treated as NOT usable (re-upload inline) so a handle never expires mid-publish. Durable handles
 * (null expires_at, e.g. LinkedIn) have no margin. See design Decision 5 ("e.g., 30 min").
 */
export const PUBLISH_EXPIRY_SAFETY_MS = 30 * 60 * 1000;

/**
 * True iff a warm row is usable as a handle at publish time: 'ready', has a handle, and (if it has an
 * expiry) is more than the safety margin away from expiring. `now` defaults to Date.now() (override in
 * tests). The single predicate both the X/LinkedIn seeders and the IG mapper apply.
 */
export function isHandleUsableAtPublish(row: MediaUploadRow, now: number = Date.now()): boolean {
    if (row.status !== 'ready' || !row.handle) return false;
    if (row.expires_at === null) return true; // durable (LinkedIn)
    const expiresMs = Date.parse(row.expires_at);
    if (Number.isNaN(expiresMs)) return false; // unparseable expiry → treat as not usable (re-upload)
    return expiresMs - now > PUBLISH_EXPIRY_SAFETY_MS;
}

/** Index usable warm rows for one platform by media_key → handle. */
function usableHandlesByKey(rows: MediaUploadRow[], platform: MediaWarmPlatform, now: number): Map<string, string> {
    const map = new Map<string, string>();
    for (const row of rows) {
        if (row.platform !== platform) continue;
        if (!isHandleUsableAtPublish(row, now)) continue;
        if (row.handle) map.set(row.media_key, row.handle);
    }
    return map;
}

/**
 * Seed `progress` IN PLACE from the draft's usable warmed handles for X and LinkedIn, so the matching
 * publish branch skips its upload and posts directly. Instagram is intentionally NOT seeded here (see
 * the module doc / mapInstagramWarmHandles). Returns nothing — mutates `progress` like the publish
 * branches do. Idempotent: a slot already present in `progress` (from a prior chunk) is left untouched.
 *
 * Best-effort: a tweet / the LinkedIn set is seeded only when ALL its targeted items are usable, so a
 * partially-warmed unit falls back to inline upload rather than posting a half-warmed unit.
 */
export function seedProgressFromWarmHandles(
    content: DraftContent,
    rows: MediaUploadRow[],
    progress: PublishProgress,
    now: number = Date.now()
): void {
    seedXProgress(content, rows, progress, now);
    seedLinkedInProgress(content, rows, progress, now);
}

/** Seed progress.x.perTweetMediaIds from warmed X handles, applying resolveXMedia's per-tweet rule. */
function seedXProgress(content: DraftContent, rows: MediaUploadRow[], progress: PublishProgress, now: number): void {
    const byKey = usableHandlesByKey(rows, 'x', now);
    if (byKey.size === 0) return;

    const prior = progress.x ?? {};
    const perTweet: (string[] | null)[] = (prior.perTweetMediaIds ?? []).slice();

    content.tweets.forEach((tweet, index) => {
        if (perTweet[index] !== undefined) return; // already resolved in a prior chunk — never overwrite
        const items = (tweet.media || []).filter(m => isMediaTargeted(m, 'x'));
        if (items.length === 0) return; // text-only tweet — leave undefined (resolveXMedia sets null)

        // Video-wins: a video tweet resolves to exactly [videoHandle].
        const video = items.find(m => m.type === 'video');
        if (video) {
            const handle = byKey.get(video.key);
            if (!handle) return; // not warmed → leave undefined so resolveXMedia uploads inline
            perTweet[index] = [handle];
            return;
        }
        // Photos: up to 4, in order — seed only when EVERY targeted photo is warmed (no half-warmed tweet).
        const photos = items.filter(m => m.type === 'photo').slice(0, 4);
        const handles: string[] = [];
        for (const photo of photos) {
            const handle = byKey.get(photo.key);
            if (!handle) return; // a photo is missing a handle → upload the whole tweet inline
            handles.push(handle);
        }
        if (handles.length > 0) perTweet[index] = handles;
    });

    // Only attach if we actually seeded at least one tweet (else leave progress.x untouched).
    if (perTweet.some(slot => slot !== undefined)) {
        progress.x = { ...prior, perTweetMediaIds: perTweet };
    }
}

/** Seed progress.linkedin.assetUrns from warmed LinkedIn handles, applying resolveLinkedInMedia's rule. */
function seedLinkedInProgress(content: DraftContent, rows: MediaUploadRow[], progress: PublishProgress, now: number): void {
    if (progress.linkedin?.assetUrns?.length) return; // already resolved in a prior chunk
    const byKey = usableHandlesByKey(rows, 'linkedin', now);
    if (byKey.size === 0) return;

    const candidates = collectTargetedMedia(content.tweets, 'linkedin');

    // Video-wins: a lone targeted video → [videoUrn], only when warmed.
    const video = candidates.find(m => m.type === 'video');
    if (video) {
        const handle = byKey.get(video.key);
        if (handle) progress.linkedin = { assetUrns: [handle] };
        return;
    }
    // Photos in thread order — seed only when EVERY targeted photo is warmed (avoid a partial post).
    const photos = candidates.filter(m => m.type === 'photo');
    if (photos.length === 0) return;
    const urns: string[] = [];
    for (const photo of photos) {
        const handle = byKey.get(photo.key);
        if (!handle) return; // a photo missing a handle → upload all inline
        urns.push(handle);
    }
    if (urns.length > 0) progress.linkedin = { assetUrns: urns };
}

/**
 * The ordered list of warmed Instagram CONTAINER ids for a given IG platform, in thread order — the
 * canonical input for the IG publish branch (S5) to publish directly (media_publish) instead of
 * creating+processing containers inline. Returned separately from `progress` because IG progress slots
 * are posted-markers, not container slots (see module doc). Each entry pairs the source media item with
 * its warmed container id; an item with no usable handle is omitted, so the caller can detect a fully-
 * vs partially-warmed set (all items present ⇒ post-only; otherwise fall back to inline).
 */
export interface InstagramWarmHandle {
    mediaKey: string;
    type: 'photo' | 'video';
    containerId: string;
}

export function mapInstagramWarmHandles(
    content: DraftContent,
    rows: MediaUploadRow[],
    platform: 'instagram_post' | 'instagram_story' | 'instagram_reel',
    now: number = Date.now()
): InstagramWarmHandle[] {
    const byKey = usableHandlesByKey(rows, platform, now);
    if (byKey.size === 0) return [];
    const out: InstagramWarmHandle[] = [];
    for (const media of collectTargetedMedia(content.tweets, platform)) {
        const containerId = byKey.get(media.key);
        if (containerId) out.push({ mediaKey: media.key, type: media.type, containerId });
    }
    return out;
}
