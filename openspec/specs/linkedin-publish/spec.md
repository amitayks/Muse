# linkedin-publish Specification

## Purpose
TBD - created by archiving change add-linkedin-publishing. Update Purpose after archive.
## Requirements
### Requirement: LinkedIn post creation via the UGC Posts API
The system SHALL provide `postToLinkedIn(env, commentary, media)` in `integrations/linkedin.ts` that creates a member share via `POST https://api.linkedin.com/v2/ugcPosts` with header `X-Restli-Protocol-Version: 2.0.0` and `Authorization: Bearer ${env.LINKEDIN_ACCESS_TOKEN}`. The request body SHALL set `author = env.LINKEDIN_PERSON_URN`, `lifecycleState = "PUBLISHED"`, `visibility.com.linkedin.ugc.MemberNetworkVisibility = "PUBLIC"`, and `specificContent.com.linkedin.ugc.ShareContent` with the supplied `shareCommentary.text` and a `shareMediaCategory` of `NONE`, `IMAGE`, or `VIDEO`. On success it SHALL return the created post URN and a viewable URL.

#### Scenario: Text-only post
- **WHEN** `postToLinkedIn()` is called with commentary and no media
- **THEN** the body SHALL set `shareMediaCategory = "NONE"` and omit the `media` array
- **AND** on a `201 Created` response it SHALL read the post URN from the `X-RestLi-Id` response header

#### Scenario: Image post
- **WHEN** `postToLinkedIn()` is called with one or more image asset URNs
- **THEN** the body SHALL set `shareMediaCategory = "IMAGE"` and include one `media[]` entry per asset, each with `status = "READY"` and `media = "<asset urn>"`

#### Scenario: Video post
- **WHEN** `postToLinkedIn()` is called with a single video asset URN
- **THEN** the body SHALL set `shareMediaCategory = "VIDEO"` and include exactly one `media[]` entry referencing the video asset

#### Scenario: Returned URL is viewable
- **WHEN** a post is created and its URN is resolved
- **THEN** `postToLinkedIn()` SHALL return a `url` that links to the post on LinkedIn (e.g. `https://www.linkedin.com/feed/update/<urn>`)

### Requirement: LinkedIn media registration and binary upload
The system SHALL provide `uploadImageToLinkedIn(env, bytes)` and `uploadVideoToLinkedIn(env, bytes)` that register an upload via `POST https://api.linkedin.com/v2/assets?action=registerUpload` — with `registerUploadRequest.recipes = ["urn:li:digitalmediaRecipe:feedshare-image"]` (or `feedshare-video`), `owner = env.LINKEDIN_PERSON_URN`, and `serviceRelationships = [{ relationshipType: "OWNER", identifier: "urn:li:userGeneratedContent" }]` — then upload the binary to the returned `uploadUrl`, and return the returned `asset` URN.

#### Scenario: Register and upload an image
- **WHEN** `uploadImageToLinkedIn()` is called with image bytes
- **THEN** it SHALL register with the `feedshare-image` recipe, receive `{ uploadUrl, asset }`, upload the bytes to `uploadUrl` with the bearer token, and return the `asset` URN

#### Scenario: Register and upload a video
- **WHEN** `uploadVideoToLinkedIn()` is called with video bytes
- **THEN** it SHALL register with the `feedshare-video` recipe and otherwise follow the same register → upload → return-asset flow

#### Scenario: Upload failure surfaces to the caller
- **WHEN** registration or the binary upload returns a non-OK response
- **THEN** the function SHALL throw rather than returning a partial/empty asset, so the publish branch can record a per-platform error

### Requirement: LinkedIn auth-error classification
LinkedIn integration calls SHALL classify a `401`/invalid-or-expired-token response as a structured auth error (`LinkedInPublishError` with `isAuthError = true`), distinct from transient failures (network, `5xx`, `429`), so the publish pipeline can drive a "Reconnect LinkedIn" affordance only on a genuine auth failure.

#### Scenario: Invalid/expired token
- **WHEN** a LinkedIn API call returns `401` (or a body indicating the access token is invalid/expired)
- **THEN** the integration SHALL throw `LinkedInPublishError` with `isAuthError = true`

#### Scenario: Transient failure
- **WHEN** a LinkedIn API call fails with a network error, `5xx`, or `429`
- **THEN** the integration SHALL throw an error with `isAuthError = false` (treated as transient, not a reconnect trigger)

### Requirement: LinkedIn-not-configured guard
The integration SHALL throw an auth-flagged error when `env.LINKEDIN_ACCESS_TOKEN` or `env.LINKEDIN_PERSON_URN` is missing, mirroring the Instagram `requireInstagramConfig` guard, so an unconnected/expired account fails fast with a reconnect-able error rather than making an unauthenticated request.

#### Scenario: Missing access token
- **WHEN** `postToLinkedIn()` or an upload helper runs and `env.LINKEDIN_ACCESS_TOKEN` is undefined
- **THEN** it SHALL throw `LinkedInPublishError` with `isAuthError = true` and SHALL NOT call the LinkedIn API

#### Scenario: Missing person URN
- **WHEN** a LinkedIn call runs and `env.LINKEDIN_PERSON_URN` is undefined
- **THEN** it SHALL throw `LinkedInPublishError` with `isAuthError = true`

