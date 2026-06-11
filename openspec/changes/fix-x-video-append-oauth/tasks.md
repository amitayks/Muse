## 1. Fix APPEND OAuth signing in uploadVideoToX

- [x] 1.1 In `cloudflare-bot/src/integrations/x.ts`, in `uploadVideoToX`, change the APPEND OAuth header call to sign the `oauth_*` params only — replace `generateOAuthHeader(env, 'POST', mediaUploadUrl, appendParams)` with `generateOAuthHeader(env, 'POST', mediaUploadUrl)` (multipart body → no body params in the signature base string)
- [x] 1.2 Remove the now-unused `appendParams` variable (the `FormData` already appends the literal `command`/`media_id`/`segment_index` values directly), keeping the `FormData` body and the chunk `Blob` unchanged
- [x] 1.3 Confirm the APPEND `fetch` still sets only the `Authorization` header and does NOT manually set `Content-Type`, so the runtime generates the `multipart/form-data; boundary=…` header
- [x] 1.4 Verify INIT, FINALIZE (both `application/x-www-form-urlencoded`) and STATUS (GET query params) are untouched and still pass their params into `generateOAuthHeader`
- [x] 1.5 Fix the APPEND chunk encoding surfaced during verification: send the chunk as the raw-binary `media` multipart field (`appendForm.append('media', new Blob([chunk]), 'chunk')`) instead of `media_data` — raw bytes in `media_data` were base64-decoded by X, breaking the segment-size total and causing FINALIZE to fail with "Segments do not add up to provided total file size"

## 2. Migrate X media upload from sunset v1.1 to v2 (`api.twitter.com/2/media/upload`)

- [x] 2.1 Replace the upload endpoint constant: drop `X_UPLOAD_API` (`upload.twitter.com/1.1`) and add `X_MEDIA_UPLOAD = 'https://api.twitter.com/2/media/upload'`
- [x] 2.2 Migrate `uploadMediaFromBuffer` (photos) to the v2 single-shot image endpoint `POST /2/media/upload`: multipart raw bytes in the `media` field + `media_category=tweet_image` (drop the base64/`media_data` path), read `data.id`
- [x] 2.3 Migrate `uploadVideoToX` to the v2 dedicated path-based chunked endpoints: `POST /initialize` (JSON), `POST /{id}/append` (multipart `media`+`segment_index`), `POST /{id}/finalize`, `GET ?command=STATUS`; read `data.id` and `data.processing_info`; guard for a missing `data.id`. (Empirically required: the command-based `POST /2/media/upload` with `command=INIT` returned a 400 image-only schema error for video — but proved OAuth 1.0a is accepted, since it was a schema error, not 401/403.)
- [x] 2.4 Grep for stale `X_UPLOAD_API` / `upload.twitter.com` / `media_id_string` / `media_data` references in `src/` (comments only) and typecheck clean

- [x] 2.5 Reduce the chunked APPEND size from 5MB to ~1MB — the v2 `/append` endpoint returns `413 Payload Too Large` for 5MB chunks (segment_index 0–999 still covers our ≤50MB videos)
- [x] 2.6 Add HTTP status/statusText to INIT/APPEND/FINALIZE/STATUS error messages for diagnosability (empty error bodies otherwise hide the cause, e.g. the 413)

## 3. Validate

- [x] 3.1 Typecheck / build the worker (`cloudflare-bot`) and confirm no unused-variable or type errors from the change
- [x] 3.2 Live verification of the upload path: a video draft published to X runs INIT→APPEND(1MB)→FINALIZE→STATUS to `succeeded` and returns a valid media id (confirmed via the live tail: `X video INIT ok` … `Uploaded video to X … final state: succeeded`)
- [x] 3.3 Confirm via the live tail that the v2 endpoints authenticate with OAuth 1.0a (no 401/403 — INIT/APPEND/FINALIZE/STATUS all succeed)
- [~] 3.4 DEFERRED — tweet attach: `POST /2/tweets` rejects the (correct, processed) bare media id with "Your media IDs are invalid" under OAuth 1.0a. Resolving this requires OAuth 2.0 and is tracked by the `add-x-oauth2-media` change.
- [~] 3.5 DEFERRED — photo attach has the same OAuth 1.0a limitation; verify once OAuth 2.0 lands (photos were already non-functional on the sunset v1.1 endpoint, so this is not a regression).
