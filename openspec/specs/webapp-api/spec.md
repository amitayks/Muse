## Purpose

Defines the /api/v1/ HTTP API for the webapp, including Telegram initData authentication, CORS and rate limiting, and endpoints for the dashboard, drafts CRUD and actions, compose/generate/repost, repos, accounts, settings and keys, media upload, and prompts.
## Requirements
### Requirement: API route registration under /api/v1/
The system SHALL register all new webapp API routes under the `/api/v1/` namespace in the existing Cloudflare Worker's `index.ts`, with rate limiting and security headers.

#### Scenario: API routes registered
- **WHEN** the Worker receives a request to `/api/v1/*`
- **THEN** it SHALL route to the appropriate handler based on method and path, with rate limiting applied

#### Scenario: Unknown API route
- **WHEN** the Worker receives a request to `/api/v1/nonexistent`
- **THEN** it SHALL return HTTP 404 with `{ error: "Not Found" }`

### Requirement: Authentication via Telegram initData
All `/api/v1/*` endpoints SHALL validate the `Authorization: tma <initData>` header using the existing `validateInitData()` function.

#### Scenario: Valid auth
- **WHEN** a request includes a valid `Authorization: tma <initData>` header
- **THEN** the system SHALL extract the `chat_id` from the validated data and proceed with the handler

#### Scenario: Missing auth header
- **WHEN** a request to `/api/v1/*` has no `Authorization` header
- **THEN** the system SHALL return HTTP 401 with `{ error: "Unauthorized" }`

#### Scenario: Expired initData
- **WHEN** a request includes an expired initData (older than auth window)
- **THEN** the system SHALL return HTTP 401 with `{ error: "Session expired" }`

### Requirement: CORS headers for Cloudflare Pages domain
All `/api/v1/*` responses SHALL include CORS headers allowing requests from the Cloudflare Pages domain.

#### Scenario: CORS preflight
- **WHEN** an OPTIONS request is received at `/api/v1/*`
- **THEN** the system SHALL respond with HTTP 204 and headers: `Access-Control-Allow-Origin: <WEBAPP_URL>`, `Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS`, `Access-Control-Allow-Headers: Authorization, Content-Type`

#### Scenario: CORS on regular response
- **WHEN** any `/api/v1/*` response is sent
- **THEN** it SHALL include `Access-Control-Allow-Origin: <WEBAPP_URL>` header

### Requirement: Home API
The system SHALL provide a read-only endpoint that returns everything the Home screen needs in one request: the ordered list of upcoming scheduled drafts, the list of pending notifications (commit events + repost candidates not yet turned into drafts), draft status counts (for the Drafts hub), and the admin flag.

#### Scenario: GET /api/v1/home
- **WHEN** a GET request is made to `/api/v1/home`
- **THEN** the response SHALL include `{ scheduled: Array<{ id, title, firstTweet, scheduledAt, format, targets }>, notifications: Array<{ kind: 'commit' | 'repost', id, title, preview, repo?, score? }>, counts: { draft, approved, scheduled, published }, isAdmin: boolean }`, scoped to the authenticated user

#### Scenario: Notifications are pre-draft only
- **WHEN** the home notifications list is built
- **THEN** it SHALL include commit events and repost candidates that have NOT yet been turned into drafts, and exclude any that already have a generated draft

### Requirement: Repo search API
The system SHALL provide an endpoint backing the inline repo search that queries the user's accessible GitHub repositories using `GITHUB_TOKEN`, scoped to `GITHUB_OWNER`.

#### Scenario: GET /api/v1/repos/search
- **WHEN** a GET request is made to `/api/v1/repos/search?q=<query>`
- **THEN** the response SHALL include `{ results: Array<{ full_name, description, private }> }` of accessible repositories matching the query

#### Scenario: Empty query
- **WHEN** the query is empty or whitespace
- **THEN** the endpoint SHALL return an empty result set without error

### Requirement: Drafts CRUD API
The system SHALL provide full CRUD operations for drafts.

#### Scenario: GET /api/v1/drafts (list)
- **WHEN** a GET request is made to `/api/v1/drafts?status=draft&source=handwrite&page=0&limit=20`
- **THEN** the response SHALL include `{ drafts: Draft[], total: number }` filtered by the query parameters, scoped to the authenticated user's chat_id

#### Scenario: GET /api/v1/drafts/:id (detail)
- **WHEN** a GET request is made to `/api/v1/drafts/:id`
- **THEN** the response SHALL include the full draft with parsed content, publish targets, publish results, and user profile data for display

