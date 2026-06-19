# Image Generation Spec

## Purpose

Governs draft image generation: image creation is an explicit per-tweet action (see the `per-tweet-image-generation` capability), not lazy-on-view or coupled to content/webhook generation; deferral of generation away from webhook processing; and tweet-card rendering (including repost cards) for Instagram-bound drafts that lack an image.

## Requirements

### Requirement: Image display in Telegram
The system SHALL display already-existing media alongside draft content in Telegram. Rendering a draft SHALL NOT trigger image generation; if a draft has no media, it SHALL render without an image.

#### Scenario: Draft has media
- **WHEN** rendering draft detail for a draft with stored per-tweet media or a legacy `image_url`
- **THEN** the system SHALL send the photo with a caption containing the draft preview and action buttons

#### Scenario: Draft has no media
- **WHEN** rendering draft detail for a draft with no media
- **THEN** the system SHALL render the draft text and buttons without an image and SHALL NOT call the image model

### Requirement: Webhook does not generate images
Webhook processing SHALL NOT generate images; image generation is deferred to view time.

#### Scenario: Push webhook received
Given a push event
When processing webhook
Then generate content via Grok
And create draft
And send notification
And do not generate image

### Requirement: Tweet card image generation for Instagram-bound drafts
When a draft targets any Instagram platform (post, story) and has no image (neither draft-level `image_url` nor per-tweet `media`), the system SHALL generate tweet card images via the tweet-card-renderer instead of AI image generation.

#### Scenario: Instagram-bound draft without image at publish time
- **WHEN** `publishDraft()` is called for a draft targeting Instagram Post with no image
- **THEN** the system SHALL call the tweet card renderer to generate styled tweet card images
- **AND** store the cards in R2 at `tweet-cards/{draftId}/{index}.png`
- **AND** use these cards for the Instagram publish

#### Scenario: Instagram-bound draft with existing image
- **WHEN** `publishDraft()` is called for a draft targeting Instagram Post with an existing image
- **THEN** the system SHALL use the existing image for Instagram (no tweet card generation)

#### Scenario: Draft targeting only X without image
- **WHEN** `publishDraft()` is called for a draft targeting only X with no image
- **THEN** the existing behavior SHALL apply: attempt AI image generation, fall back to posting without image

#### Scenario: Thread draft generates multiple tweet cards
- **WHEN** a thread draft with 3 tweets targets Instagram Post with no image
- **THEN** the system SHALL render 3 tweet card images (with connecting lines)
- **AND** publish them as an Instagram carousel

### Requirement: Repost tweet card includes original tweet
When a repost draft targets Instagram and has no image, the tweet card SHALL render the user's commentary with an embedded card of the original tweet.

#### Scenario: Repost card for Instagram
- **WHEN** a repost draft targets Instagram Post and has no image
- **THEN** the tweet card SHALL show the user's text at the top
- **AND** an embedded card of the original tweet below (with original author's avatar, username, and text)
- **AND** the user's own profile data (`own_profile_image_url`, `own_username_x`, `own_display_name_x`) SHALL be used for the outer card

### Requirement: Commit compose image generation uses identity-aware AI pattern
Commit compose image generation SHALL use the unified per-tweet image service (the same `image-prompt-builder` skill + identity pipeline used by handwrite and the webapp), generating the image in a dedicated call after the draft exists and attaching it to `content.tweets[0].media`. It SHALL NOT embed an `imagePrompt` field inside the `work-progress`/content JSON, and SHALL NOT write `draft.image_url`.

#### Scenario: Commit compose generates via the unified service
- **WHEN** commit compose runs with its image option enabled
- **THEN** the image SHALL be produced by the unified per-tweet service from the `image-prompt-builder` skill + identity + the commit/repo + tweet context
- **AND** the result SHALL be attached to `content.tweets[0].media`

#### Scenario: Commit compose with image option off
- **WHEN** the image option is off in commit compose
- **THEN** no image SHALL be generated and no image prompt SHALL be produced

#### Scenario: No imagePrompt embedded in content JSON
- **WHEN** the `work-progress` skill generates commit content
- **THEN** the response SHALL NOT include an `imagePrompt` field
