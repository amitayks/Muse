# gemini-image-resilience Specification

## Purpose
TBD - created by archiving change harden-gemini-image-generation. Update Purpose after archive.
## Requirements
### Requirement: Shared resilient image generation helper
The system SHALL provide a single shared helper (`generateGeminiImage`) that performs all Gemini image generation. The helper SHALL accept the request `parts` (a combined text part plus zero or more `inline_data` image parts) and an optional requested image size (defaulting to `4K`), and SHALL return the decoded final image bytes and MIME type on success, or throw a typed error on failure. All image generation call sites (`actions/image-create.ts`, `actions/thumb.ts`, `ai/gemini.ts`) SHALL generate images through this helper rather than issuing their own `:generateContent` request and parsing.

#### Scenario: Successful generation returns decoded image
- **WHEN** a caller invokes the helper with valid parts
- **THEN** the helper SHALL POST to the Gemini `:generateContent` endpoint with `responseModalities: ['IMAGE', 'TEXT']` and `imageConfig.imageSize` set to the requested size
- **AND** SHALL return the decoded final image bytes and its MIME type

#### Scenario: All call sites use the helper
- **WHEN** image-create compose, thumbnail generation, or generic draft image generation produces an image
- **THEN** each SHALL call the shared helper
- **AND** SHALL NOT contain its own inline `:generateContent` request, `response.ok` handling, or `inline_data` extraction

### Requirement: Retry transient failures with bounded backoff
The helper SHALL retry on transient failures: HTTP `500`, `502`, `503`, `429`, and network/fetch errors. Retries SHALL be bounded by a small maximum attempt count (default 3) with short exponential backoff between attempts. When a `Retry-After` header is present, the helper SHALL prefer it (clamped to a small maximum). When all attempts are exhausted, the helper SHALL throw a typed error carrying the last HTTP status and a truncated detail string.

#### Scenario: Transient 500 then success
- **WHEN** the first attempt returns `500 INTERNAL`
- **AND** a subsequent attempt succeeds
- **THEN** the helper SHALL return the image from the successful attempt
- **AND** the caller SHALL NOT see an error

#### Scenario: Overloaded 503/429 is retried
- **WHEN** an attempt returns `503` or `429`
- **THEN** the helper SHALL back off and retry up to the maximum attempt count
- **AND** SHALL honor a `Retry-After` header if provided

#### Scenario: All attempts exhausted
- **WHEN** every attempt (up to the maximum) returns a transient error
- **THEN** the helper SHALL throw a typed error containing the last status and detail
- **AND** the calling flow SHALL surface its existing user-facing failure message

### Requirement: Fail fast on client errors
The helper SHALL NOT retry on non-transient client errors (`400`, `401`, `403`, `404`, and other non-`429` `4xx`). On such a response the helper SHALL throw immediately with the status and detail.

#### Scenario: Bad request is not retried
- **WHEN** an attempt returns `400`
- **THEN** the helper SHALL throw immediately without further attempts

#### Scenario: Auth/permission error is not retried
- **WHEN** an attempt returns `401` or `403`
- **THEN** the helper SHALL throw immediately without further attempts

### Requirement: Resolution fallback on retry
The helper SHALL start at the requested image size (default `4K`) and, on the first retry after a transient failure, SHALL downgrade the image size to `2K` for the remaining attempts. The helper SHALL NOT downgrade below `2K`. The downgrade applies only to retries; the first attempt always uses the requested size.

#### Scenario: 4K fails, 2K retry succeeds
- **WHEN** the first attempt at `4K` returns a transient error
- **AND** the helper retries at `2K` and succeeds
- **THEN** the helper SHALL return the `2K` image
- **AND** the caller SHALL receive a successful result rather than an error

#### Scenario: Downgrade sticks for remaining attempts
- **WHEN** the size has been downgraded to `2K` after a transient failure
- **AND** a further retry is needed
- **THEN** the subsequent attempt SHALL also use `2K` (never `1K` or lower, never back to `4K`)

#### Scenario: First attempt always honors requested size
- **WHEN** a caller requests `4K`
- **THEN** the first attempt SHALL use `4K`
- **AND** a downgrade SHALL occur only after a transient failure

### Requirement: Extract the final image, not a draft frame
The helper SHALL extract the final generated image as the **last** `inline_data` part of `candidates[0].content.parts`, preferring parts not marked `thought: true`. Intermediate "thinking"/draft image parts SHALL NOT be returned when a later non-thought image part exists. When no `thought` markers are present, the last `inline_data` part SHALL be used. When the response contains no `inline_data` part, the helper SHALL throw a typed error including any text parts returned by the model.

#### Scenario: Response with draft frames returns the final image
- **WHEN** the response parts contain one or more draft images (`thought: true`) followed by a final image
- **THEN** the helper SHALL return the final (non-thought / last) image
- **AND** SHALL NOT return a draft frame

#### Scenario: Single-image response unchanged
- **WHEN** the response contains exactly one `inline_data` part
- **THEN** the helper SHALL return that image (first equals last)

#### Scenario: No image in response
- **WHEN** the response contains no `inline_data` part
- **THEN** the helper SHALL throw a typed error including the model's text output (if any)

### Requirement: One image per generation
The helper SHALL produce exactly one final image per call. The system SHALL NOT attempt to request multiple output images from a single `:generateContent` call (the model does not support `n`/`candidateCount`/`sampleCount`).

#### Scenario: Multiple images require multiple calls
- **WHEN** more than one image is needed
- **THEN** the system SHALL invoke the helper once per image (or use a different image API)
- **AND** SHALL NOT pass an output-count parameter to `:generateContent`