#### Scenario: PUT /api/v1/drafts/:id (update content)
- **WHEN** a PUT request is made with `{ content: DraftContent }` body
- **THEN** the draft's content SHALL be updated in D1, the draft's `has_video` flag SHALL be recomputed from the content's media, and the bot message SHALL be updated via `editMessageText`

#### Scenario: POST /api/v1/drafts/:id/approve
- **WHEN** a POST request is made to `/api/v1/drafts/:id/approve`
- **THEN** the draft's status SHALL change to "approved" and the bot message SHALL be updated

#### Scenario: POST /api/v1/drafts/:id/publish
- **WHEN** a POST request is made to `/api/v1/drafts/:id/publish`
- **THEN** the system SHALL set the draft status to "publishing", schedule the full publish pipeline (`publishDraft()`) to run in the background via `waitUntil`, and return immediately with `{ status: "publishing" }` rather than blocking on media upload and platform processing
- **AND** when the background pipeline completes, the draft status SHALL transition to "published" (on any success) or back to "approved" (on full failure), and the bot message SHALL be synced to reflect the outcome

#### Scenario: POST /api/v1/drafts/:id/schedule
- **WHEN** a POST request is made with `{ scheduled_at: "ISO8601" }` body
- **THEN** the draft SHALL be scheduled with status "scheduled" and the bot message SHALL be updated

#### Scenario: DELETE /api/v1/drafts/:id/schedule
- **WHEN** a DELETE request is made to `/api/v1/drafts/:id/schedule`
- **THEN** the schedule SHALL be removed and status reverted to "approved"

#### Scenario: DELETE /api/v1/drafts/:id
- **WHEN** a DELETE request is made to `/api/v1/drafts/:id`
- **THEN** the draft SHALL be deleted from D1 and associated R2 media cleaned up

#### Scenario: POST /api/v1/drafts/:id/refine
- **WHEN** a POST request is made with `{ instruction: "make it shorter" }` body
- **THEN** the system SHALL call the AI refinement function with the instruction and current content, update the draft, and return the new content

### Requirement: Compose API
The system SHALL provide an endpoint to create drafts from the webapp compose flow. The request options SHALL NOT include an image-generation flag; AI image generation is a separate per-tweet endpoint. Supported options are `aiRefine`, `analyzeImages`, `instruction`, and `langOverride`.

#### Scenario: POST /api/v1/compose
- **WHEN** a POST request is made with `{ tweets: [{text, media}], options: {aiRefine, analyzeImages, instruction, langOverride} }` body
- **THEN** the system SHALL create a new draft (with optional AI refinement and image analysis), store it in D1, and return the draft ID

#### Scenario: Image-generation flag ignored
- **WHEN** a legacy client sends an `imageGen` option
- **THEN** the endpoint SHALL ignore it and SHALL NOT generate an AI image during compose

### Requirement: Generate API
The system SHALL provide an endpoint to generate a draft from a commit source for the Composer's `[+ commit]` flow. It SHALL accept a partial commit SHA (resolved server-side via the existing `findCommitBysha`/`getContentSource`), optional user message text, optional AI instruction, and a language override. The request options SHALL NOT include an image-generation flag; image generation is a separate per-tweet endpoint invoked after the draft exists. It SHALL create a draft and return its id, driving bot sync.

#### Scenario: POST /api/v1/generate with partial SHA
- **WHEN** a POST request is made with `{ sha, message?, instruction?, options: { ai?, langOverride? } }`
- **THEN** the system SHALL resolve the commit (repo + details) from the partial SHA, generate content combining the commit with any message/instruction, create a draft, and return `{ draftId }`

#### Scenario: Image-generation flag ignored
- **WHEN** a legacy client sends an `image` option
- **THEN** the endpoint SHALL ignore it and SHALL NOT generate an AI image during generation

#### Scenario: Unresolvable SHA
- **WHEN** the partial SHA cannot be resolved in any accessible repo
- **THEN** the endpoint SHALL return an error (no draft created) with an actionable message

#### Scenario: Generation drives bot sync
- **WHEN** the draft is created from generation
- **THEN** the existing bot-message sync SHALL run so the bot reflects the new draft

