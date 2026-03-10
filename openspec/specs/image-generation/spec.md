# Image Generation Spec

## Requirements

### Requirement: On-demand image generation when viewing draft
The system SHALL generate an image when a user views a draft that has no image. When generating, the system SHALL pass the repo overview's `visual_theme` and `brand_voice` fields (if available) to the image generation prompt to ensure visual consistency across the repo's posts.

#### Scenario: First time viewing draft with repo overview
- **WHEN** user clicks View on a draft without an image, and the repo has an overview with visual_theme
- **THEN** the system SHALL generate an image via Gemini using the structured imagePrompt AND the repo's visual_theme for style consistency
- **AND** store the image in R2
- **AND** update draft.image_url

#### Scenario: First time viewing draft without repo overview
- **WHEN** user clicks View on a draft without an image, and the repo has no overview
- **THEN** the system SHALL generate an image via Gemini using only the structured imagePrompt (current behavior preserved)

#### Scenario: Viewing draft with existing image
- **WHEN** user clicks View on a draft with image_url set
- **THEN** the system SHALL fetch the image from R2
- **AND** display the image with draft content
- **AND** SHALL NOT call Gemini API

### Requirement: Image display in Telegram
The system SHALL display the generated image alongside draft content in Telegram.

#### Scenario: Draft has image
Given a draft with stored image
When rendering draft detail
Then send photo with caption containing draft preview
And include action buttons

#### Scenario: Draft has no image yet
Given a draft without image
When rendering draft detail
Then generate image first
Then send photo with caption

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
