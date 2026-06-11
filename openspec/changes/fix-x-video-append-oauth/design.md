## Context

X video upload uses the v1.1 chunked media upload flow (`upload.twitter.com/1.1/media/upload.json`) in four steps: INIT → APPEND → FINALIZE → STATUS, implemented in `uploadVideoToX` (`cloudflare-bot/src/integrations/x.ts:324`). All four steps authenticate with OAuth 1.0a via the shared `generateOAuthHeader(env, method, url, bodyParams)` helper, which builds the signature base string by merging `bodyParams` into the `oauth_*` parameters (`x.ts:126`).

The persisted failure (from D1 `drafts.publish_results.errors.x`) is:

```
X video APPEND failed: {"errors":[{"message":"Could not authenticate you","code":32}]}
```

INIT succeeds (it returns a `media_id`, or the function throws earlier), so the credentials are valid. The failure is isolated to APPEND. The difference: INIT/FINALIZE send `application/x-www-form-urlencoded` bodies and STATUS is a GET with query params — all three are correctly signed by including their params. APPEND sends a `multipart/form-data` body (a `FormData` with the raw chunk as a `Blob`) **but still passes `{command, media_id, segment_index}` into `generateOAuthHeader`**, folding them into the signature base string.

Per RFC 5849 §3.4.1.3, body parameters are part of the OAuth signature base string only when the body is `application/x-www-form-urlencoded`. For a multipart body, X computes the signature over the `oauth_*` parameters alone. Our base string therefore differs from X's → signature mismatch → `code 32`.

This defect is pre-existing: the old Video Studio `publishVideoToTwitter` had byte-identical APPEND code before it was extracted into the shared `uploadVideoToX`. End-to-end X video publishing was apparently never exercised successfully.

## Goals / Non-Goals

**Goals:**
- Make the chunked APPEND step authenticate so X video uploads complete, for both the per-tweet publish flow and the Video Studio flow (both call the shared `uploadVideoToX`).
- Keep the change minimal and localized to the APPEND signing call.

**Non-Goals:**
- No change to INIT, FINALIZE, or STATUS (already correct).
- No change to photo upload (`uploadMediaFromBuffer`), Instagram publishing, the webapp, the DB, or the public API.
- No change to `generateOAuthHeader`'s contract — it stays a general helper; callers decide what to sign.
- No re-encoding of video bytes (no base64), no switch of APPEND to url-encoded.

## Decisions

### Decision: Sign oauth params only for the multipart APPEND request (Option A)

In `uploadVideoToX`, change the APPEND OAuth header call from:

```js
const appendAuth = await generateOAuthHeader(env, 'POST', mediaUploadUrl, appendParams);
```

to sign the `oauth_*` parameters only:

```js
const appendAuth = await generateOAuthHeader(env, 'POST', mediaUploadUrl); // multipart body → sign oauth params only
```

The `FormData` body (`command`, `media_id`, `segment_index`, `media_data` Blob) and the `fetch` call are unchanged. The APPEND `fetch` already sets only the `Authorization` header and does **not** set `Content-Type`, so the runtime generates the required `multipart/form-data; boundary=…` header. `generateOAuthHeader` already defaults `bodyParams` to `{}`, so calling it without that argument signs the `oauth_*` params only (same as `verifyCredentials` and the GET STATUS pattern).

`appendParams` is currently only used to build the FormData fields and the signature. After the fix it can either be removed (the FormData appends literal values) or kept for the FormData; the implementer should remove the now-unused signing usage and avoid a dangling unused variable.

**Alternative considered — Option B (url-encode APPEND + base64 `media_data`):** switch the APPEND body to `application/x-www-form-urlencoded`, base64-encode each chunk, and sign all params including `media_data`. Rejected: it base64-encodes (+33% bytes), percent-encodes, and HMAC-SHA1s ~6.7MB per 5MB chunk inside a CPU-limited Cloudflare Worker running in a `waitUntil` background task — far more CPU, memory, and bandwidth for no benefit. It also matches only the single-shot photo upload, not the chunked binary flow. Option A is the idiomatic chunked-APPEND form and a one-spot change.

### Decision: Send the APPEND chunk as the raw-binary `media` field, not `media_data`

Surfaced during verification: with the OAuth fix in place, INIT and APPEND authenticated but FINALIZE failed with `"Segments do not add up to provided total file size."` X's chunked APPEND accepts the chunk **either** as raw binary in the `media` field **or** as base64 text in `media_data` — the two are mutually exclusive. The original code sent **raw bytes in `media_data`**, so X base64-decoded them; each decoded segment's size differed from what we declared, the segment sizes stopped summing to the INIT `total_bytes`, and FINALIZE rejected the upload.

Fix: append the chunk as `media` (raw binary): `appendForm.append('media', new Blob([chunk]), 'chunk')`. This keeps the raw-bytes / no-base64 approach chosen above (the `media` field is exactly the raw-binary multipart counterpart to the base64 `media_data` field), so segment sizes are exact and FINALIZE succeeds. This defect was latent and pre-existing for the same reason as the OAuth one — it was unreachable while APPEND failed authentication, so the size mismatch never surfaced until the auth fix exposed it.

### Decision: Migrate all X media upload from the sunset v1.1 endpoint to v2 `/2/media/upload`

