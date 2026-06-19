## Purpose

Covers webapp image media handling: uploading images to R2 via the Worker API (file picker or drag-and-drop) with progress and error states, previewing existing and new images as thumbnails, removing images from a draft without deleting the R2 object, the webapp R2 key format, media-serving CORS, and file type and size validation.
## Requirements
### Requirement: Image upload from webapp
The system SHALL allow uploading images from the webapp to R2 storage via the Worker API.

#### Scenario: Upload via file picker
- **WHEN** the user selects an image file via the file picker in the draft editor or compose page
- **THEN** the webapp SHALL upload the file as multipart form data to `POST /api/v1/media/upload` and receive the R2 key and serving URL

#### Scenario: Upload via drag-and-drop
- **WHEN** the user drags an image file onto a drop zone in the draft editor or compose page
- **THEN** the webapp SHALL upload the file identically to the file picker flow

#### Scenario: Upload progress indicator
- **WHEN** an image upload is in progress
- **THEN** a progress indicator (spinner or progress bar) SHALL be displayed on the image slot

#### Scenario: Upload error handling
- **WHEN** an image upload fails (network error, file too large, invalid type)
- **THEN** an error message SHALL be displayed inline (e.g., "Upload failed — file too large") and the user SHALL be able to retry

### Requirement: Image preview in editor
The system SHALL display image previews for all media attached to drafts. In the Composer/Draft-viewer existing-draft state, images SHALL render **full content width** (not 80×80 thumbnails) so the user sees them as they will appear.

#### Scenario: Existing media preview
- **WHEN** the Composer/Draft-viewer loads a draft with existing attached images
- **THEN** the images SHALL be loaded from the `/media/:key` endpoint and displayed full content width below the relevant tweet

#### Scenario: Newly uploaded image preview
- **WHEN** an image upload completes successfully
- **THEN** the image SHALL immediately appear as a full-width preview in the tweet's media area

#### Scenario: Aspect handling
- **WHEN** images render full-width
- **THEN** they SHALL preserve aspect ratio (no distortion), with multiple images laid out in a tidy grid (up to 4)

### Requirement: Image removal from draft
The system SHALL allow removing images from a draft without deleting the R2 object.

#### Scenario: Remove image
- **WHEN** the user taps the "X" button on an image thumbnail
- **THEN** the image SHALL be unlinked from the tweet's media array (the R2 object remains for potential re-use), and the change SHALL be saved

### Requirement: R2 key format for webapp uploads
The system SHALL store webapp-uploaded images with a consistent key format.

#### Scenario: Upload key format
- **WHEN** an image is uploaded via the webapp
- **THEN** the R2 key SHALL follow the format `webapp/{chatId}/{timestamp}-{random}.{extension}` to avoid collisions and enable easy identification of webapp-origin media

### Requirement: Media serving CORS
The existing `/media/:key` endpoint SHALL include CORS headers for the webapp domain.

#### Scenario: Media CORS headers
- **WHEN** a `/media/:key` request includes an `Origin` header matching the webapp domain
- **THEN** the response SHALL include `Access-Control-Allow-Origin: <WEBAPP_URL>` so images can be displayed in the webapp

### Requirement: Supported file types and size limits
The system SHALL validate uploaded files for type and size, accepting both images and video.

#### Scenario: Allowed image types
- **WHEN** a file is uploaded
- **THEN** image files with MIME types `image/jpeg`, `image/png`, `image/gif`, `image/webp` SHALL be accepted

#### Scenario: Allowed video type
- **WHEN** a file is uploaded
- **THEN** video files with MIME type `video/mp4` SHALL be accepted

#### Scenario: Disallowed types rejected
- **WHEN** a file with any MIME type other than the allowed image types or `video/mp4` is uploaded
- **THEN** the upload SHALL be rejected (e.g., "Invalid file type")

#### Scenario: Image size limit
- **WHEN** an image exceeding 10MB is uploaded
- **THEN** the upload SHALL be rejected with HTTP 413

#### Scenario: Video size limit
- **WHEN** a video exceeding 50MB is uploaded
- **THEN** the upload SHALL be rejected with HTTP 413 (e.g., "File too large (max 50MB)")

#### Scenario: Client-side validation
- **WHEN** the user selects a file in the webapp
- **THEN** the webapp SHALL validate type and size BEFORE uploading, applying the 10MB limit to images and the 50MB limit to video, showing an immediate error if invalid

### Requirement: Video upload from webapp
The system SHALL allow uploading an `video/mp4` file from the webapp to R2 storage via the Worker API, using the same `POST /api/v1/media/upload` endpoint and key format as images.

#### Scenario: Upload video via file picker
- **WHEN** the user selects a `video/mp4` file via the file picker on a tweet
- **THEN** the webapp SHALL upload the file as multipart form data to `POST /api/v1/media/upload` and receive the R2 key and serving URL
- **AND** the returned media descriptor SHALL have `type: 'video'`

#### Scenario: Upload video via drag-and-drop
- **WHEN** the user drags a `video/mp4` file onto a tweet's drop zone
- **THEN** the webapp SHALL upload the file identically to the file picker flow

#### Scenario: Video upload progress and errors
- **WHEN** a video upload is in progress
- **THEN** a progress/loading indicator SHALL be displayed on the media slot
- **AND** if the upload fails (network error, too large, invalid type) an inline error SHALL be shown and the user SHALL be able to retry

