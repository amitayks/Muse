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
The system SHALL display image previews for all media attached to drafts.

#### Scenario: Existing media preview
- **WHEN** the draft editor loads for a draft with existing attached images
- **THEN** the images SHALL be loaded from the `/media/:key` endpoint and displayed as thumbnails

#### Scenario: Newly uploaded image preview
- **WHEN** an image upload completes successfully
- **THEN** the image SHALL immediately appear as a thumbnail preview in the media area

#### Scenario: Thumbnail size
- **WHEN** image thumbnails render
- **THEN** they SHALL be displayed at a consistent size (e.g., 80x80px) with object-fit cover, regardless of original dimensions

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
The system SHALL validate uploaded files for type and size.

#### Scenario: Allowed image types
- **WHEN** a file is uploaded
- **THEN** only image files with MIME types `image/jpeg`, `image/png`, `image/gif`, `image/webp` SHALL be accepted

#### Scenario: File size limit
- **WHEN** a file exceeding 10MB is uploaded
- **THEN** the upload SHALL be rejected with HTTP 413

#### Scenario: Client-side validation
- **WHEN** the user selects a file in the webapp
- **THEN** the webapp SHALL validate type and size BEFORE uploading, showing an immediate error if invalid
