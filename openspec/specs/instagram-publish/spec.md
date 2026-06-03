## Purpose

Publishing of images, carousels, stories, and reels to Instagram via the Meta Content Publishing API, using per-user encrypted credentials. Publish failures surface the real Graph API reason and flag auth (expired-token) errors so the user can reconnect.
## Requirements
### Requirement: Instagram feed post publishing (single image)
The system SHALL provide a function `publishToInstagramPost(env, imageUrl, caption)` that publishes a single image as an Instagram feed post via the Meta Content Publishing API.

#### Scenario: Successful single image post
- **WHEN** `publishToInstagramPost()` is called with a valid public image URL and caption
- **THEN** the system SHALL create a media container via `POST /{account}/media` with `image_url` and `caption`
- **AND** poll the container status every 5 seconds until `status_code` is `FINISHED` (max 5 minutes)
- **AND** publish via `POST /{account}/media_publish` with `creation_id`
- **AND** return `{ post_id: string, url: string }`

#### Scenario: Caption trimmed to 2200 characters
- **WHEN** the caption exceeds 2200 characters
- **THEN** the system SHALL trim the caption to 2200 characters before creating the container

#### Scenario: Container processing fails
- **WHEN** the container status becomes `ERROR` during polling
- **THEN** the system SHALL return an error with the status details

#### Scenario: Container processing timeout
- **WHEN** the container has not reached `FINISHED` after 5 minutes
- **THEN** the system SHALL return a timeout error

### Requirement: Instagram carousel post publishing (multiple images)
The system SHALL provide a function `publishToInstagramCarousel(env, imageUrls, caption)` that publishes multiple images as a carousel feed post.

#### Scenario: Successful carousel post with 3 images
- **WHEN** `publishToInstagramCarousel()` is called with 3 valid public image URLs
- **THEN** the system SHALL create a child container for each image via `POST /{account}/media` with `image_url` and `is_carousel_item: true`
- **AND** create a carousel container via `POST /{account}/media` with `media_type: CAROUSEL` and `children` array of child container IDs
- **AND** publish the carousel container via `POST /{account}/media_publish`
- **AND** return `{ post_id: string, url: string }`

#### Scenario: One child container fails
- **WHEN** one of the child container creations fails
- **THEN** the system SHALL skip that image and continue with the remaining images
- **AND** if at least 2 images succeed, publish the carousel with the successful images
- **AND** if fewer than 2 images succeed, fall back to single image post with the first successful image

#### Scenario: Carousel with 10 images (Instagram maximum)
- **WHEN** more than 10 images are provided
- **THEN** the system SHALL use only the first 10 images

### Requirement: Instagram story publishing
The system SHALL provide a function `publishToInstagramStory(env, imageUrl)` that publishes an image as an Instagram Story.

#### Scenario: Successful story post
- **WHEN** `publishToInstagramStory()` is called with a valid public image URL
- **THEN** the system SHALL create a media container via `POST /{account}/media` with `image_url` and `media_type: STORIES`
- **AND** poll until `FINISHED` and publish
- **AND** return `{ post_id: string, url: null }` (stories have no permanent URL)

#### Scenario: Story image is 9:16 aspect ratio
- **WHEN** the image provided is already in 9:16 aspect ratio
- **THEN** the system SHALL use it directly without transformation

### Requirement: Instagram reel publishing (reuse existing)
The system SHALL reuse the existing `publishVideoToInstagram()` function from `services/video-publish.ts` for publishing video content as Instagram Reels. The function signature remains unchanged.

#### Scenario: Draft with video publishes as Reel
- **WHEN** a draft with `has_video = 1` and `instagram_reel` target is selected
- **THEN** the publish pipeline SHALL call the existing `publishVideoToInstagram()` with the video data

### Requirement: Instagram credentials from user-level encrypted keys
All Instagram API calls SHALL use the per-user encrypted credentials (`instagram_token_enc`, `instagram_account_id_enc`) hydrated into `env.INSTAGRAM_ACCESS_TOKEN` and `env.INSTAGRAM_BUSINESS_ACCOUNT_ID` via the existing `hydrateEnv()` flow.

#### Scenario: User with configured Instagram
- **WHEN** an Instagram publish is attempted and the user has valid Instagram tokens
- **THEN** the hydrated `env.INSTAGRAM_ACCESS_TOKEN` and `env.INSTAGRAM_BUSINESS_ACCOUNT_ID` SHALL be used

