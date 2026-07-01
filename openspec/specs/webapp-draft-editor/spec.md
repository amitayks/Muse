## Purpose

Provides the per-draft editing screen where users edit tweet/thread text with live character counters and auto-save, manage thread tweets and per-tweet media, run AI refine instructions, set platform targets and schedule date/time, and approve, publish, or delete the draft while viewing source metadata and per-platform publish results.
## Requirements
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
The system SHALL allow users to attach, preview, and remove media (images and video) for each tweet, respecting the platform rule that a tweet holds EITHER up to 4 photos OR exactly 1 video. In the existing-draft (viewer) state, attached media SHALL be displayed **full-size** (full content width), not as small thumbnails, so the user sees the image/video as it will appear. All media changes (attach, remove, retarget) SHALL be applied through the dedicated server media operations keyed by tweet `id`, NOT bundled into the content/text auto-save; the editor SHALL reflect the authoritative server media returned by those operations. The text auto-save SHALL carry text and thread structure only and SHALL never remove a tweet's media.

#### Scenario: Attach image via file picker
- **WHEN** the user taps "Add image" on a tweet with no video attached
- **THEN** a file picker opens allowing selection of image files (jpg, png, gif, webp), and the selected image is uploaded to R2 and then attached to the tweet via the dedicated attach operation

#### Scenario: Attach image via drag-and-drop
- **WHEN** the user drags an image file onto a tweet's media area (with no video attached)
- **THEN** the image is uploaded to R2 and attached to the tweet via the dedicated attach operation

#### Scenario: Attach video via file picker or drag-and-drop
- **WHEN** the user taps "Add video" (or drags a `video/mp4` file) onto a tweet that has no media yet
- **THEN** the video is uploaded to R2 and attached to the tweet as a single video media item via the dedicated attach operation

#### Scenario: Image shown full-size in the viewer
- **WHEN** a tweet in the existing-draft view has attached images
- **THEN** the images SHALL be displayed full content width below the tweet text (up to 4), not as 80×80 thumbnails

#### Scenario: Video shown full-size in the viewer
- **WHEN** a tweet in the existing-draft view has an attached video
- **THEN** the video SHALL be displayed full content width in a `<video>` element with a play affordance

#### Scenario: Remove media
- **WHEN** the user taps the remove control on an image or video
- **THEN** the media SHALL be removed from the tweet via the dedicated remove operation (R2 object is NOT deleted — just unlinked), and the editor SHALL reflect the authoritative result

#### Scenario: Media survives a concurrent text edit
- **WHEN** the user attaches or generates media and then edits tweet text (triggering a content auto-save)
- **THEN** the text edit SHALL be saved AND the media SHALL remain attached, because the auto-save never carries media

#### Scenario: Photo/video exclusivity
- **WHEN** a tweet has a video attached
- **THEN** no further media (photo or second video) SHALL be addable until the video is removed
- **AND WHEN** a tweet has one or more photos attached, the video option SHALL NOT be offered (only up to 4 photos)

#### Scenario: Max 4 images per tweet
- **WHEN** a tweet already has 4 images attached
- **THEN** the "Add image" affordance SHALL be disabled with a hint "Max 4 images per tweet (X limit)"

### Requirement: AI refine panel
The system SHALL provide an AI refine panel where users can send natural language instructions to modify the draft content. The panel SHALL be a dialog containing an instruction text input and a "🖼️ Generate new image" toggle (default OFF). Refine SHALL run in the draft's persisted content language (resolved server-side from the draft, per the `draft-content-language` capability) and SHALL preserve the draft's media deterministically by tweet index.

#### Scenario: Open AI refine panel
- **WHEN** the user taps the "AI Refine" button on the draft editor
- **THEN** a dialog SHALL appear with a text input for instructions and a "🖼️ Generate new image" toggle defaulting to OFF

