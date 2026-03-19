## MODIFIED Requirements

### Requirement: Image analysis in commit mode applies only to user-attached images
The analyze images toggle in commit compose mode SHALL apply only to user-attached images, as commit sources have no source image (unlike repost mode which has a source tweet image).

#### Scenario: Analyze toggle in commit compose with user images
- **WHEN** user attaches images in commit compose and `aiRefine: true`
- **THEN** the `[🔍 Analyze]` button SHALL appear in the button row
- **AND** toggling it SHALL set `ComposeState.analyzeImages`
- **AND** when pen down is triggered, user images SHALL be included as multimodal parts in the `generateContent` call via `options.userImageParts`

#### Scenario: No source image analysis for commits
- **WHEN** in commit compose mode
- **THEN** there SHALL be no source image analysis behavior (unlike repost mode where source tweet image is analyzed)
- **AND** the analyze toggle SHALL only control whether user-attached images are sent to AI
