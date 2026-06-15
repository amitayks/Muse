## Purpose

Publishes generated video drafts to Twitter/X (chunked media upload) and Instagram Reels (Meta Content Publishing API), supporting single- or multi-platform delivery with per-platform success reporting, and records each successful publish in the video_published table.
## Requirements
### Requirement: Video publish to Twitter
The system SHALL provide a function to publish a video to Twitter (X) by uploading the video file via the chunked media upload API and creating a tweet with the video attached and caption as text.

#### Scenario: Successful Twitter video publish
- **WHEN** `publishVideoToTwitter(env, videoDraft)` is called with a completed video draft
- **THEN** the system SHALL read the video from R2
- **AND** upload via Twitter media upload API (chunked upload for files > 5MB)
- **AND** create a tweet with the uploaded media ID and the caption text (truncated to 280 chars)
- **AND** return the tweet URL

#### Scenario: Twitter video format requirements
- **WHEN** a video is uploaded to Twitter
- **THEN** the video SHALL be MP4 format with H.264 encoding
- **AND** the file size SHALL NOT exceed 512MB
- **AND** the duration SHALL NOT exceed 140 seconds for standard accounts

#### Scenario: Twitter upload failure
- **WHEN** the Twitter media upload fails
- **THEN** the system SHALL return a typed error
- **AND** the video draft status SHALL remain unchanged (user can retry)

### Requirement: Video publish to Instagram Reels
The system SHALL provide a function to publish a video to Instagram as a Reel using the Meta Content Publishing API.

#### Scenario: Successful Instagram Reel publish
- **WHEN** `publishVideoToInstagram(env, videoDraft)` is called with a completed video draft
- **THEN** the system SHALL create a media container via `POST /{ig-user-id}/media` with `media_type=REELS`, `video_url` (publicly accessible R2 URL), and `caption`
- **AND** poll the container status until ready
- **AND** publish via `POST /{ig-user-id}/media_publish`
- **AND** return the Instagram media ID and URL

#### Scenario: Instagram aspect ratio requirement
- **WHEN** a video is published to Instagram Reels
- **THEN** the video SHALL be in 9:16 aspect ratio
- **AND** if the video is not 9:16, the publish SHALL fail with a clear error message

#### Scenario: Instagram container processing
- **WHEN** the media container is created but not yet ready
- **THEN** the system SHALL poll `GET /{container-id}?fields=status_code` until status is "FINISHED"
- **AND** SHALL timeout after 5 minutes of polling

#### Scenario: Instagram publish failure
- **WHEN** the Instagram API returns an error
- **THEN** the system SHALL return a typed error with the API error message
- **AND** the video draft status SHALL remain unchanged

### Requirement: Multi-platform publish
The video publish action SHALL support publishing to one or both platforms based on user selection.

#### Scenario: Publish to both platforms
- **WHEN** user clicks "Publish" on a video draft and selects both Twitter and Instagram
- **THEN** the system SHALL attempt to publish to both platforms
- **AND** update the video_published record with URLs from both platforms
- **AND** report success/failure for each platform independently

#### Scenario: Publish to single platform
- **WHEN** user clicks "Publish" and selects only Twitter
- **THEN** the system SHALL publish to Twitter only
- **AND** the Instagram field in the published record SHALL be null

### Requirement: Video publish record
After successful publishing, the system SHALL create a record in `video_published` table with: id, chat_id, video_draft_id, repo_id, twitter_url, instagram_url, caption, and published_at.

#### Scenario: Published record created
- **WHEN** a video is successfully published to at least one platform
- **THEN** a `video_published` record SHALL be created
- **AND** the video draft status SHALL be updated to "published"

### Requirement: Remove character truncation from video tweet captions
When publishing a video to X, the system SHALL NOT truncate the tweet caption to 280 characters.

#### Scenario: Video publish to X
- **WHEN** the system publishes a video draft to X
- **THEN** the tweet caption SHALL be posted at full length without truncation

### Requirement: Chunked X upload OAuth 1.0a signing per step

