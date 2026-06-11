## Context

The X chunked video upload + deferred-post pipeline now works end to end — the only remaining failure mode is the **source video being outside X's tweet-video spec** (confirmed: 3024×1964 @ 120 fps screen recording → `POST /2/tweets` "Your media IDs are invalid"; a 1280×832 @ 30 fps transcode of the same file posts fine). Videos enter the system via the webapp's "attach video to a tweet" feature: `POST /api/v1/media/upload` (`src/routes/api-v1-media.ts`) validates `video/mp4` ≤ 50 MB and **streams** `file.stream()` into R2 at `webapp/<chatId>/<ts>-<rand>.mp4`. Downstream, `uploadVideoToX` reads that R2 object and chunk-uploads it to X.

Cloudflare can transcode server-side three ways: Media Transformations (`/cdn-cgi/media`, resizes + H.264/AAC but **no documented fps capping** — fails our 120 fps case), Stream (caps 60 fps but a heavyweight streaming product with per-minute cost), and **Containers** (run any image, e.g. ffmpeg, full control). We pick **Containers + ffmpeg** for deterministic control of resolution **and** fps **and** codec, and for diagnosability (ffmpeg logs an explicit reason on any failure).

## Goals / Non-Goals

**Goals:**
- Normalize every uploaded video to X tweet-video spec at upload time, deterministically, with ffmpeg.
- Stream through the container (no full-file buffering) to respect the Worker memory ceiling for 50 MB videos.
- Make the normalized R2 object the single canonical media used by preview + the X chunked upload.
- Clear failure semantics (transcode failure → actionable error, not a silent out-of-spec upload).

**Non-Goals:**
- No change to image uploads, the X upload mechanics, the deferred-post system, or Instagram.
- Not building a general media pipeline — only X-tweet normalization of `video/mp4` uploads.
- No per-platform variants (Instagram has looser limits; the X-normalized file is acceptable for IG too).

## Decisions

### D1 — Cloudflare Containers + ffmpeg (over Media Transformations / Stream)
Media Transformations cannot cap frame rate (our exact failure); Stream is an over-scoped streaming product with ongoing cost. A small container with ffmpeg gives exact, debuggable control. Trade-off: a beta product + an image build + ~2-3 s cold start. Accepted for correctness and diagnosability (the user's explicit preference: "containers only … less hectic later trying to know what failed").

### D2 — Transcode at upload time, store the normalized object as canonical
The video branch of `POST /api/v1/media/upload` sends the uploaded bytes to the container and stores the **returned** normalized MP4 in R2 (same key shape). Everything downstream is unchanged and already-compliant. Alternative (transcode lazily in `uploadVideoToX` at publish) rejected: it would transcode on every publish and complicate the publish budget; upload-time runs once and keeps the publish path simple.

### D3 — Container shape: stateless HTTP transcoder, streamed I/O
A `VideoTranscoder extends Container` (`@cloudflare/containers`) with `defaultPort` and a short `sleepAfter`. The image runs a tiny HTTP server: `POST /transcode` reads the request body to a temp file (or pipes via stdin), runs ffmpeg, and streams the output MP4 back. The Worker does `getByName(<per-job or pooled id>)` → `startAndWaitForPorts()` → `containerFetch(POST /transcode, body: file.stream())` → `env.IMAGES.put(key, response.body)`. Streaming end-to-end avoids buffering 50 MB in the Worker. Instance type `standard-1`/`standard-2` (ffmpeg on a ~17 s clip needs little CPU/mem); `max_instances` modest. Use `getRandom()`/a small pool for concurrency, or `getByName` per job; renew the activity timeout if a transcode runs long (gotcha: long-op activity timeout).

### D4 — The ffmpeg normalization (X tweet-video spec)
Downscale so neither dimension exceeds the X cap (use a safe ≤1280 longest-edge), preserve aspect ratio, force even dimensions; cap fps to ≤30 (≤60 is the hard limit, 30 is safe + smaller); H.264 **High** profile, `-pix_fmt yuv420p`; ensure an AAC audio track (inject `anullsrc` silent stereo if the source has none); `-movflags +faststart`. Reference command (validated locally on the failing file):
```
ffmpeg -y -i in.mp4 -f lavfi -i anullsrc=channel_layout=stereo:sample_rate=44100 \
  -vf "scale='min(1280,iw)':-2,fps=30,format=yuv420p" \
  -c:v libx264 -profile:v high -b:v 5M -maxrate 6M -bufsize 8M \
  -c:a aac -b:a 128k -shortest -movflags +faststart out.mp4
```
(`-shortest` trims the injected silent track to the video; if the source already has audio, map it instead of `anullsrc`.) Implementation may probe with ffprobe and **skip** transcoding when the source is already within spec (optimization, optional for v1).

### D5 — Synchronous at upload, bounded
The upload request waits for the transcode (cold start + a few seconds) and returns the normalized `{key,url}`. The webapp already shows an upload spinner; videos are inherently slow to upload, so a few extra seconds is acceptable and keeps the media immediately usable. Bound it (e.g. ~60 s) and on timeout/transcode-failure return a clear error so the user retries rather than getting a silently broken video.

## Risks / Trade-offs

- **[Containers is beta]** → API may shift; pin `@cloudflare/containers` and the compat date; keep the container surface tiny (one endpoint).
- **[Cold start + transcode latency on upload]** → ~2-3 s cold start + transcode; mitigate with a warm pool (`sleepAfter`) and `standard-2`; acceptable for an explicit upload action.
- **[Memory on 50 MB files]** → stream request→ffmpeg→response and `R2.put(stream)`; do not `arrayBuffer()` the file in the Worker. The container uses ephemeral disk for temp files.
- **[ffmpeg failure / unexpected codecs]** → return a typed error from the container; the Worker surfaces an actionable upload error (and logs ffmpeg stderr).
- **[Deploy complexity]** → `wrangler deploy` now builds/pushes the image; document the Dockerfile + instance type; first deploy is slower.

## Migration Plan

1. Add `container/` (Dockerfile: small base + ffmpeg + the HTTP server) and the `VideoTranscoder` class.
2. `wrangler.toml`: `[[containers]]` (image, instance_type, max_instances) + `[[durable_objects.bindings]]` + `[[migrations]] new_sqlite_classes`.
3. Wire the video branch of `api-v1-media.ts` to stream through the container and store the normalized object.
4. `wrangler deploy` (builds image) → upload the known-bad `TFS-video.mp4` → confirm the stored object is ≤1280/≤30 fps and that a video draft posts to X.
5. Rollback: revert the upload-handler branch (raw passthrough) and remove the container config; no data migration.

## Open Questions
- Pooling: `getByName(jobId)` per transcode vs a small warm `getRandom()` pool — pick based on observed concurrency.
- Skip-if-compliant via ffprobe (saves work for HeyGen output) — include in v1 or defer.
- Instance sizing: start `standard-2`, tune from logs.