### Requirement: Per-tweet image generation API
The system SHALL provide `POST /api/v1/drafts/:id/tweets/:idx/image`, an authenticated endpoint that generates an AI image for the tweet at `idx` in draft `id`, attaches it to that tweet's `media`, persists the draft, drives bot sync, and returns the new media reference. The full behavior is defined by the `per-tweet-image-generation` capability.

#### Scenario: Endpoint is registered under /api/v1/
- **WHEN** the API routes are registered
- **THEN** `POST /api/v1/drafts/:id/tweets/:idx/image` SHALL be routed to the per-tweet image generation handler with Telegram initData authentication applied

#### Scenario: Returns the new media reference
- **WHEN** generation succeeds for a draft the caller owns
- **THEN** the response SHALL include the new media `{ key, type: 'photo' }` attached to `content.tweets[idx].media`

### Requirement: Schedule API honors the user's configured timezone
The `POST /api/v1/drafts/:id/schedule` endpoint SHALL interpret the submitted datetime as a wall-clock time in the user's configured `users.timezone` offset and convert it to UTC for storage — the same conversion the bot's own schedule input performs — rather than trusting a client-side UTC value. The webapp SHALL send the raw wall-clock datetime from its picker (no device-timezone conversion), and SHALL render scheduled times in the configured offset, not the device timezone.

#### Scenario: Webapp schedules in the user's timezone
- **WHEN** a user with timezone `UTC+2` schedules a draft for wall-clock `2026-02-10T08:10` via the webapp
- **THEN** the endpoint SHALL store `scheduled_at` as `2026-02-10T06:10:00.000Z` (UTC), independent of the device timezone

#### Scenario: Past time is rejected
- **WHEN** the converted UTC instant is at or before the current time
- **THEN** the endpoint SHALL return an error and not schedule the draft

#### Scenario: Display agrees with the bot
- **WHEN** the webapp renders a scheduled draft's time (Home timeline, Composer banner)
- **THEN** it SHALL show the time in the user's configured offset, matching the bot's scheduled-time display

### Requirement: Repost API
The system SHALL provide an endpoint to create repost drafts from X URLs.

#### Scenario: POST /api/v1/repost
- **WHEN** a POST request is made with `{ url, tweets, options }` body
- **THEN** the system SHALL fetch the original tweet, create a repost draft with the composed text, and return the draft ID

### Requirement: Repos CRUD API
The system SHALL provide full CRUD operations for watched repositories.

#### Scenario: GET /api/v1/repos
- **WHEN** a GET request is made to `/api/v1/repos`
- **THEN** the response SHALL include all repos for the authenticated user with their config and overview status

#### Scenario: POST /api/v1/repos
- **WHEN** a POST request is made with `{ owner, repo }` body
- **THEN** the system SHALL create a new repo entry and set up the GitHub webhook

#### Scenario: PUT /api/v1/repos/:id
- **WHEN** a PUT request is made with config updates
- **THEN** the repo config SHALL be updated in D1

#### Scenario: DELETE /api/v1/repos/:id
- **WHEN** a DELETE request is made
- **THEN** the repo SHALL be deleted along with its webhook

### Requirement: Accounts CRUD API
The system SHALL provide full CRUD operations for Twitter accounts.

#### Scenario: GET /api/v1/accounts
- **WHEN** a GET request is made to `/api/v1/accounts`
- **THEN** the response SHALL include all accounts for the user with config and persona overview

#### Scenario: PUT /api/v1/accounts/:id
- **WHEN** a PUT request is made with config updates (threshold, toggles)
- **THEN** the account config SHALL be updated in D1

### Requirement: Settings API
The system SHALL provide endpoints for reading and updating all user settings.

#### Scenario: GET /api/v1/settings
- **WHEN** a GET request is made to `/api/v1/settings`
- **THEN** the response SHALL include all user settings: language, timezone, page_size, ai_provider, default_publish_targets, repost defaults, commit defaults, repo defaults, has_* feature flags, and connection status for each service

#### Scenario: PUT /api/v1/settings
- **WHEN** a PUT request is made with partial settings (e.g., `{ timezone: "UTC+2" }`)
- **THEN** only the provided fields SHALL be updated in the users table

#### Scenario: PUT /api/v1/settings/keys/:service
- **WHEN** a PUT request is made with `{ key: "..." }` for a service (gemini, claude, github, instagram)
- **THEN** the key SHALL be encrypted and stored, and the `has_*` flag SHALL be updated

