# video-transcode Specification

## Purpose
TBD - created by archiving change transcode-video-on-upload. Update Purpose after archive.
## Requirements
### Requirement: Server-side video normalization via a Cloudflare Container

The system SHALL provide a Cloudflare Container running `ffmpeg` that normalizes an MP4 to X tweet-video spec. It SHALL expose an HTTP endpoint (`POST /transcode`) that reads an MP4 from the request body and returns an MP4 that is H.264 (High profile, `yuv420p`), ≤ 1920×1200, ≤ 60 fps, with an AAC audio track (a silent track injected when the source has none) and `+faststart`. The container is wired to the Worker via a `Container` Durable Object class + binding, `[[containers]]` config, and a `new_sqlite_classes` migration.

#### Scenario: Out-of-spec video is normalized

- **WHEN** an MP4 exceeding X limits (e.g. 3024×1964 @ 120 fps) is sent to the container's `POST /transcode`
- **THEN** the returned MP4 SHALL be H.264/`yuv420p`, with both dimensions within the X cap and frame rate ≤ 60 fps, and SHALL carry an AAC audio track
- **AND** the result SHALL be valid for attachment to a post via `POST /2/tweets` (no "Your media IDs are invalid")

#### Scenario: Streamed, memory-safe transcode

- **WHEN** a video near the 50 MB upload limit is transcoded
- **THEN** the Worker SHALL stream the bytes to the container and stream the result into R2 (no full-file buffering in the Worker), using the container's ephemeral disk for temp files

#### Scenario: Transcode failure is explicit

- **WHEN** ffmpeg fails (unreadable/unsupported input) or the container is unavailable
- **THEN** the operation SHALL return a typed error (with ffmpeg stderr logged), NOT a silent passthrough of the original out-of-spec file

### Requirement: Transcoded video stored as the canonical R2 object

The normalized MP4 SHALL be stored in R2 and used as the single canonical media object for the upload, so every downstream consumer (webapp preview, draft media, the X chunked upload `uploadVideoToX`) operates on the X-compliant file.

#### Scenario: Downstream consumers use the normalized file

- **WHEN** a video upload has been normalized and stored
- **THEN** the returned media key/URL SHALL reference the normalized object, and `uploadVideoToX` SHALL chunk-upload the normalized bytes (not the original)