### Requirement: Video preview in media grid
The system SHALL display a video preview for media items of `type: 'video'` attached to a tweet, distinct from images. In the Composer/Draft-viewer existing-draft state, the video SHALL render **full content width** in a `<video>` element with a play affordance.

#### Scenario: Existing video preview
- **WHEN** the viewer loads a tweet that has an attached video
- **THEN** the video SHALL be loaded from the `/media/:key` endpoint and rendered full-width in a `<video>` element (with a play affordance), not a broken `<img>`

#### Scenario: Newly uploaded video preview
- **WHEN** a video upload completes successfully
- **THEN** the video SHALL immediately appear as a full-width preview in the tweet's media area

### Requirement: Photo and video media exclusivity
The shared media grid SHALL enforce the platform rule that a single tweet contains EITHER up to 4 photos OR exactly 1 video, never both and never more than one video.

#### Scenario: Video locks the slot
- **WHEN** a tweet already has a video attached
- **THEN** the grid SHALL NOT offer to add any further media (no second video, no photos) to that tweet

#### Scenario: Photos disable video add
- **WHEN** a tweet already has one or more photos attached
- **THEN** the add affordance SHALL allow only more photos (up to 4) and SHALL NOT offer to add a video

#### Scenario: Empty tweet offers both
- **WHEN** a tweet has no media attached
- **THEN** the add affordance SHALL allow attaching either a photo or a video

#### Scenario: Removing media frees the slot
- **WHEN** the user removes the attached video (or all photos) from a tweet
- **THEN** the tweet SHALL again offer to add either a photo or a video

### Requirement: Video media serving
The existing `/media/:key` endpoint SHALL serve webapp-uploaded video objects with their stored content type so they play in the webapp `<video>` element.

#### Scenario: Serve uploaded video
- **WHEN** a `/media/:key` request targets a stored `video/mp4` object
- **THEN** the response SHALL include `Content-Type: video/mp4` and `Accept-Ranges: bytes`, allowing playback in a browser `<video>` element

### Requirement: Video uploads are normalized to X spec before storage

The media upload endpoint (`POST /api/v1/media/upload`) SHALL route `video/mp4` uploads through the transcode container and store the normalized result as the canonical R2 object. Image uploads SHALL be unchanged (stored as-is). Existing validation (type allow-list, ≤ 50 MB video / ≤ 10 MB image) SHALL still apply, on the original upload, before transcoding.

#### Scenario: Video upload is transcoded then stored

- **WHEN** a user uploads an `video/mp4` file via `POST /api/v1/media/upload`
- **THEN** the handler SHALL validate type/size, stream the bytes through the transcode container, and `PUT` the normalized MP4 to R2 at the `webapp/<chatId>/…` key
- **AND** the response `{ key, url }` SHALL reference the normalized object

#### Scenario: Image upload is unaffected

- **WHEN** a user uploads an image (jpg/png/gif/webp)
- **THEN** it SHALL be streamed to R2 unchanged (no transcode path)

#### Scenario: Transcode failure surfaces to the user

- **WHEN** transcoding the uploaded video fails or times out
- **THEN** the endpoint SHALL return an actionable error (e.g. 422/500 with a clear message) and SHALL NOT store the original out-of-spec file as the media

### Requirement: Generate image into a tweet slot
The system SHALL offer a one-click **Generate** action on every image placeholder in the composer, alongside the upload affordance. Activating it SHALL call `POST /api/v1/drafts/:id/tweets/:idx/image` for the current draft and tweet, and on success SHALL drop the returned media `{ key, type: 'photo' }` into that tweet's slot — symmetric with how an upload lands. Generation SHALL require a saved draft (a draft id must exist); if the draft is unsaved, the webapp SHALL save it first and then generate. Photo/video exclusivity and the per-tweet image limit SHALL apply identically to generated and uploaded images.

#### Scenario: Generate on an empty image slot
- **WHEN** the user taps Generate on an image placeholder of a saved draft
- **THEN** the webapp SHALL call the per-tweet image endpoint and, on success, display the returned image in that slot

#### Scenario: Generate requires a saved draft
- **WHEN** the user taps Generate while the draft has not yet been saved
- **THEN** the webapp SHALL save the draft to obtain an id, then generate the image for the targeted tweet

#### Scenario: Generation in progress
- **WHEN** a per-slot image generation is running
- **THEN** a loading indicator SHALL be displayed on that image slot and the action SHALL be disabled until it resolves

#### Scenario: Generation error handling
- **WHEN** a per-slot image generation fails (model error, safety block, network)
- **THEN** an error message SHALL be displayed inline on that slot and the user SHALL be able to retry, with the slot's existing media unchanged

#### Scenario: Generated image respects media limits
- **WHEN** a generated image would exceed the per-tweet image limit or violate photo/video exclusivity
- **THEN** the Generate action SHALL be unavailable for that slot, consistent with the upload rules

### Requirement: Video generation placeholder
The system SHALL display a video-generation affordance on video placeholders as a non-functional placeholder only (e.g. disabled or "coming soon"). Activating it SHALL NOT call any backend and SHALL NOT generate a video; real video generation is deferred to a separate future change.

#### Scenario: Video generate affordance is a stub
- **WHEN** the user views a video placeholder in the composer
- **THEN** a video-generation affordance SHALL be shown in a non-functional state
- **AND** interacting with it SHALL NOT trigger any backend request or video generation