The shared chunked X (Twitter) video uploader (`uploadVideoToX` in `cloudflare-bot/src/integrations/x.ts`) SHALL compute each step's OAuth 1.0a signature consistently with that step's request body encoding, per RFC 5849 §3.4.1.3: request-body parameters are included in the signature base string ONLY when the body is `application/x-www-form-urlencoded`. Specifically, the **APPEND** step, which sends a `multipart/form-data` body, SHALL sign the `oauth_*` parameters ONLY — the multipart form fields (`command`, `media_id`, `segment_index`, `media_data`) SHALL NOT be included in the signature base string. The **INIT** and **FINALIZE** steps (which send `application/x-www-form-urlencoded` bodies) and the **STATUS** step (a GET with query parameters) SHALL continue to include their respective parameters in the signature base string. This requirement governs the single shared uploader used by both the Video Studio publish flow (`publishVideoToTwitter`) and the per-tweet publish flow (`core/publish.ts`).

#### Scenario: APPEND signs oauth parameters only

- **WHEN** `uploadVideoToX` issues an APPEND request with a `multipart/form-data` body containing `command`, `media_id`, `segment_index`, and the chunk `media_data`
- **THEN** the OAuth 1.0a signature base string SHALL contain only the `oauth_*` parameters (no `command`, `media_id`, `segment_index`, or `media_data`)
- **AND** the request SHALL NOT set a `Content-Type` header manually, so the runtime generates the `multipart/form-data; boundary=…` header from the `FormData` body
- **AND** X SHALL accept the request rather than rejecting it with `code 32 "Could not authenticate you"`

#### Scenario: INIT, FINALIZE, and STATUS signing unchanged

- **WHEN** `uploadVideoToX` issues the INIT or FINALIZE request (`application/x-www-form-urlencoded`) or the STATUS request (GET with query parameters)
- **THEN** the signature base string SHALL include that step's body or query parameters (e.g. `command`, `total_bytes`, `media_type`, `media_category` for INIT), exactly as before this change

#### Scenario: Video tweet that previously failed at APPEND now uploads

- **WHEN** a draft whose tweet carries a video is published to X and INIT has already succeeded and returned a `media_id`
- **THEN** the subsequent APPEND chunk uploads SHALL authenticate successfully
- **AND** the upload SHALL proceed to FINALIZE and STATUS and return a usable `media_id` for attachment to the tweet
- **AND** the persisted `publish_results.errors.x` SHALL NOT contain `X video APPEND failed … code 32`

#### Scenario: Both publish paths share the corrected uploader

- **WHEN** either the Video Studio flow (`publishVideoToTwitter`) or the per-tweet publish flow (`core/publish.ts`) uploads a video to X
- **THEN** both SHALL call the same `uploadVideoToX` function and therefore both SHALL use the corrected APPEND signing behavior

### Requirement: Chunked X upload APPEND chunk encoding

The chunked X (Twitter) video uploader (`uploadVideoToX`) SHALL transmit each APPEND chunk as **raw binary** in the multipart `media` form field, NOT as base64 in the `media_data` field. X's chunked APPEND treats `media` as raw binary and `media_data` as base64; placing raw bytes in `media_data` causes X to base64-decode them, so per-segment byte counts no longer sum to the INIT `total_bytes` and FINALIZE fails with `"Segments do not add up to provided total file size."` Using the raw `media` field keeps each segment's size exact and avoids base64 overhead, consistent with the chosen no-base64 approach.

#### Scenario: APPEND sends raw binary in the media field

- **WHEN** `uploadVideoToX` appends a chunk to the multipart body
- **THEN** the chunk SHALL be added as the `media` field carrying the raw bytes (e.g. `appendForm.append('media', new Blob([chunk]), 'chunk')`)
- **AND** the chunk SHALL NOT be base64-encoded, and SHALL NOT be sent in a `media_data` field

#### Scenario: Segment sizes sum to the declared total at FINALIZE

- **WHEN** all chunks have been appended and FINALIZE is issued for a video whose total byte length was declared at INIT
- **THEN** the sum of the uploaded segment sizes SHALL equal the INIT `total_bytes`
- **AND** FINALIZE SHALL NOT fail with `"Segments do not add up to provided total file size"`

