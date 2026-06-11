## Why

X (Twitter) silently rejects a tweet's video with `400 "Your media IDs are invalid"` when the source file is outside X's tweet-video spec — the chunked upload reports `succeeded`, but `POST /2/tweets` refuses the out-of-spec media. The confirmed trigger is **Mac screen recordings at native ProMotion resolution/fps** (e.g. `3024×1964 @ 120 fps`). X caps tweet video at **≤1920×1200, ≤60 fps, H.264 + AAC, ≤140 s**. A spec-compliant transcode of the same clip (1280×832, 30 fps, H.264 High, AAC) posts immediately.

The whole publish pipeline already works (see done work below). The only remaining gap is **normalizing the source video to X spec**, and the two automatic options don't fit:
- **Server-side (Cloudflare Container + ffmpeg)** — built and working, but Cloudflare Containers require the **Workers Paid** plan ($5/mo); this account is on the **free** plan (401 from the Containers API).
- **Client-side (ffmpeg.wasm in the webapp)** — built, but single-threaded wasm is **too slow/unreliable** for a 6-megapixel 120 fps clip (it hangs; the Telegram session expired). Reverted.

So: build a **standalone local macOS converter** the user runs on their Mac to convert a video to X spec, producing a file they then upload through the existing webapp. Native ffmpeg on the Mac does this in ~1–2 s (vs minutes in wasm). The webapp now **validates** uploaded videos and rejects out-of-spec ones with a message pointing the user to this converter.

## What Changes

Build a small **standalone macOS tool** (separate from this repo / the Worker / the webapp — fully local, no network, no API) that:
- Accepts a video (drag-and-drop or file picker, ideally also a right-click/Quick Action on a file in Finder).
- Transcodes it to X tweet-video spec with ffmpeg (command below), preserving aspect ratio.
- Writes the converted MP4 next to the original (e.g. `<name>-x.mp4`) and reveals it in Finder.
- Shows simple progress + a clear done/error state.

This is a **convenience tool**, not connected to MusePostBot. Flow: user records/has a video → runs it through the converter → uploads the converted file in the webapp (which the validation now accepts).

## Capabilities

### New Capabilities
- `mac-video-converter`: a standalone local macOS app/tool that normalizes a video file to X tweet-video spec via ffmpeg. (Implemented as its own project — this change is the spec/handoff doc; nothing in the cloudflare-bot/webapp repo is required for it.)

### Modified Capabilities
<!-- none in this repo; the related webapp validation ships under transcode-video-on-upload / webapp-media -->

## Impact

- **New standalone project** (suggested: `~/Projects/x-video-converter/` or a new git repo) — NOT the MusePostBot repo. No changes to the Worker or its deploy.
- **Already shipped in MusePostBot (complements this):** the webapp now rejects out-of-spec videos at selection (dimensions/duration check) with a message telling the user to convert first — see `transcode-video-on-upload` change + `webapp/src/lib/validateVideo.ts`.
- **Dependency:** ffmpeg on the Mac (Homebrew `ffmpeg`, or bundle a static build inside the app for a no-install experience).

## Implementation options (pick in the build session)

Ordered simplest → nicest:

1. **Shell script + Automator "Quick Action" / Finder service (fastest to build).** A `convert-for-x.sh` wrapping the ffmpeg command, wired as a right-click Quick Action on video files in Finder ("Convert for X"). Or a Shortcuts.app shortcut. Zero UI code; relies on Homebrew ffmpeg. ~30 min.
2. **SwiftUI drag-and-drop `.app` (recommended for "double-click an app").** A tiny SwiftUI window with a drop zone; on drop, runs ffmpeg via `Process`, shows a progress bar (parse ffmpeg `-progress pipe:1`), writes `<name>-x.mp4`, reveals in Finder. Bundle a static `ffmpeg` binary inside `Contents/Resources` for a no-Homebrew, fully self-contained app. Needs Xcode; ~half a day incl. packaging. Code-signing/notarization optional for personal use (right-click→Open bypasses Gatekeeper).
3. **Tauri/Electron app** — cross-platform, but heavier; only if Windows/Linux is wanted later. Not recommended for a Mac-only personal tool.

**Recommendation:** Option 2 (SwiftUI app, bundled static ffmpeg) for a clean double-clickable tool; Option 1 if you just want it working today.

