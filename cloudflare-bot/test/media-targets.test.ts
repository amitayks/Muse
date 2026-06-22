/**
 * Tests for per-media platform targeting (core/media-targets.ts) — the single source of truth the
 * publish branches use to decide which media reaches each platform.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isMediaTargeted, collectTargetedMedia } from '../src/core/media-targets.ts';
import type { TweetMedia } from '../src/types.ts';

const photo = (key: string, targets?: TweetMedia['targets']): TweetMedia => ({ key, type: 'photo', targets });
const video = (key: string, targets?: TweetMedia['targets']): TweetMedia => ({ key, type: 'video', targets });

test('absent targets ⇒ targeted to every platform', () => {
  const m = photo('a');
  for (const p of ['x', 'instagram_post', 'instagram_story', 'instagram_reel', 'linkedin'] as const) {
    assert.equal(isMediaTargeted(m, p), true, `${p} should default true`);
  }
});

test('explicit false excludes only that platform; others still default true', () => {
  const m = photo('a', { linkedin: false });
  assert.equal(isMediaTargeted(m, 'linkedin'), false);
  assert.equal(isMediaTargeted(m, 'x'), true);
  assert.equal(isMediaTargeted(m, 'instagram_post'), true);
});

test('collectTargetedMedia: Instagram Post gathers photos AND videos in thread order', () => {
  const tweets = [
    { media: [video('v1')] },
    { media: [photo('p1'), photo('p2')] },
  ];
  const got = collectTargetedMedia(tweets, 'instagram_post').map(m => m.key);
  assert.deepEqual(got, ['v1', 'p1', 'p2']);
});

test('collectTargetedMedia: LinkedIn excludes the untargeted video, keeps targeted photos', () => {
  // The reported bug shape: a video + images, but the video is NOT targeted to LinkedIn.
  const tweets = [
    { media: [video('v1', { linkedin: false })] },
    { media: [photo('p1'), photo('p2')] },
  ];
  const got = collectTargetedMedia(tweets, 'linkedin');
  assert.deepEqual(got.map(m => m.key), ['p1', 'p2']);
  assert.equal(got.some(m => m.type === 'video'), false);
});

test('collectTargetedMedia: video-wins still applies when both are targeted to LinkedIn', () => {
  const tweets = [{ media: [video('v1'), photo('p1')] }];
  const got = collectTargetedMedia(tweets, 'linkedin');
  // The helper returns both; the resolver applies "video wins" — assert the video is present so the
  // branch can prefer it, and the photo is present so the branch can count what it skips.
  assert.deepEqual(got.map(m => m.type), ['video', 'photo']);
});

test('collectTargetedMedia: a tweet with no media contributes nothing', () => {
  const tweets = [{ media: [photo('p1')] }, {}, { media: [photo('p2', { instagram_post: false })] }];
  assert.deepEqual(collectTargetedMedia(tweets, 'instagram_post').map(m => m.key), ['p1']);
});