### Requirement: X media upload uses the v2 endpoint

All X (Twitter) media upload SHALL use the v2 endpoints under `https://api.twitter.com/2/media/upload`, NOT the v1.1 endpoint `upload.twitter.com/1.1/media/upload.json` (sunset 2025-06-09). Photos SHALL use the single-shot image endpoint `POST /2/media/upload`; videos SHALL use the dedicated path-based chunked endpoints (`/initialize`, `/{id}/append`, `/{id}/finalize`, and `GET ?command=STATUS`). The command-based `POST /2/media/upload` with `command=INIT` SHALL NOT be used for video — that endpoint is image-only and rejects video media types/categories. The uploaders SHALL parse the v2 `data`-wrapped response shape — the media id at `data.id` and processing state at `data.processing_info` — and SHALL authenticate with the application's existing OAuth 1.0a user-context credentials. The resulting media id SHALL be valid for attachment via `POST /2/tweets`.

#### Scenario: Video chunked upload uses the path-based endpoints

- **WHEN** `uploadVideoToX` uploads a video
- **THEN** it SHALL POST `media_type`/`total_bytes`/`media_category` as JSON to `POST /2/media/upload/initialize` and read the media id from `data.id`
- **AND** it SHALL upload each chunk to `POST /2/media/upload/{id}/append` as multipart/form-data with the raw bytes in `media` and a `segment_index` (the media id in the path, not the body), using a chunk size of at most ~1MB (the v2 `/append` endpoint returns `413 Payload Too Large` for larger chunks such as the legacy 5MB size)
- **AND** it SHALL complete via `POST /2/media/upload/{id}/finalize` and poll `GET /2/media/upload?command=STATUS&media_id={id}` until `data.processing_info.state` is `succeeded`
- **AND** every request SHALL be signed with OAuth 1.0a, with non-urlencoded bodies (JSON / multipart / none) signing the `oauth_*` params only

#### Scenario: Photo upload uses the single-shot v2 image endpoint

- **WHEN** `uploadMediaFromBuffer` uploads a photo
- **THEN** it SHALL POST the raw image bytes as the multipart `media` field (with `media_category=tweet_image`) to `POST /2/media/upload` (no base64, no `media_data`)
- **AND** it SHALL read the resulting media id from `data.id`

#### Scenario: Uploaded media id format for POST /2/tweets

- **WHEN** a video or photo uploaded via the v2 endpoint is attached to a tweet through `POST /2/tweets`
- **THEN** the attached identifier SHALL be the bare numeric media id (`data.id`, matching `^[0-9]{1,19}$`), NOT the `media_key` (`"7_<id>"`, which fails that regex)

#### Scenario: Tweet attachment under OAuth 1.0a is a known limitation (deferred)

- **WHEN** v2-uploaded media (uploaded with OAuth 1.0a user context) is attached to `POST /2/tweets`, even after processing reports `succeeded`
- **THEN** X currently rejects the request with `"Your media IDs are invalid"`
- **AND** resolving this is OUT OF SCOPE for this change — it requires OAuth 2.0 user-context tokens (scope `media.write`), tracked by a separate change (`add-x-oauth2-media`)
- **AND** this change's media-upload migration is a prerequisite for that fix (the upload itself is correct and complete)

### Requirement: X media upload authenticates via OAuth 2.0 bearer

The shared X media uploader (`uploadVideoToX`, `uploadMediaFromBuffer`) SHALL authenticate the v2 media-upload calls (initialize/append/finalize/status and the single-shot image upload) with the user's OAuth 2.0 `Authorization: Bearer` token instead of OAuth 1.0a. Because the upload and the subsequent post now share the same OAuth 2.0 user context, the resulting media id SHALL be attachable to a post.

#### Scenario: Video uploaded under OAuth 2.0 attaches to a post

- **WHEN** a video is uploaded via the v2 endpoints using the user's OAuth 2.0 bearer and then attached to a post created with the same user's bearer
- **THEN** the post SHALL be created with the video attached
- **AND** X SHALL NOT reject it with `"Your media IDs are invalid"`