Surfaced during verification (third wall): with both APPEND fixes in place, the video uploaded fully and `STATUS` reached `succeeded`, but `POST /2/tweets` rejected the media id with `"Your media IDs are invalid"`. Root cause: the v1.1 media-upload endpoint (`upload.twitter.com/1.1/media/upload.json`) was **sunset on 2025-06-09**. It still responds (so INIT/APPEND/FINALIZE/STATUS appear to succeed and return a media id), but those ids are no longer valid for the v2 tweets endpoint.

Fix: move all X media upload to the v2 endpoints under `https://api.twitter.com/2/media/upload`, reading the v2 `data`-wrapped shape (`data.id` instead of `media_id_string`, `data.processing_info` instead of top-level `processing_info`):
- `uploadMediaFromBuffer` (photos) — single multipart POST to `POST /2/media/upload` with the raw bytes in the `media` field plus `media_category=tweet_image`; read `data.id`. Drops the v1.1 base64 path entirely (less CPU, no `media_data`).
- `uploadVideoToX` (video) — the **path-based dedicated endpoints**: `POST /2/media/upload/initialize` (JSON `{media_type,total_bytes,media_category}`) → `POST /2/media/upload/{id}/append` (multipart `media`+`segment_index`, id in path) → `POST /2/media/upload/{id}/finalize` (no body) → `GET /2/media/upload?command=STATUS&media_id={id}`.

**Endpoint variant — command-based vs path-based (decided empirically).** First attempt used the **command-based** `POST /2/media/upload` with `command=INIT` for video (smallest delta from the old code). The live INIT returned a 400 JSON-schema error proving that path is the **single-shot image endpoint only**: it rejects `command`/`total_bytes` as unknown properties and its `media_type`/`media_category` enums are image/subtitle-only (no `video/mp4`, no `tweet_video`). So **video must use the path-based dedicated endpoints**, while **photos correctly use the simple `POST /2/media/upload`**. Notably, that same 400 was a *schema* error, not 401/403 — confirming **OAuth 1.0a is accepted** on the v2 media endpoints, settling the change's main risk.

**Auth — kept OAuth 1.0a.** The v2 docs emphasize OAuth 2.0 Bearer (`media.write`), and some community reports claim 1.0a "doesn't work" on `/2/media/upload`. Chose to keep OAuth 1.0a because: (1) `postTweet` already authenticates with OAuth 1.0a against `api.twitter.com/2/*`; (2) the most common 1.0a "failure" on chunked upload is the multipart-signature bug fixed above, not a hard rejection; (3) the codebase has no OAuth 2.0 user-token plumbing, so 2.0 would be a large separate effort. This is the change's primary risk and is settled empirically by a live publish.

### Risk: v2 media endpoint may reject OAuth 1.0a

[The v2 `/2/media/upload` endpoint could require OAuth 2.0 user tokens] → Verify with a live publish immediately after deploy. If INIT returns 401/403 (auth), the fallback is a separate change adding OAuth 2.0 Authorization-Code-with-PKCE user tokens (scope `media.write`), token storage, and refresh — out of scope here. If INIT authenticates, the rest of the flow (already proven through STATUS) carries over.

### Finding (live verification): upload works on OAuth 1.0a; tweet ATTACH does not

Live testing settled the auth question with a twist. The v2 media **upload** endpoints accept OAuth 1.0a — the full path-based flow (initialize → append (1MB chunks; 5MB returns 413) → finalize → STATUS) authenticates and the video processes to `succeeded`. But **attaching** the resulting media to `POST /2/tweets` fails:
- `data.id` (bare numeric, `^[0-9]{1,19}$`, fully processed) → `"Your media IDs are invalid"`.
- `media_key` (`"7_<id>"`) → 400 regex error (so `media_ids` definitively wants the bare id, which `data.id` already is — `data.id` equals the numeric part of the `media_key`).

Format, value, and timing are all ruled out (we poll to `succeeded` before posting). The remaining variable is auth context: per the v2 docs, media→tweet attachment expects **OAuth 2.0 user tokens (`media.write`)**. The codebase is entirely OAuth 1.0a, so this is deferred to a dedicated change (`add-x-oauth2-media`). Everything in THIS change (the three APPEND fixes, the v1.1→v2 migration, 1MB chunking, always-poll-to-succeeded) is correct and is a prerequisite for that follow-up: the upload is done; only the attach auth remains.

## Risks / Trade-offs

- **[Manually setting `Content-Type` on the APPEND fetch would break multipart]** → The fix relies on the runtime adding the boundary. The current code already omits `Content-Type` on the APPEND `fetch` (only `Authorization` is set); the implementer must keep it that way. Captured as a scenario in the spec.
- **[Unused variable after removing the signing usage]** → Removing `appendParams` from the signature call could leave it referenced only by the FormData; ensure no unused-variable/lint breakage (the FormData appends literals directly, so `appendParams` can be deleted).
- **[No automated X integration test in the suite]** → Verification is manual: re-publish a video tweet and confirm it posts and `publish_results.errors.x` is absent. Low risk since the root cause is a well-understood OAuth base-string mismatch and INIT already proves the credentials/sign path works.

## Migration Plan

- Pure code fix, no data migration. Deploy the Worker (`cloudflare-bot`).
- Rollback: revert the one-spot change; behavior returns to the prior (broken) state — no state to unwind.
- Post-deploy verification: publish a draft with a video to X; confirm the tweet appears with the video and no `errors.x` is persisted on the draft.
