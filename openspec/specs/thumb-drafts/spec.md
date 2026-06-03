## Purpose

Manages persisted thumbnail drafts: a Thumbs category and paginated list in the drafts view, a detail view with photo preview and metadata, full-resolution document download, confirmed deletion (with R2 cleanup), and storage of each generated thumbnail in the `thumb_drafts` D1 table scoped by chat ID.

## Requirements

### Requirement: Thumb drafts category in drafts view
The drafts category view SHALL include a "Thumbs" category showing the count of stored thumbnail drafts for the user. This category SHALL appear after the existing draft categories (auto-generated, handwritten, reposts, approved, scheduled, published).

#### Scenario: Thumbs category with drafts
- **WHEN** the user has 3 thumbnail drafts
- **AND** the user navigates to the drafts category view
- **THEN** a "🖼 Thumbs (3)" button is displayed with callback data `view:drafts_thumbs`

#### Scenario: Thumbs category with zero drafts
- **WHEN** the user has no thumbnail drafts
- **AND** the user navigates to the drafts category view
- **THEN** the "🖼 Thumbs (0)" button is still displayed

### Requirement: Thumb drafts list view
When the user clicks the "Thumbs" category, the bot SHALL display a paginated list of thumbnail drafts ordered by creation date (newest first). Each draft SHALL be displayed as a button showing the title text.

#### Scenario: List with multiple thumb drafts
- **WHEN** the user has thumbnail drafts with titles "CLI Tool Thumb" and "React Hooks Thumb"
- **AND** the user clicks the "Thumbs" category
- **THEN** a list is shown with buttons:
  - `[🖼 CLI Tool Thumb]` → callback `thumb:detail:{id1}`
  - `[🖼 React Hooks Thumb]` → callback `thumb:detail:{id2}`
- **AND** pagination buttons are shown if drafts exceed the page size

#### Scenario: Empty thumb drafts list
- **WHEN** the user has no thumbnail drafts
- **AND** the user clicks the "Thumbs" category
- **THEN** a message is shown: "No thumbnails yet"
- **AND** Back and Home buttons are displayed

### Requirement: Thumb draft detail view
When the user clicks a thumbnail draft in the list, the bot SHALL send the generated thumbnail image as a **photo** message (for inline preview) with a caption containing the draft metadata:
- Title
- Color
- Icons
- Aspect ratio
- Creation date

Below the photo, inline keyboard buttons SHALL be displayed: `[📄 Full Res]` `[🗑 Delete]` `[◀️ Back]` `[🏠 Home]`

#### Scenario: View thumb draft detail
- **WHEN** the user clicks a thumb draft with title "CLI Tool"
- **THEN** the bot sends the result image as a photo with caption:
  ```
  🖼 CLI Tool
  Color: blue, purple
  Icons: terminal, rust
  Ratio: 16:9
  ```
- **AND** inline buttons [Full Res] [Delete] [Back] [Home] are shown

#### Scenario: Result image missing from R2
- **WHEN** the thumb draft's result image key does not exist in R2
- **THEN** a text message is shown: "Thumbnail image not found"
- **AND** Delete, Back, and Home buttons are displayed

### Requirement: Full resolution download
When the user clicks the "Full Res" button on a thumb draft detail, the bot SHALL send the generated thumbnail image as a **document** (file) via `sendDocument`. This preserves the original resolution without Telegram's photo compression.

#### Scenario: Download full resolution
- **WHEN** the user clicks "Full Res" on a thumb draft
- **THEN** the bot calls `sendDocument` with the result image from R2
- **AND** the file is delivered at original quality/resolution

### Requirement: Delete thumb draft
When the user clicks the "Delete" button on a thumb draft detail, the bot SHALL delete the thumb draft record from D1 and optionally clean up the associated R2 images (source and result). The bot SHALL show a confirmation step before deleting.

#### Scenario: Delete with confirmation
- **WHEN** the user clicks "Delete" on a thumb draft
- **THEN** a confirmation message is shown: "Delete this thumbnail?"
- **AND** buttons [Yes, delete] [Cancel] are displayed

#### Scenario: Confirmed deletion
- **WHEN** the user confirms deletion
- **THEN** the thumb draft record is deleted from D1
- **AND** the associated R2 images are deleted
- **AND** the user is navigated back to the thumb drafts list

#### Scenario: Cancelled deletion
- **WHEN** the user clicks "Cancel" on the delete confirmation
- **THEN** the deletion is cancelled
- **AND** the thumb draft detail view is re-displayed

### Requirement: Thumb draft data persistence
Each generated thumbnail SHALL be stored as a record in the `thumb_drafts` D1 table with the following fields:
- `id` — unique identifier (UUID)
- `chat_id` — owner's Telegram chat ID
- `title` — the title text
- `color` — the color/gradient tint
- `icons` — the icon names
- `ratio` — aspect ratio (`16:9` or `9:16`)
- `source_image_key` — R2 key of the user's input image
- `result_image_key` — R2 key of the generated thumbnail
- `created_at` — ISO timestamp
- `updated_at` — ISO timestamp

#### Scenario: Draft created after successful generation
- **WHEN** the Gemini image model returns a generated thumbnail
- **THEN** a `thumb_drafts` record is created with all metadata
- **AND** the result image is stored in R2

#### Scenario: Query thumb drafts by chat_id
- **WHEN** the system queries thumb drafts for a specific user
- **THEN** only drafts belonging to that user's `chat_id` are returned
- **AND** results are ordered by `created_at` descending
