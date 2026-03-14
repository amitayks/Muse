## Requirements

### Requirement: Dynamic image button based on attached media
The compose button row SHALL adapt based on whether user-attached images exist in the tweet buffer. This behavior is the same in both handwrite and repost modes.

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
The `ComposeState` SHALL include an `analyzeImages` boolean field that controls whether user-attached images are sent to the AI. In repost mode, this is independent of source tweet image analysis (which is controlled by the `analyze_source_image` user setting).

#### Scenario: Toggle analyze on
- **WHEN** user clicks "🔍 Analyze: OFF"
- **THEN** `ComposeState.analyzeImages` SHALL be set to `true`
- **AND** the button text SHALL change to "🔍 Analyze: ON"

#### Scenario: Toggle analyze off
- **WHEN** user clicks "🔍 Analyze: ON"
- **THEN** `ComposeState.analyzeImages` SHALL be set to `false`

### Requirement: Image gen auto-disabled when images attached
When the user attaches images to any tweet, the `imageGen` toggle SHALL be automatically disabled since user-provided images replace AI-generated ones.

#### Scenario: First image attached disables image gen
- **WHEN** user sends a photo and `ComposeState.imageGen` is `true`
- **THEN** `ComposeState.imageGen` SHALL be set to `false`
- **AND** the compose preview buttons SHALL update to reflect the new state (no image gen button)

### Requirement: Multimodal AI call with image analysis
When `analyzeImages` is enabled and the user clicks "Pen Down", the system SHALL fetch attached images from R2 and include them as `inline_data` parts in the Gemini API call. This works in both handwrite and repost modes.

#### Scenario: Pen down with analyze images on in handwrite mode
- **WHEN** user clicks "Pen Down" in handwrite mode with `analyzeImages: true` and `aiRefine: true`
- **THEN** for each tweet with media of type `photo`, the system SHALL fetch the image from R2
- **AND** convert each image to base64 and include as `{ inline_data: { mime_type: string, data: string } }` parts in the Gemini user prompt

#### Scenario: Pen down with analyze images on in repost mode
- **WHEN** user clicks "Pen Down" in repost mode with `analyzeImages: true` and `aiRefine: true`
- **THEN** user-attached images SHALL be fetched from R2 and included as multimodal parts
- **AND** the source tweet's image (if present and `analyze_source_image` setting is on) SHALL ALSO be included as a separate multimodal part
- **AND** the prompt SHALL distinguish between source tweet images and user-attached images

#### Scenario: Pen down with analyze images off
- **WHEN** user clicks "Pen Down" with `analyzeImages: false`
- **THEN** user-attached images SHALL NOT be sent to Gemini (text-only for user images)
- **AND** in repost mode, the source tweet's image MAY still be sent based on the `analyze_source_image` setting

#### Scenario: Image fetch from R2 fails
- **WHEN** an image cannot be fetched from R2 during the multimodal call assembly
- **THEN** the system SHALL skip that image and continue with remaining images
- **AND** a warning SHALL be logged but the AI call SHALL proceed

### Requirement: Image analysis in commit mode applies only to user-attached images
The analyze images toggle in commit compose mode SHALL apply only to user-attached images, as commit sources have no source image (unlike repost mode which has a source tweet image).

#### Scenario: Analyze toggle in commit compose with user images
- **WHEN** user attaches images in commit compose and `aiRefine: true`
- **THEN** the `[Analyze]` button SHALL appear in the button row
- **AND** toggling it SHALL set `ComposeState.analyzeImages`
- **AND** when pen down is triggered, user images SHALL be included as multimodal parts in the `generateContent` call via `options.userImageParts`

#### Scenario: No source image analysis for commits
- **WHEN** in commit compose mode
- **THEN** there SHALL be no source image analysis behavior (unlike repost mode where source tweet image is analyzed)
- **AND** the analyze toggle SHALL only control whether user-attached images are sent to AI
