## ADDED Requirements

### Requirement: Tweet compose editor
The system SHALL provide a compose page for creating new drafts with a rich editing experience, mirroring the bot's handwrite flow but with full editing power.

#### Scenario: Empty compose page
- **WHEN** the user navigates to `/#/compose`
- **THEN** a single empty tweet textarea SHALL be displayed with a character counter (0/280), plus toggle options and an "Add tweet to thread" button below

#### Scenario: Type tweet text
- **WHEN** the user types in the textarea
- **THEN** the character counter SHALL update in real-time

### Requirement: Thread builder
The system SHALL allow composing multi-tweet threads during compose.

#### Scenario: Add tweet to thread
- **WHEN** the user taps "+ Add tweet to thread"
- **THEN** a new numbered textarea SHALL appear below the existing one(s)

#### Scenario: Remove tweet from thread
- **WHEN** the user taps the remove button on a tweet (with 2+ tweets)
- **THEN** the tweet SHALL be removed and remaining tweets renumbered

### Requirement: Image upload during compose
The system SHALL allow attaching images to each tweet during compose via file picker or drag-and-drop.

#### Scenario: Attach image during compose
- **WHEN** the user taps "Add image" or drags an image onto a tweet area
- **THEN** the image SHALL be uploaded via `POST /api/v1/media/upload` and a thumbnail preview SHALL appear below the tweet text

#### Scenario: Multiple images per tweet
- **WHEN** the user attaches multiple images to a single tweet
- **THEN** up to 4 images SHALL be allowed, and all SHALL display as thumbnails

### Requirement: Compose toggles (AI, Image Gen, Analyze)
The system SHALL provide toggle switches that mirror the bot's compose toggles.

#### Scenario: AI Refine toggle
- **WHEN** the user enables the "AI Refine" toggle
- **THEN** the composed content SHALL be refined by AI when the user saves the draft (pen-down equivalent)

#### Scenario: Image Generation toggle
- **WHEN** the user enables "Image Generation" toggle (only visible when no images are attached)
- **THEN** the system SHALL generate an AI image prompt from the content when saving

#### Scenario: Analyze Images toggle
- **WHEN** the user enables "Analyze Images" toggle (only visible when images ARE attached)
- **THEN** the system SHALL include the attached images in the AI refinement context

#### Scenario: Image Gen hides when images attached
- **WHEN** the user attaches at least one image to any tweet
- **THEN** the "Image Generation" toggle SHALL be replaced by "Analyze Images" toggle

### Requirement: Instruction input for AI
The system SHALL allow an optional instruction to guide AI refinement.

#### Scenario: Add instruction
- **WHEN** the user taps "Add Instruction" and types a message
- **THEN** the instruction SHALL be included in the AI refinement request when saving

### Requirement: Save as draft (pen-down equivalent)
The system SHALL provide a "Save as Draft" button that creates the draft, optionally running AI refinement.

#### Scenario: Save without AI
- **WHEN** the user taps "Save as Draft" with AI Refine toggle OFF
- **THEN** the system SHALL create a draft via `POST /api/v1/compose` with the raw content and navigate to the draft editor for the new draft

#### Scenario: Save with AI refine
- **WHEN** the user taps "Save as Draft" with AI Refine toggle ON
- **THEN** the system SHALL show a loading state ("Refining..."), create the draft with AI refinement via `POST /api/v1/compose`, and navigate to the draft editor for the new draft

#### Scenario: Cancel compose
- **WHEN** the user taps "Cancel"
- **THEN** a confirmation dialog SHALL appear if any text has been entered ("Discard draft?"), and on confirm, navigate back to home

### Requirement: Compose preserves context on navigation
The system SHALL preserve compose state if the user accidentally navigates away.

#### Scenario: Back navigation with unsaved content
- **WHEN** the user has typed content and taps the back button
- **THEN** a confirmation dialog SHALL appear: "You have unsaved changes. Discard?"