#### Scenario: Submit refine instruction
- **WHEN** the user types an instruction (e.g., "Make it more concise") and taps "Refine"
- **THEN** the system SHALL call `POST /api/v1/drafts/:id/refine` with `{ instruction, newImage }`, show a loading state, and upon success, update the tweet textareas with the AI-refined content
- **AND** the request SHALL NOT need to include a language field (the server resolves it from the draft)

#### Scenario: Refine preserves media by index
- **WHEN** the AI refine updates the text content and the "Generate new image" toggle is OFF
- **THEN** each refined tweet at index `i` SHALL keep the media of the original tweet at index `i`
- **AND** no media SHALL be removed or modified for indices that exist in both the original and refined content

#### Scenario: Refine produces fewer tweets than the original
- **WHEN** the original draft has 5 tweets each with an image and the refine output has 3 tweets
- **THEN** the refined tweets at indices 0, 1, 2 SHALL keep their corresponding original images
- **AND** the images on the dropped original tweets (indices 3, 4) SHALL be discarded
- **AND** the AI SHALL NOT be forced to emit extra tweets to absorb the leftover images

#### Scenario: Refine produces more tweets than the original
- **WHEN** the original draft has 1 tweet with an image and the refine output has 3 tweets
- **THEN** the refined tweet at index 0 SHALL keep the original image
- **AND** the new tweets at indices 1, 2 SHALL have no media

#### Scenario: Generate new image toggle ON
- **WHEN** the user submits a refine with the "🖼️ Generate new image" toggle ON
- **THEN** the refined tweets at indices 1..N SHALL keep their original images by index
- **AND** the first tweet's existing media SHALL be cleared and a freshly generated image SHALL be attached to the first tweet
- **AND** the new image SHALL be produced by the existing per-tweet image generator

#### Scenario: New-image generation fails
- **WHEN** the "Generate new image" toggle is ON and the image model fails after the text refine is saved
- **THEN** the text refinement SHALL remain saved
- **AND** the webapp SHALL surface an image-generation error without discarding the rewritten text

#### Scenario: Undo refine
- **WHEN** the user taps "Undo" after a refine operation
- **THEN** the tweet texts SHALL revert to their pre-refine state (single level undo)

### Requirement: Platform target toggles
The system SHALL display self-toggling platform buttons at the bottom of the draft after the tweets: X, Instagram Post, Instagram Story, Instagram Reel, and LinkedIn. Instagram buttons SHALL appear only when the user has Instagram (`has_instagram`); the LinkedIn button SHALL appear only when the user has LinkedIn (`has_linkedin`). Toggling SHALL save immediately and sync the bot message.

#### Scenario: Display current targets
- **WHEN** the draft view loads
- **THEN** the platform buttons SHALL reflect the draft's current `publish_targets` values

#### Scenario: Toggle platform
- **WHEN** the user toggles a platform button
- **THEN** the change SHALL be saved via API immediately and the bot message SHALL update to reflect the new targets

#### Scenario: Instagram options conditional on user having Instagram
- **WHEN** the user does not have Instagram configured (`has_instagram = 0`)
- **THEN** the Instagram platform buttons SHALL NOT be displayed

#### Scenario: LinkedIn option conditional on connection
- **WHEN** the user has LinkedIn connected (`has_linkedin = true`)
- **THEN** a LinkedIn platform button SHALL be displayed; otherwise it SHALL NOT be shown

#### Scenario: At least one platform required
- **WHEN** the user tries to turn off the last remaining platform
- **THEN** the system SHALL prevent it and indicate that at least one platform must be selected

### Requirement: Schedule date/time picker
The system SHALL provide a calendar-based date and time picker for scheduling drafts. Tapping Schedule SHALL open a calendar (month grid → day hour-ruler) in the user's configured timezone; the picker's behavior is defined by the `webapp-schedule-calendar` capability. The picker SHALL keep emitting a raw wall-clock time so the backend conversion at `POST /api/v1/drafts/:id/schedule` is unchanged.