#### Scenario: PUT /api/v1/settings/keys/x
- **WHEN** a PUT request is made with `{ apiKey, apiSecret, accessToken, accessSecret }` for the X service
- **THEN** all four credentials SHALL be encrypted and stored, and `has_x` SHALL be updated

### Requirement: Media upload API
The system SHALL provide an endpoint for uploading images and video from the webapp.

#### Scenario: POST /api/v1/media/upload (image)
- **WHEN** a POST request is made with a multipart form containing an image file
- **THEN** the image SHALL be stored in R2 with a key like `webapp/{chatId}/{timestamp}-{random}.{ext}`, and the response SHALL include `{ key, url }` where url is the `/media/:key` serving URL

#### Scenario: POST /api/v1/media/upload (video)
- **WHEN** a POST request is made with a multipart form containing a `video/mp4` file
- **THEN** the file SHALL be streamed into R2 (without buffering the entire body in memory) under the same `webapp/{chatId}/...` key format, and the response SHALL include `{ key, url }`

#### Scenario: Image size limit
- **WHEN** an uploaded image exceeds 10MB
- **THEN** the system SHALL return HTTP 413 with `{ error: "File too large (max 10MB)" }`

#### Scenario: Video size limit
- **WHEN** an uploaded video exceeds 50MB
- **THEN** the system SHALL return HTTP 413 with `{ error: "File too large (max 50MB)" }`

#### Scenario: Invalid file type
- **WHEN** the uploaded file is neither an allowed image (jpg, png, gif, webp) nor `video/mp4`
- **THEN** the system SHALL return HTTP 400 with `{ error: "Invalid file type" }`

### Requirement: Prompts API (migrate existing)
The system SHALL expose the existing prompt CRUD functionality under `/api/v1/prompts`.

#### Scenario: GET /api/v1/prompts
- **WHEN** a GET request is made
- **THEN** the response SHALL include all editable prompt types with their current content, isCustom flag, and isStale flag

#### Scenario: PUT /api/v1/prompts/:type
- **WHEN** a PUT request is made with `{ content, lang }` body
- **THEN** the prompt SHALL be saved (reusing existing prompt storage logic)

#### Scenario: DELETE /api/v1/prompts/:type
- **WHEN** a DELETE request is made
- **THEN** the custom prompt SHALL be deleted, reverting to default

### Requirement: Calendar range API

The system SHALL provide a read-only endpoint `GET /api/v1/calendar` that returns the authenticated user's posts within a date window: future **scheduled** drafts and past **published** posts. The window SHALL be specified as local calendar dates in the user's configured timezone (`from`, `to` as `YYYY-MM-DD`), and the backend SHALL expand them to a UTC window `[from 00:00 local → UTC, to 23:59:59 local → UTC]` using the same offset conversion as the schedule endpoint. Results SHALL be scoped to the authenticated user (`chat_id`). No new persisted schema is introduced — the endpoint reads `drafts.scheduled_at` (status `scheduled`) and the `published` table (`published_at`).

#### Scenario: GET /api/v1/calendar with a date window

- **WHEN** a GET request is made to `/api/v1/calendar?from=2026-06-01&to=2026-06-30` by a user in `UTC+2`
- **THEN** the response SHALL be `{ items: Array<{ id, kind: 'scheduled' | 'published', at, title, firstTweet, format, targets, draftId, url? }> }`, where `at` is the ISO-UTC instant (`scheduled_at` for scheduled, `published_at` for published), scoped to that user, covering the local window expanded to UTC

#### Scenario: Scheduled and published are distinguished

- **WHEN** the window contains both a draft scheduled in the future and a post published in the past
- **THEN** the scheduled draft SHALL be returned with `kind: 'scheduled'` and the published post with `kind: 'published'` (the latter MAY include its `url` permalink)

#### Scenario: Timezone-correct window boundaries

- **WHEN** the user is in `UTC+2` and requests `from=2026-06-01`
- **THEN** the window's lower bound SHALL be the UTC instant corresponding to `2026-06-01 00:00` local (i.e. `2026-05-31T22:00:00Z`), so day bucketing in the webapp agrees with the bot's timezone handling

#### Scenario: Empty window

- **WHEN** the user has no scheduled or published posts in the requested window
- **THEN** the response SHALL be `{ items: [] }` with a success status

#### Scenario: Authentication and scoping

- **WHEN** the request is made without valid Telegram initData, or for another user's data
- **THEN** the endpoint SHALL reject it (unauthenticated) or return only the authenticated user's items (never another user's posts)

