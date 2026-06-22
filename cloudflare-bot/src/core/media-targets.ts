/**
 * Per-media platform targeting resolver.
 *
 * The ONLY place defaulting happens, so every publish branch agrees on the semantics: a media item
 * with no `targets` (existing drafts, bot/auto-generated media, freshly generated images) — or with
 * a specific platform key absent — is treated as targeted to that platform. This is what makes the
 * feature backward compatible with zero data migration: absent ⇒ goes everywhere, exactly as before.
 */
import type { TweetMedia, MediaTargets } from '../types';

export type MediaPlatform = keyof MediaTargets;

/** True iff `media` should attach to `platform`. Absent targets / absent key ⇒ true. */
export function isMediaTargeted(media: Pick<TweetMedia, 'targets'>, platform: MediaPlatform): boolean {
    return media.targets?.[platform] ?? true;
}

/** All media across the thread targeted to `platform`, in tweet order (used by the IG/LinkedIn branches). */
export function collectTargetedMedia(
    tweets: ReadonlyArray<{ media?: TweetMedia[] }>,
    platform: MediaPlatform
): TweetMedia[] {
    return tweets.flatMap(t => (t.media ?? []).filter(m => isMediaTargeted(m, platform)));
}
