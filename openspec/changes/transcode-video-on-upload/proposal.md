## Why

X (Twitter) rejects a tweet's video with `400 "Your media IDs are invalid"` when the source file is outside X's tweet-video spec — even though the chunked upload reports `succeeded`. The confirmed real-world trigger: a user-uploaded **screen recording at 3024×1964 @ 120 fps** (X caps tweet video at ~1920×1200 and 60 fps). X processes the upload but the post endpoint refuses the out-of-spec media; this is indistinguishable from an auth/timing failure and cost a very long debug. A locally-transcoded copy (1280×832, 30 fps, H.264 High, AAC) posts immediately. To make video → X reliable for **any** user upload (screen recordings, phone 4K/60, high-fps captures), the app must normalize uploaded videos to X spec server-side. We choose **Cloudflare Containers running ffmpeg** for full, deterministic control over resolution + frame rate + codec (Media Transformations does not document fps capping; Stream is a heavier streaming product) and so failures are easy to diagnose.

## What Changes

- Add a **Cloudflare Container** (small image with `ffmpeg`) exposing an HTTP `POST /transcode` endpoint that reads an MP4 from the request body and returns an X-tweet-video-compliant MP4 (≤1920×1200, ≤60 fps, H.264 High, `yuv420p`, AAC audio — silent track added if the source has none, `+faststart`).
- At **upload time**, the media upload handler (`POST /api/v1/media/upload`) routes **video** uploads through the transcode container before storing the canonical MP4 in R2; images are unchanged. The normalized R2 object is what every downstream consumer (preview, draft media, the X chunked upload) uses.
- Wire the container into the Worker: a `Container` Durable Object class + binding, `[[containers]]` config, the `new_sqlite_classes` migration, and the image build.
- Leave the deferred-X-video-post system (`add-x-oauth2-media` / `x_pending_posts`) untouched — it remains as robustness on top of an already-compliant file.

## Capabilities

### New Capabilities
- `video-transcode`: server-side normalization of uploaded videos to X tweet-video spec via a Cloudflare Container running ffmpeg, invoked at upload time, output stored in R2.

### Modified Capabilities
- `webapp-media`: the media upload endpoint SHALL transcode `video/mp4` uploads to X spec (via the transcode container) before storing them as the canonical media object; image uploads are unchanged.

## Impact

- **Code**: new `cloudflare-bot/container/` (Dockerfile + a tiny HTTP transcode server wrapping ffmpeg); a `VideoTranscoder` `Container` class; `src/routes/api-v1-media.ts` (video branch streams through the container); `src/services/` helper to call the container; `src/types.ts` (the container binding).
- **Config / deploy**: `wrangler.toml` gains `[[containers]]` (image, `instance_type`, `max_instances`), a `[[durable_objects.bindings]]` for the container class, and `[[migrations]] new_sqlite_classes`. Deploy now builds + pushes the container image (≈2-3 s cold start; standard-1/2 instance).
- **Cost / latency**: per-video transcode runs container compute; upload responses get ~cold-start + transcode time (a few seconds) for videos.
- **Not affected**: image uploads, the X chunked upload mechanics, OAuth 2.0, the deferred-post cron, Instagram. HeyGen-generated Video Studio output is already small/compliant but will also be normalized (idempotent-safe).
