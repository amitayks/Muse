## ADDED Requirements

### Requirement: Inline text editing per tweet
The system SHALL display each tweet in the thread as an editable textarea with no character limit for input, but a live character counter showing proximity to X's 280-character limit.

#### Scenario: Single tweet editing
- **WHEN** the user opens the draft editor for a single-tweet draft
- **THEN** a single editable textarea SHALL display the tweet text, with a character counter showing `{current}/280`

#### Scenario: Thread tweet editing
- **WHEN** the user opens the draft editor for a thread draft (multiple tweets)
- **THEN** each tweet in the thread SHALL have its own editable textarea, numbered sequentially (1, 2, 3...), each with its own character counter

#### Scenario: Character counter warning
- **WHEN** the text in a tweet textarea exceeds 280 characters
- **THEN** the character counter SHALL turn red/warning color to indicate the tweet exceeds X's limit

#### Scenario: Auto-save on edit
- **WHEN** the user stops typing for 1.5 seconds (debounce)
- **THEN** the system SHALL auto-save the draft content via API and show a subtle "Saved" indicator

#### Scenario: Manual save
- **WHEN** the user taps a "Save" button
- **THEN** the draft content SHALL be saved via API immediately, and the bot message SHALL be updated in real-time

### Requirement: Thread management
The system SHALL allow users to add, remove, and reorder tweets within a thread.

#### Scenario: Add tweet to thread
- **WHEN** the user taps "+ Add tweet" button below the last tweet
- **THEN** a new empty textarea SHALL be appended to the thread with the next sequential number

#### Scenario: Remove tweet from thread
- **WHEN** the user taps the "Remove" button on a tweet (with at least 2 tweets in thread)
- **THEN** the tweet SHALL be removed and remaining tweets SHALL be renumbered

#### Scenario: Cannot remove last tweet
- **WHEN** the thread has only one tweet
- **THEN** the "Remove" button SHALL be hidden or disabled

#### Scenario: Reorder tweets in thread
- **WHEN** the user drags a tweet to a different position (or uses up/down arrow buttons)
- **THEN** the tweets SHALL be reordered and renumbered accordingly

### Requirement: Media management per tweet
The system SHALL allow users to attach, preview, and remove media (images) for each tweet.

#### Scenario: Attach image via file picker
- **WHEN** the user taps "Add image" on a tweet
- **THEN** a file picker opens allowing selection of image files (jpg, png, gif, webp), and the selected image is uploaded to R2 and attached to the tweet

#### Scenario: Attach image via drag-and-drop
- **WHEN** the user drags an image file onto a tweet's media area
- **THEN** the image is uploaded to R2 and attached to the tweet

