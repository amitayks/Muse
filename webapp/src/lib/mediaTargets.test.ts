import { describe, it, expect } from 'vitest';
import { isMediaTargeted, withTarget, MEDIA_PLATFORMS, type MediaPlatform } from './mediaTargets';
import type { TweetMedia } from '../types/draft';

describe('mediaTargets (webapp)', () => {
  it('absent targets ⇒ active on every platform (pills default on)', () => {
    const m: TweetMedia = { key: 'a', type: 'photo' };
    for (const p of MEDIA_PLATFORMS) expect(isMediaTargeted(m, p)).toBe(true);
  });

  it('withTarget sets one platform without disturbing the others', () => {
    const t1 = withTarget(undefined, 'linkedin', false);
    expect(t1).toEqual({ linkedin: false });
    const t2 = withTarget(t1, 'x', false);
    expect(t2).toEqual({ linkedin: false, x: false });
    // isMediaTargeted reflects the changes; untouched platforms still default true
    const m: TweetMedia = { key: 'a', type: 'photo', targets: t2 };
    expect(isMediaTargeted(m, 'linkedin')).toBe(false);
    expect(isMediaTargeted(m, 'x')).toBe(false);
    expect(isMediaTargeted(m, 'instagram_post')).toBe(true);
  });

  it('pill row: ALL connected platforms render; active = draft-enabled AND media-targeted', () => {
    // Connected: X + Instagram (all three). Draft currently targets X + IG Post only.
    const connected: MediaPlatform[] = ['x', 'instagram_post', 'instagram_story', 'instagram_reel'];
    const enabled: Partial<Record<MediaPlatform, boolean>> = { x: true, instagram_post: true };
    // This media is excluded from X but otherwise default (all-on).
    const media: TweetMedia = { key: 'a', type: 'photo', targets: { x: false } };

    const pills = connected.map((p) => ({ platform: p, active: !!enabled[p] && isMediaTargeted(media, p) }));
    expect(pills).toEqual([
      { platform: 'x', active: false },             // enabled but media excluded
      { platform: 'instagram_post', active: true }, // enabled and targeted
      { platform: 'instagram_story', active: false }, // shown but not a destination yet
      { platform: 'instagram_reel', active: false },  // shown but not a destination yet
    ]);
  });
});
