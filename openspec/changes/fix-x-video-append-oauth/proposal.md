## Why

Publishing a tweet with a video attachment fails on X with OAuth error `code 32 "Could not authenticate you"` at the **APPEND** step of the chunked media upload, even though INIT authenticates successfully with the same credentials. The shared chunked uploader (`uploadVideoToX` in `cloudflare-bot/src/integrations/x.ts`) sends the APPEND chunk as a `multipart/form-data` body but folds the form fields (`command`, `media_id`, `segment_index`) into the OAuth 1.0a signature base string. Per RFC 5849 §3.4.1.3, body parameters are only signed when the body is `application/x-www-form-urlencoded`; for a multipart body X signs the `oauth_*` parameters only, so our signature never matches and every video upload is rejected. This is a latent, pre-existing defect (it was identical in the old Video Studio path before it was extracted into the shared `uploadVideoToX`) that currently blocks **all** X video publishing.

Verification surfaced two further latent defects in the same flow (each was previously masked by the one before it), so the change grew to make X media publishing actually work end-to-end:

- **APPEND OAuth signature**: compute the signature over the `oauth_*` parameters **only** for the multipart APPEND request (stop passing `{command, media_id, segment_index}` into `generateOAuthHeader`). Symptom fixed: `code 32 "Could not authenticate you"`.
- **APPEND chunk encoding**: send each chunk as raw binary in the multipart **`media`** field, not as raw bytes in `media_data` (which X base64-decodes). Symptom fixed: FINALIZE `"Segments do not add up to provided total file size"`.
- **v1.1 → v2 endpoint migration** (root cause): move all X media upload off the **sunset** (2025-06-09) `upload.twitter.com/1.1/media/upload.json` endpoint to the v2 `https://api.twitter.com/2/media/upload` command endpoint. Media IDs minted by the legacy endpoint are rejected by `POST /2/tweets` with `"Your media IDs are invalid"`. Applies to **both** `uploadVideoToX` (chunked INIT/APPEND/FINALIZE/STATUS) and `uploadMediaFromBuffer` (simple photo upload). Includes adopting the v2 `data`-wrapped response shape (`data.id`, `data.processing_info`) and sending INIT/FINALIZE as multipart. Continues to authenticate with the app's existing **OAuth 1.0a** credentials (the same context `postTweet` already uses against `api.twitter.com/2/*`).
- Keep NOT setting a `Content-Type` header on multipart `fetch`es, so the runtime generates the `multipart/form-data; boundary=…` header.
- No change to Instagram publishing, the webapp, the DB schema, the public API, or OAuth credential storage.

**Known limitation (deferred to a follow-up change).** After this migration, the video uploads completely via v2 (OAuth 1.0a) and processes to `succeeded`, but attaching the resulting media id to `POST /2/tweets` is rejected with `"Your media IDs are invalid"` — the bare id is the correct format (`^[0-9]{1,19}$`; the `media_key` fails that regex) and the media is fully processed, so the remaining blocker is the **auth context**: v2 media→tweet attachment requires **OAuth 2.0 user tokens (`media.write`)**, which this codebase does not yet have. That work is scoped as a separate change (`add-x-oauth2-media`). This change is a prerequisite for it: the v2 upload is correct and complete; only the auth context for attachment is missing.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `video-publish-pipeline`: The shared X media uploader SHALL (a) sign the multipart APPEND with `oauth_*` params only, (b) transmit each chunk as raw binary in the `media` field, and (c) upload via the **v2** `https://api.twitter.com/2/media/upload` endpoint (command-based INIT/APPEND/FINALIZE/STATUS) using OAuth 1.0a, reading the media id from `data.id` and processing state from `data.processing_info`. This governs the shared `uploadVideoToX` used by both the Video Studio and the per-tweet publish flows.

## Impact

- **Code**: `cloudflare-bot/src/integrations/x.ts` — `uploadVideoToX` (APPEND signature + `media` field + v2 endpoint/response) and `uploadMediaFromBuffer` (photos → v2 multipart raw-binary upload, `data.id`). Endpoint constant changed from the v1.1 host to `https://api.twitter.com/2/media/upload`.
- **Affected flows**: every X media upload — both video publish paths (`uploadVideoToX`: Video Studio `publishVideoToTwitter` + per-tweet `core/publish.ts`) and every X photo upload (`uploadMediaFromBuffer`, used across the publish pipeline and tweet cards).
- **Not affected**: Instagram Post/Story/Reel, draft/webapp APIs, D1 schema, OAuth credential storage/hydration.
- **Risk → resolved empirically**: live testing showed the v2 media **upload** endpoints DO accept OAuth 1.0a (INIT/APPEND/FINALIZE/STATUS all succeed and the video processes to `succeeded`). However, **attaching** the uploaded media to `POST /2/tweets` under OAuth 1.0a fails with `"Your media IDs are invalid"` — so the auth-context limitation lives at the attach step, not the upload, and is deferred to the `add-x-oauth2-media` change (see Known limitation above).
