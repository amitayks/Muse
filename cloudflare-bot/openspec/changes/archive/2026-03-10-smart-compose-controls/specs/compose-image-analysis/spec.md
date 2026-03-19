## ADDED Requirements

### Requirement: Dynamic image button based on attached media
The compose button row SHALL adapt based on whether user-attached images exist in the tweet buffer.

#### Scenario: No images attached — show image gen button
- **WHEN** `renderCompose` is called and no tweets have media attached
- **THEN** the button row SHALL include "🎨 Image: ON/OFF" toggle (existing image gen behavior)

#### Scenario: Images attached, AI off — hide image button
- **WHEN** `renderCompose` is called and at least one tweet has media AND `aiRefine` is `false`
- **THEN** the button row SHALL NOT include any image-related button (neither image gen nor analyze)

#### Scenario: Images attached, AI on — show analyze button
- **WHEN** `renderCompose` is called and at least one tweet has media AND `aiRefine` is `true`
- **THEN** the button row SHALL include "🔍 Analyze: ON/OFF" toggle instead of "🎨 Image: ON/OFF"
- **AND** the analyze toggle SHALL default to `false` (off)

### Requirement: Analyze images toggle state
The `HandwriteState` SHALL include an `analyzeImages` boolean field that controls whether user-attached images are sent to the AI.

#### Scenario: Toggle analyze on
- **WHEN** user clicks "🔍 Analyze: OFF"
- **THEN** `HandwriteState.analyzeImages` SHALL be set to `true`
- **AND** the button text SHALL change to "🔍 Analyze: ON"

#### Scenario: Toggle analyze off
- **WHEN** user clicks "🔍 Analyze: ON"
- **THEN** `HandwriteState.analyzeImages` SHALL be set to `false`

### Requirement: Image gen auto-disabled when images attached
When the user attaches images to any tweet, the `imageGen` toggle SHALL be automatically disabled since user-provided images replace AI-generated ones.

#### Scenario: First image attached disables image gen
- **WHEN** user sends a photo and `HandwriteState.imageGen` is `true`
- **THEN** `HandwriteState.imageGen` SHALL be set to `false`
- **AND** the compose preview buttons SHALL update to reflect the new state (no image gen button)

### Requirement: Multimodal AI call with image analysis
When `analyzeImages` is enabled and the user clicks "Pen Down", the system SHALL fetch attached images from R2 and include them as `inline_data` parts in the Gemini API call.

#### Scenario: Pen down with analyze images on
- **WHEN** user clicks "Pen Down" with `analyzeImages: true` and `aiRefine: true`
- **THEN** for each tweet with media of type `photo`, the system SHALL fetch the image from R2
- **AND** convert each image to base64 and include as `{ inline_data: { mime_type: string, data: string } }` parts in the Gemini user prompt
- **AND** the text prompt SHALL include a note indicating which images correspond to which tweets

#### Scenario: Pen down with analyze images off
- **WHEN** user clicks "Pen Down" with `analyzeImages: false`
- **THEN** images SHALL NOT be sent to Gemini (text-only refinement, existing behavior)
- **AND** media references SHALL be preserved and re-attached after AI returns

#### Scenario: Image fetch from R2 fails
- **WHEN** an image cannot be fetched from R2 during the multimodal call assembly
- **THEN** the system SHALL skip that image and continue with remaining images
- **AND** a warning SHALL be logged but the AI call SHALL proceed