#### Scenario: Image preview
- **WHEN** a tweet has attached images
- **THEN** thumbnail previews SHALL be displayed below the tweet text, showing up to 4 images per tweet (X's limit)

#### Scenario: Remove image
- **WHEN** the user taps the "X" button on an image thumbnail
- **THEN** the image SHALL be removed from the tweet's media list (R2 object is NOT deleted — just unlinked from the tweet)

#### Scenario: Max 4 images per tweet
- **WHEN** a tweet already has 4 images attached
- **THEN** the "Add image" button SHALL be disabled with a tooltip "Max 4 images per tweet (X limit)"

### Requirement: AI refine panel
The system SHALL provide an AI refine panel where users can send natural language instructions to modify the draft content.

#### Scenario: Open AI refine panel
- **WHEN** the user taps the "AI Refine" button on the draft editor
- **THEN** an expandable panel SHALL appear with a text input for instructions

#### Scenario: Submit refine instruction
- **WHEN** the user types an instruction (e.g., "Make it more concise") and taps "Refine"
- **THEN** the system SHALL call `POST /api/v1/drafts/:id/refine` with the instruction, show a loading state, and upon success, update the tweet textareas with the AI-refined content

#### Scenario: Refine preserves media
- **WHEN** the AI refine updates the text content
- **THEN** all attached media SHALL be preserved (not removed or modified)

#### Scenario: Undo refine
- **WHEN** the user taps "Undo" after a refine operation
- **THEN** the tweet texts SHALL revert to their pre-refine state (single level undo)

### Requirement: Platform target toggles
The system SHALL display checkboxes for each platform target: X, Instagram Post, Instagram Story, Instagram Reel.

#### Scenario: Display current targets
- **WHEN** the draft editor loads
- **THEN** platform checkboxes SHALL reflect the draft's current `publish_targets` values

#### Scenario: Toggle platform
- **WHEN** the user toggles a platform checkbox
- **THEN** the change SHALL be saved via API immediately, and the bot message SHALL update to reflect the new targets

#### Scenario: Instagram options conditional on user having Instagram
- **WHEN** the user does not have Instagram configured (has_instagram = 0)
- **THEN** Instagram platform checkboxes SHALL NOT be displayed

#### Scenario: At least one platform required
- **WHEN** the user tries to uncheck the last remaining platform
- **THEN** the system SHALL prevent the action and show a message "At least one platform must be selected"

### Requirement: Schedule date/time picker
The system SHALL provide a proper date and time picker for scheduling drafts.

#### Scenario: Open schedule picker
- **WHEN** the user taps the "Schedule" button on the draft editor
- **THEN** a date picker and time picker SHALL appear, defaulting to tomorrow at the next hour

#### Scenario: Schedule confirmation
- **WHEN** the user selects a date and time and confirms
- **THEN** the draft SHALL be scheduled via API (`POST /api/v1/drafts/:id/schedule`), the status SHALL change to "scheduled", and the bot message SHALL update

#### Scenario: Unschedule
- **WHEN** the user taps "Cancel Schedule" on a scheduled draft
- **THEN** the schedule SHALL be removed via API (`DELETE /api/v1/drafts/:id/schedule`), the status SHALL revert to "approved", and the bot message SHALL update

#### Scenario: Timezone display
- **WHEN** the schedule picker displays times
- **THEN** all times SHALL be shown in the user's configured timezone (from settings)

### Requirement: Draft actions (approve, publish, delete)
The system SHALL provide action buttons based on the draft's current status.

#### Scenario: Approve draft
- **WHEN** the user taps "Approve" on a draft with status "draft"
- **THEN** the draft status SHALL change to "approved" via API, the action buttons SHALL update to show "Publish" and "Schedule", and the bot message SHALL update

#### Scenario: Publish draft
- **WHEN** the user taps "Publish" on an approved or scheduled draft
- **THEN** a confirmation dialog SHALL appear. On confirm, the draft SHALL be published via API (`POST /api/v1/drafts/:id/publish`), a loading state SHALL be shown, and upon completion, the results SHALL display with links to published posts on each platform

#### Scenario: Delete draft from editor
- **WHEN** the user taps "Delete" on the draft editor
- **THEN** a confirmation dialog SHALL appear. On confirm, the draft SHALL be deleted via API and the app SHALL navigate back to the drafts list

### Requirement: Draft metadata display
The system SHALL display draft metadata including source, status, creation date, and original tweet link (for reposts).

#### Scenario: Repost draft shows original tweet
- **WHEN** the draft editor opens for a repost draft
- **THEN** the original tweet SHALL be displayed as an embedded preview card above the editor, with a link to the original tweet URL

#### Scenario: Commit draft shows PR info
- **WHEN** the draft editor opens for an auto/commit-generated draft
- **THEN** the PR number and title SHALL be displayed above the editor

### Requirement: Publish results display
The system SHALL display per-platform publish results for published drafts.

#### Scenario: Published draft shows results
- **WHEN** the draft editor opens for a published draft
- **THEN** the system SHALL display: per-platform status (success/failed), clickable links to published posts (X URL, Instagram URL), and error messages for failed platforms

#### Scenario: Published draft is read-only
- **WHEN** the draft editor opens for a published draft
- **THEN** the tweet textareas SHALL be read-only (not editable), and action buttons (approve, schedule, delete) SHALL be hidden