#### Scenario: Open schedule picker
- **WHEN** the user taps the "Schedule" button on the draft editor
- **THEN** the calendar picker SHALL open in month view for the current month in the user's configured timezone, and (when the draft is already scheduled) SHALL open on the draft's current slot

#### Scenario: Schedule confirmation
- **WHEN** the user selects a day, taps an hour, optionally fine-tunes the minutes, and confirms
- **THEN** the draft SHALL be scheduled via API (`POST /api/v1/drafts/:id/schedule`) with the chosen wall-clock time, the status SHALL change to "scheduled", and the bot message SHALL update

#### Scenario: Unschedule
- **WHEN** the user taps "Cancel Schedule" on a scheduled draft
- **THEN** the schedule SHALL be removed via API (`DELETE /api/v1/drafts/:id/schedule`), the status SHALL revert to "approved", and the bot message SHALL update

#### Scenario: Timezone display
- **WHEN** the schedule picker displays the month grid, day hour-ruler, and existing posts
- **THEN** all dates and times SHALL be shown in the user's configured timezone (from settings), not the device timezone

### Requirement: Draft actions (approve, publish, delete)
The system SHALL provide action buttons based on the draft's current status.

#### Scenario: Approve draft
- **WHEN** the user taps "Approve" on a draft with status "draft"
- **THEN** the draft status SHALL change to "approved" via API, the action buttons SHALL update to show "Publish" and "Schedule", and the bot message SHALL update

#### Scenario: Publish draft
- **WHEN** the user taps "Publish" on an approved or scheduled draft
- **THEN** a confirmation dialog SHALL appear. On confirm, the publish SHALL be kicked off via API (`POST /api/v1/drafts/:id/publish`), which returns immediately with a "publishing" state; the editor SHALL show the draft as publishing and SHALL reflect the final per-platform results once the background pipeline completes (via status refresh / bot-message sync), rather than blocking on a long upload

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

### Requirement: Per-media platform targeting row
Below each attached media item in the composer, the system SHALL render a row of platform toggle pills (reusing `PlatformTogglePill`) — one pill per platform that is enabled on the draft's Platforms row (`x`, `instagram_post`, `instagram_story`, `instagram_reel`, `linkedin`). Each pill SHALL be active when that media is targeted to the platform (`media.targets?.[platform] ?? true`, so media with no `targets` shows every enabled pill active). Toggling a pill SHALL update that media item's `targets[platform]` and persist via the existing debounced content save. The draft-level Platforms row SHALL remain the global on/off master — pills appear only for platforms it has enabled.

#### Scenario: New media defaults to all enabled platforms
- **WHEN** a media item with no `targets` is shown and the draft has X and Instagram Post enabled
- **THEN** the media's row SHALL show an active X pill and an active Instagram Post pill (and no pills for disabled platforms)

#### Scenario: Toggling a pill updates and persists targeting
- **WHEN** the user taps the LinkedIn pill on a media item to turn it off
- **THEN** that item's `targets.linkedin` SHALL become `false` and the draft content SHALL be saved via the debounced content save

#### Scenario: Pills reflect only enabled platforms
- **WHEN** the draft has LinkedIn disabled on the Platforms row
- **THEN** no LinkedIn pill SHALL appear in any media item's row

#### Scenario: A media item targeted nowhere
- **WHEN** the user turns off every pill on a media item
- **THEN** the item SHALL be allowed to remain with all targets off (it will attach to no platform at publish), with no validation error

### Requirement: X platform rendered with the X wordmark icon
Everywhere the webapp represents the X platform with an icon — the composer Platforms row, the per-media targeting row, the schedule calendar, and the home view — it SHALL use a real X wordmark SVG icon, not the `@` glyph (lucide `AtSign`). A shared `XIcon` component SHALL provide the mark.

#### Scenario: X platform shows the wordmark
- **WHEN** any X platform pill or badge is rendered in the webapp
- **THEN** it SHALL display the X wordmark icon, not the `@` symbol

