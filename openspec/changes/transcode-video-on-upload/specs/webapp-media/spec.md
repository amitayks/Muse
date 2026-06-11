## ADDED Requirements

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
