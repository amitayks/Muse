## MODIFIED Requirements

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
