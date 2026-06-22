/**
 * Per-media platform targeting helpers (webapp mirror of cloudflare-bot/src/core/media-targets.ts).
 * Absent `targets` / absent key ⇒ targeted, so media with no explicit targeting shows every enabled
 * platform pill as active and publishes everywhere — matching the bot's resolver exactly.
 */
import type { TweetMedia, MediaTargets } from '../types/draft';

export type MediaPlatform = keyof MediaTargets;

/** The five platform keys, in display order (X · IG Post · Story · Reel · LinkedIn). */
export const MEDIA_PLATFORMS: MediaPlatform[] = ['x', 'instagram_post', 'instagram_story', 'instagram_reel', 'linkedin'];

/** True iff `media` should attach to `platform`. Absent targets / absent key ⇒ true. */
export function isMediaTargeted(media: Pick<TweetMedia, 'targets'>, platform: MediaPlatform): boolean {
  return media.targets?.[platform] ?? true;
}

/** Return a new `targets` object with `platform` set to `next` (preserving other keys). */
export function withTarget(targets: MediaTargets | undefined, platform: MediaPlatform, next: boolean): MediaTargets {
  return { ...(targets ?? {}), [platform]: next };
}