## The exact transcode (validated — this command produced a file that posts to X)

Native ffmpeg, run locally on the Mac:
```
ffmpeg -y -i "$IN" \
  -vf "fps=30,scale='min(1280,iw)':-2,format=yuv420p" \
  -c:v libx264 -profile:v high -preset veryfast -b:v 5M -maxrate 6M -bufsize 8M \
  -c:a aac -b:a 128k -movflags +faststart \
  "${IN%.*}-x.mp4"
```
Notes:
- `fps=30` **before** `scale` reduces work; `scale='min(1280,iw)':-2` caps width to ≤1280 (well under X's 1920×1200), preserves aspect, even height. `-preset veryfast` (native ffmpeg is fast; `medium` is fine too).
- **Audio:** if the source has **no** audio track, X still generally needs one — inject a silent AAC track: add `-f lavfi -i anullsrc=channel_layout=stereo:sample_rate=44100` as a second input, `-map 0:v:0 -map 1:a:0 -shortest`, and keep `-c:a aac`. (A version of this — `anullsrc` + `-shortest` — was validated end-to-end.) When the source has audio, just `-map 0:v:0 -map 0:a:0`.
- Output is `*-x.mp4`. Verify with: `ffprobe -v error -show_entries stream=codec_name,width,height,r_frame_rate -of default "$OUT"`.

## X tweet-video spec (target)

| Property | Limit |
|----------|-------|
| Container / codecs | MP4, **H.264** (High/Main) video + **AAC** audio |
| Resolution | **≤ 1920×1200** (we target ≤1280 wide for headroom) |
| Frame rate | **≤ 60 fps** (we target 30) |
| Duration | ≤ 140 s (non-Premium) / longer for Premium |
| File size | ≤ 512 MB |
| Pixel format | `yuv420p` |
| Aspect ratio | 1:3 to 3:1 |

## Context / background for the next session (read this first)

This is the tail end of a long debugging effort. Essential facts:

- **Root cause of "Your media IDs are invalid":** out-of-spec **video** (resolution/fps). Images were always fine. Confirmed via `ffprobe` on the user's `~/Downloads/TFS-video.mp4` (3024×1964 @ 120 fps) and by posting a transcoded copy `~/Downloads/TFS-video-x.mp4` successfully. It is **not** auth, media_category, the numeric id, timing, or account eligibility (the account IS X Premium/verified) — all of those were ruled out with evidence.
- **What already works in MusePostBot** (all shipped + deployed): the X chunked **v2** media upload (`uploadVideoToX` in `cloudflare-bot/src/integrations/x.ts` — INIT/APPEND/FINALIZE/STATUS via the path-based `/2/media/upload/*` endpoints, 1MB chunks), the full **OAuth 2.0 (PKCE)** migration of all X calls (`add-x-oauth2-media` change), and a **deferred X-video-post** system (`x_pending_posts` table + an every-minute cron `core/x-pending.ts`) that retries the tweet-creation — kept as robustness.
- **Why not server-side:** Cloudflare Containers (and Stream) need **Workers Paid**; account is free. The container solution was fully built then reverted (see `transcode-video-on-upload` design + git history) — it's ready if the user ever upgrades.
- **Why not client-side wasm:** single-threaded `@ffmpeg/core@0.12.10` (the only one that avoids COOP/COEP for the Telegram mini-app) is too slow for 6MP/120fps inputs; it hung in the browser. Reverted.
- **The webapp now validates** video dimensions/duration on selection and tells the user to convert out-of-spec files first (this is what points users at THIS converter). FPS can't be checked client-side, so the message states the full spec.
- **Reference design docs in this repo:** `openspec/changes/transcode-video-on-upload/design.md` (D4 has the ffmpeg rationale), and this file.

## Open questions for the build session
- Option 1 (Quick Action) vs Option 2 (SwiftUI app) — depends on whether a polished double-clickable app is wanted.
- Bundle a static ffmpeg binary (self-contained, ~40 MB) vs require Homebrew ffmpeg (smaller, but a dependency).
- Whether to also batch-convert a folder / handle non-MP4 inputs (mov, etc. — ffmpeg handles them; the filter graph is unchanged).
- Optional niceties: auto-copy the output path to clipboard, or auto-reveal in Finder; a menu-bar/Services entry.
