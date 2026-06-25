# media-prewarm Specification

## Purpose
TBD - created by archiving change prewarm-media-uploads. Update Purpose after archive.
## Requirements
### Requirement: Media upload store
The system SHALL provide a `media_uploads` D1 table holding one row per `(draft_id, media_key, platform)` that records a pre‑uploaded platform media handle for reuse at publish. It SHALL include at least: `draft_id`, `chat_id`, `media_key` (R2 key of the source media), `platform` (`x`|`instagram_post`|`instagram_reel`|`instagram_story`|`linkedin`), `media_kind` (`photo`|`video`), `handle` (platform `media_id` / container id / asset URN; null until ready), `caption_hash` (Instagram only — null otherwise), `status` (`pending`|`ready`|`failed`|`expired`), `expires_at`, `attempts`, `max_attempts`, `last_error`, `next_attempt_at`, `created_at`, `updated_at`; with indexes on (`status`,`next_attempt_at`), `draft_id`, and `chat_id`. The scheduling columns let the table double as the warm queue. Created via `schema.sql`, a numbered migration, and an idempotent `migrate.ts` block.

#### Scenario: One row per draft/media/platform
- **WHEN** a media item targets N platforms
- **THEN** there SHALL be at most one `media_uploads` row per `(draft_id, media_key, platform)` (upsert, never duplicate)

#### Scenario: Migration is idempotent
- **WHEN** the migration runs and `media_uploads` already exists
- **THEN** it SHALL be a no‑op (CREATE TABLE IF NOT EXISTS)

### Requirement: Warm media at attach time
When media is uploaded or draft content is saved and the draft is warm‑eligible, the system SHALL enqueue and (best‑effort, in the background) perform the warm for each media item against each platform it targets.

#### Scenario: Attach an image to a now/near-term draft
- **WHEN** a user adds media to an unscheduled or within‑window draft via `/api/v1/media/upload` or a content save (`updateDraftContent`)
- **THEN** a `media_uploads` row SHALL be created (`pending`) for each targeted platform
- **AND** a background warm SHALL upload it and set the row `ready` with the platform `handle` and an `expires_at`

#### Scenario: Warm only the targeted platforms
- **WHEN** a media item targets a subset of the draft's publish platforms (per `TweetMedia.targets`)
- **THEN** warm rows SHALL be created only for that intersection, not for untargeted platforms

### Requirement: Warm scheduled posts within the validity window
A draft scheduled further out than the platform validity window SHALL be warmed once, close to publish, so the handle is still valid at publish time.

#### Scenario: Warm ~20h before a far-future scheduled post
- **WHEN** a draft is scheduled (e.g. a week out) and `now >= scheduled_at − 20h`
- **THEN** the cron SHALL warm its media for the targeted platforms exactly once
- **AND** the resulting handles SHALL be valid through the scheduled publish time (a margin under the 24 h cap)

#### Scenario: Do not warm a far-out post prematurely
- **WHEN** a scheduled draft is still more than 20 h from its `scheduled_at`
- **THEN** the system SHALL NOT warm it yet (a handle warmed now would expire before publish)

#### Scenario: Re-warm handles nearing expiry
- **WHEN** a still‑unpublished draft has `ready` handles approaching `expires_at`
- **THEN** the cron SHALL re‑warm them so a valid handle exists at publish

### Requirement: Per-platform handle semantics
The warm engine SHALL encode each platform's reuse rules: X `media_id` valid 24 h and caption‑independent; Instagram container valid 24 h and caption‑coupled (the caption is part of the container); LinkedIn asset URN durable and caption‑independent. `expires_at` SHALL be set conservatively (X/IG ≈ warm time + 23 h; LinkedIn far/none).

#### Scenario: X handle is media-only
- **WHEN** an X media item is warmed and later the draft's tweet text changes (caption‑independent)
- **THEN** the X handle SHALL remain valid (not invalidated by the text change)

#### Scenario: Instagram handle expires at 24h
- **WHEN** an Instagram container is warmed
- **THEN** its `expires_at` SHALL be set within the 24 h window so it is not reused after expiry

#### Scenario: LinkedIn asset is durable
- **WHEN** a LinkedIn asset is warmed
- **THEN** it SHALL be reusable without a short expiry (no 24 h ceiling)

### Requirement: Warm engine reuses shared upload primitives
Warming SHALL upload via the same per‑platform "upload one media → handle" primitives used by `publishDraft`, so warm and publish produce identical handle encodings.

#### Scenario: Same code warms and publishes
- **WHEN** a media item is warmed for X (or IG, or LinkedIn)
- **THEN** the handle SHALL be produced by the same upload function the publish path uses, and be directly usable by `publishDraft` without transformation

#### Scenario: Warm retries with backoff and dead-letters
- **WHEN** a warm attempt fails transiently
- **THEN** the row SHALL increment `attempts`, record `last_error`, and reschedule with backoff; on `max_attempts` it SHALL be marked `failed` (publish falls back to inline upload)

### Requirement: Invalidate handles on media, target, or caption change
The system SHALL invalidate warmed handles that no longer match the draft so a stale handle is never published.

#### Scenario: Media replaced or removed
- **WHEN** a media item's `media_key` is no longer present in the draft content
- **THEN** its `media_uploads` rows SHALL be removed/expired (and new media gets new `pending` rows)

#### Scenario: Publish targets changed
- **WHEN** the draft's publish targets change
- **THEN** rows for newly‑targeted platforms SHALL be created and rows for removed platforms orphaned

#### Scenario: Instagram caption changed
- **WHEN** the caption that an Instagram container baked in changes (its `caption_hash` no longer matches)
- **THEN** the affected Instagram rows SHALL be invalidated and re‑warmed
- **AND** X and LinkedIn rows SHALL NOT be invalidated by a caption change

### Requirement: Warming is best-effort, never a publish dependency
A missing, `failed`, or expired handle SHALL NOT block publishing — the publish path SHALL fall back to uploading inline.

#### Scenario: Publish with no warm available
- **WHEN** a draft is published and a platform has no `ready`, non‑expired handle
- **THEN** `publishDraft` SHALL upload that media inline (today's path) and still publish correctly

