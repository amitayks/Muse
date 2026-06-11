## 1. Container image (ffmpeg transcode server)

- [x] 1.1 Create `cloudflare-bot/container/Dockerfile` — a small base image (e.g. `node:20-slim` or `alpine`) with `ffmpeg` + `ffprobe` installed; expose the HTTP port; entrypoint runs the server
- [x] 1.2 Create the transcode HTTP server (`container/server.js` or similar): `POST /transcode` reads the MP4 from the request body to a temp file (ephemeral disk), runs ffmpeg, streams the output MP4 back; `GET /health` returns 200
- [x] 1.3 Implement the ffmpeg normalization per design D4: downscale longest edge ≤ 1280 (preserve aspect, even dims), `fps=30`, `-c:v libx264 -profile:v high -pix_fmt yuv420p`, ensure an AAC track (map source audio, else inject `anullsrc` silent stereo + `-shortest`), `-movflags +faststart`; on ffmpeg non-zero exit return a non-2xx with stderr
- [x] 1.4 (Optional) ffprobe the input and skip transcoding when already within spec (≤1920×1200, ≤60fps, H.264) — return the original bytes

## 2. Worker ↔ container wiring

- [x] 2.1 Add `VideoTranscoder extends Container` (`@cloudflare/containers`) with `defaultPort` + a short `sleepAfter`; export it from the Worker entry
- [x] 2.2 `wrangler.toml`: add `[[containers]]` (`class_name`, `image = "./container/Dockerfile"`, `instance_type = "standard-2"`, `max_instances`), a `[[durable_objects.bindings]]` for `VideoTranscoder`, and `[[migrations]]` with `new_sqlite_classes = ["VideoTranscoder"]`
- [x] 2.3 Add the container binding to the `Env` type (`src/types.ts`); add `@cloudflare/containers` to dependencies
- [x] 2.4 Add a service helper (e.g. `src/services/video-transcode.ts`): `transcodeToXSpec(env, bodyStream): Promise<ReadableStream>` — `getByName`/`getRandom` → `startAndWaitForPorts()` → `containerFetch('http://c/transcode', { method:'POST', body })`, returning the normalized stream; renew the activity timeout for long ops; bounded timeout + typed error

## 3. Upload-handler integration

- [x] 3.1 In `src/routes/api-v1-media.ts`, in the **video** branch (after type/size validation): stream `file.stream()` through `transcodeToXSpec(...)` and `env.IMAGES.put(key, normalizedStream)` instead of putting the raw file; keep the same `webapp/<chatId>/…` key shape and `{ key, url }` response
- [x] 3.2 Leave the **image** branch unchanged (raw `R2.put`)
- [x] 3.3 On transcode failure/timeout, return an actionable error (422/500) and do NOT store the original; log ffmpeg stderr

## 4. Validate

- [ ] 4.1 `wrangler deploy` (builds + pushes the container image); confirm the container starts (`/health`) and the binding resolves
- [ ] 4.2 Upload the known-bad `~/Downloads/TFS-video.mp4` (3024×1964@120fps) via the webapp; confirm the stored R2 object probes to ≤1280 / ≤30 fps / H.264 / AAC
- [ ] 4.3 Publish a video draft using that upload; confirm it posts to X (the deferred-post processor attaches it with no "media IDs are invalid")
- [ ] 4.4 Regression: an image upload still works unchanged; a normal small/compliant video still uploads + posts
