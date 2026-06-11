/**
 * Client-side validation of a selected video against X (Twitter) tweet-video spec.
 *
 * WHY: X rejects out-of-spec video at POST /2/tweets ("Your media IDs are invalid").
 * We do a quick metadata-only check at selection time so the user knows to convert the
 * file first (with a separate local tool) instead of discovering the failure on publish.
 *
 * X tweet-video spec: <=1920x1200, <=60fps, H.264/AAC, <=140s.
 *
 * NOTE: frame rate (<=60fps) canNOT be reliably detected in the browser — HTMLVideoElement
 * exposes no fps. So fps is NOT checked here. The user-facing message must still state the
 * full spec (<=1920x1200, <=60fps) so users know to convert high-fps recordings.
 */

/** Max X tweet-video dimensions (px) and duration (seconds). */
export const X_VIDEO_MAX_WIDTH = 1920;
export const X_VIDEO_MAX_HEIGHT = 1200;
export const X_VIDEO_MAX_DURATION_SEC = 140;

export interface VideoValidationResult {
  ok: boolean;
  width?: number;
  height?: number;
  durationSec?: number;
  reason?: string;
}

/**
 * Probe a video File's intrinsic dimensions + duration via an offscreen HTMLVideoElement.
 *
 * Resolves ok=false (with a `reason`) when the video exceeds X's dimension or duration
 * limits, or when metadata can't be read. Resolves ok=true otherwise. Frame rate is not
 * checked (see file note).
 */
export function validateVideoForX(file: File): Promise<VideoValidationResult> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';

    const cleanup = () => {
      video.removeAttribute('src');
      URL.revokeObjectURL(url);
    };

    video.onloadedmetadata = () => {
      const width = video.videoWidth;
      const height = video.videoHeight;
      const durationSec = video.duration;
      cleanup();

      if (width > X_VIDEO_MAX_WIDTH || height > X_VIDEO_MAX_HEIGHT) {
        resolve({
          ok: false,
          width,
          height,
          durationSec,
          reason: 'dimensions',
        });
        return;
      }
      if (durationSec > X_VIDEO_MAX_DURATION_SEC) {
        resolve({
          ok: false,
          width,
          height,
          durationSec,
          reason: 'duration',
        });
        return;
      }
      resolve({ ok: true, width, height, durationSec });
    };

    video.onerror = () => {
      cleanup();
      resolve({ ok: false, reason: 'unreadable' });
    };

    video.src = url;
  });
}