#### Scenario: User without Instagram configured
- **WHEN** an Instagram publish is attempted and the user has no Instagram tokens
- **THEN** the system SHALL return an error indicating Instagram is not configured
- **AND** the error SHALL be recorded in `publish_results.errors`

### Requirement: Public media URL for Instagram ingestion
Instagram's API fetches media via URL. The existing `/media/{key}` public route SHALL serve both images and videos from R2 for Instagram to ingest.

#### Scenario: Instagram fetches image from public route
- **WHEN** Instagram's API needs to ingest an image stored in R2
- **THEN** the system SHALL provide the URL `${env.WORKER_URL}/media/${r2Key}` to the Instagram API
- **AND** the `/media/` route SHALL respond with the correct MIME type and `Cache-Control: public, max-age=86400`

#### Scenario: Image MIME type handling
- **WHEN** the `/media/` route serves a PNG file
- **THEN** the response `Content-Type` SHALL be `image/png`
- **AND** when serving JPEG, the Content-Type SHALL be `image/jpeg`

### Requirement: Instagram publish service file
All Instagram publishing functions for regular drafts SHALL be located in `services/instagram-publish.ts`, separate from the existing `services/video-publish.ts`.

#### Scenario: Service file organization
- **WHEN** a developer looks for Instagram post/story/carousel publishing code
- **THEN** the functions SHALL be in `services/instagram-publish.ts`
- **AND** the existing video-specific Instagram Reel code SHALL remain in `services/video-publish.ts`

### Requirement: Structured, actionable Instagram publish errors
Instagram publish functions (`publishToInstagramPost`, `publishToInstagramCarousel`, `publishToInstagramStory` in `services/instagram-publish.ts`, and the Instagram paths in `services/video-publish.ts`) SHALL surface the underlying Graph API error rather than returning a bare `null` that the pipeline reports as a generic `"Instagram story publish failed"`. On failure, the system SHALL parse the Graph API JSON error (`{ error: { message, code, error_subcode } }`) and propagate a structured result containing at minimum the human-readable `message`, the numeric `code`, and an `isAuthError` flag.

#### Scenario: Container creation failure carries the real reason
- **WHEN** an Instagram media-container creation responds non-OK with a Graph API error body
- **THEN** the system SHALL parse `error.message` and `error.code` from the response
- **AND** propagate them so the user-facing failure message reflects the real reason (e.g., expired token, invalid aspect ratio) instead of a generic string

#### Scenario: Expired/invalid token is classified as an auth error
- **WHEN** the Graph API returns `code: 190` (e.g., "Error validating access token: Session has expired")
- **THEN** the structured error SHALL set `isAuthError = true`
- **AND** the user-facing reason SHALL be a clear message such as "Instagram access token expired — reconnect Instagram"

#### Scenario: Error reason reaches publish_results
- **WHEN** an Instagram platform fails during `publishDraft()`
- **THEN** the mapped reason SHALL be recorded in `publish_results.errors` keyed by the failing platform (e.g., `instagram_story`)
- **AND** the pipeline SHALL NOT replace it with a generic `"Instagram story publish failed"`

### Requirement: Reconnect affordance on Instagram auth failures
When an Instagram publish fails due to an auth error (expired/invalid token), the user-facing failure notification SHALL include a "Reconnect Instagram" next-step action, for BOTH interactive publishing (`actions/publish.ts`) and scheduled/cron publishing (`handlers/cron.ts`).

#### Scenario: Interactive publish auth failure shows reconnect button
- **WHEN** a user taps Publish and the Instagram platform fails with `isAuthError = true`
- **THEN** the failure message SHALL display the actionable reason
- **AND** SHALL include a button that routes the user to reconnect their Instagram credentials

#### Scenario: Scheduled publish auth failure notifies with reconnect
- **WHEN** a scheduled (cron) publish fails with an Instagram auth error
- **THEN** the user SHALL receive a notification containing the actionable reason and a reconnect action

#### Scenario: Non-auth failure does not offer reconnect
- **WHEN** an Instagram publish fails for a non-auth reason (e.g., aspect ratio, processing timeout)
- **THEN** the failure message SHALL show the specific reason
- **AND** SHALL NOT present the reconnect action (which would not resolve the problem)

