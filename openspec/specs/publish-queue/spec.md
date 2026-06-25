# publish-queue Specification

## Purpose
TBD - created by archiving change durable-publish-queue. Update Purpose after archive.
## Requirements
### Requirement: Durable publish-job table
The system SHALL provide a `publish_jobs` D1 table that durably holds one in-flight publish per draft, generalizing the `x_pending_posts` pattern. It SHALL include at least: `draft_id` (PRIMARY KEY), `chat_id`, `lang`, `prior_status` (the status to restore on failure — `approved`/`scheduled`), `state` (`pending`|`processing`|`done`|`failed`), `progress` (JSON of completed uploads keyed by platform + tweet index + media index), `attempts`, `max_attempts`, `last_error`, `next_attempt_at`, `created_at`, `updated_at`, with indexes on (`state`,`next_attempt_at`) and `chat_id`. The table SHALL be created via `schema.sql`, a numbered `migrations/*.sql`, and an idempotent block in `routes/migrate.ts`.

#### Scenario: One job per draft
- **WHEN** a publish is enqueued for a draft that already has a `publish_jobs` row
- **THEN** the enqueue SHALL upsert (not duplicate) so there is at most one job per draft

#### Scenario: Migration is idempotent
- **WHEN** the migration runs and `publish_jobs` already exists
- **THEN** it SHALL be a no-op (CREATE TABLE IF NOT EXISTS) and SHALL NOT error

### Requirement: Enqueue on publish
All publish entry points SHALL enqueue a publish job after setting the draft to `'publishing'`, capturing the draft's prior status for restoration on failure.

#### Scenario: Enqueue sets pending and prior status
- **WHEN** a publish job is enqueued for a draft
- **THEN** the row SHALL be created with `state='pending'`, `attempts=0`, `next_attempt_at <= now`, and `prior_status` = the draft's status before it was set to `'publishing'`

### Requirement: Fresh-budget chunked processing on the every-minute cron
A publish-job processor SHALL run on the existing `* * * * *` cron tick (alongside `processPendingXPosts`), each invocation a fresh budget. It SHALL claim due jobs, run `publishDraft()` with the saved `progress` under a soft time deadline, persist the returned `progress`, and either finalize (when `done`) or reschedule (when `needs-more`) so a heavy publish completes across multiple ticks.

#### Scenario: Processor runs on the frequent tick
- **WHEN** `index.ts scheduled()` receives `event.cron === '* * * * *'`
- **THEN** it SHALL run the publish-job processor in addition to the deferred-X-post processor
- **AND** it SHALL NOT run the heavy `*/15` coordinator on this tick

#### Scenario: Heavy publish completes across ticks
- **WHEN** a multi-video publish cannot finish within one invocation's soft deadline
- **THEN** the processor SHALL persist the partial `progress`, leave the job due, and a subsequent tick SHALL resume from that `progress` until the publish is `done`
- **AND** no media SHALL be uploaded more than once

#### Scenario: Soft deadline prevents mid-upload cancellation
- **WHEN** an invocation approaches its budget
- **THEN** the processor SHALL stop starting new uploads, persist progress, and return rather than being hard-cancelled by the runtime

### Requirement: Claim/lease prevents concurrent processing
The processor SHALL claim a job before working it, so overlapping invocations (e.g. the inline first chunk and a cron tick) never process the same job concurrently.

#### Scenario: Conditional claim
- **WHEN** the processor selects a due job
- **THEN** it SHALL atomically transition it (`pending`→`processing`, pushing `next_attempt_at` forward) via a conditional UPDATE, and SHALL skip jobs already `processing`

### Requirement: First chunk runs inline for instant light posts
Request-context entry points SHALL kick the first processing chunk inline via `ctx.waitUntil()` immediately after enqueue, so light/normal posts finish without waiting for the next cron tick.

#### Scenario: Light post finishes immediately
- **WHEN** a single-platform, no-or-small-media draft is published from a request context
- **THEN** the inline first chunk SHALL complete the publish and the user SHALL see the result without ~60 s of latency

#### Scenario: Heavy post hands off to cron
- **WHEN** the inline first chunk returns `needs-more`
- **THEN** the job SHALL remain due and the `* * * * *` processor SHALL continue it

### Requirement: Retries, backoff, and dead-lettering
The processor SHALL retry transient failures with backoff and dead-letter a job after `max_attempts`.

#### Scenario: Transient failure reschedules with backoff
- **WHEN** a processing attempt throws a transient error
- **THEN** the job SHALL increment `attempts`, record `last_error`, and set `next_attempt_at` per a backoff schedule (mirroring `x_pending_posts`)

#### Scenario: Exhausted attempts dead-letter
- **WHEN** `attempts` reaches `max_attempts` without completing
- **THEN** the job SHALL be set `state='failed'`, the draft SHALL be restored to `prior_status`, and the user SHALL be notified that the publish failed

### Requirement: Idempotent finalization
The processor SHALL finalize a publish at most once and SHALL never double-post.

#### Scenario: Re-read guards finalization
- **WHEN** the processor is about to finalize a job
- **THEN** it SHALL re-read the draft and SHALL only finalize if the draft is still `'publishing'` with no existing `published` record; otherwise it SHALL delete the job without re-posting

#### Scenario: Terminal success finalizes and notifies once
- **WHEN** `publishDraft()` returns `done` with at least one platform success
- **THEN** the published record and `'published'` status SHALL be set (createPublished before updateDraftStatus), the job row SHALL be deleted, and exactly one publish notification SHALL be sent to the user

#### Scenario: Deferred-X-video composes with the job
- **WHEN** a publish includes an X video whose tweet-creation is deferred
- **THEN** the publish job MAY complete its upload/post work and the existing `x_pending_posts` mechanism SHALL still handle the X-media-attachability wait independently

### Requirement: Reaper accounts for live publish jobs
The stuck-`publishing` reaper SHALL NOT reset a draft that has a live (`pending`/`processing`) `publish_jobs` row, so an in-flight chunked publish is never prematurely reverted; it SHALL remain the backstop for drafts whose job row is gone or `failed`.

#### Scenario: In-flight job excluded from reaping
- **WHEN** a draft is in `'publishing'` and has a `pending`/`processing` `publish_jobs` row
- **THEN** the reaper SHALL NOT reset it

#### Scenario: Orphan without a job is still reaped
- **WHEN** a draft is in `'publishing'` longer than the threshold with no `publish_jobs` row and no `published` record
- **THEN** the reaper SHALL reset it (to `scheduled` if future else `approved`) as the backstop

