# Image Create Drafts Spec

## Purpose

Manages persisted image-create drafts: an Images category in the drafts view, a paginated list, a detail view showing the generated image as a photo, full-resolution document download, confirmed deletion with R2 cleanup, and the backing `image_drafts` D1 table, migration, and `ImageDraft` type.

## Requirements

### Requirement: Image drafts category in drafts view
The drafts category view SHALL include an "Images" category showing the count of stored image drafts for the user. This category SHALL appear after the "Thumbs" category row.

#### Scenario: Images category with drafts
- **WHEN** the user has 4 image drafts
- **AND** the user navigates to the drafts category view
- **THEN** a "🎨 Images (4)" button is displayed with callback data `view:drafts_images`

#### Scenario: Images category with zero drafts
- **WHEN** the user has no image drafts
- **AND** the user navigates to the drafts category view
- **THEN** the "🎨 Images (0)" button is still displayed

### Requirement: Image drafts list view
When the user clicks the "Images" category, the bot SHALL display a paginated list of image drafts ordered by creation date (newest first). Each draft SHALL be displayed as a button showing a truncated version of the prompt text.

#### Scenario: List with multiple image drafts
- **WHEN** the user has image drafts with prompts "A cyberpunk cityscape at sunset..." and "Serene forest with morning mist..."
- **AND** the user clicks the "Images" category
- **THEN** a list is shown with buttons showing truncated prompt text (up to 40 chars)
- **AND** each button callback is `imgcreate:detail:{id}`
- **AND** pagination buttons are shown if drafts exceed the page size

#### Scenario: Empty image drafts list
- **WHEN** the user has no image drafts
- **AND** the user clicks the "Images" category
- **THEN** a message is shown: "No images yet"
- **AND** Back and Home buttons are displayed

### Requirement: Image draft detail view
When the user clicks an image draft in the list, the bot SHALL send the generated image as a **photo** message (for inline preview) with a caption containing a truncated version of the prompt (up to 200 characters) and the creation date.

Below the photo, inline keyboard buttons SHALL be displayed: `[📄 Full Res]` `[🗑 Delete]` `[◀️ Back]` `[🏠 Home]`

#### Scenario: View image draft detail
- **WHEN** the user clicks an image draft with prompt "A cyberpunk cityscape at sunset with neon signs reflecting in rain puddles"
- **THEN** the bot sends the result image as a photo with caption:
  ```
  🎨 A cyberpunk cityscape at sunset with neon signs reflecting in rain puddles
  ```
- **AND** inline buttons [Full Res] [Delete] [Back] [Home] are shown

#### Scenario: Long prompt truncated in caption
- **WHEN** the image draft prompt exceeds 200 characters
- **THEN** the caption shows the first 197 characters followed by "..."

#### Scenario: Result image missing from R2
- **WHEN** the image draft's result image key does not exist in R2
- **THEN** a text message is shown: "Image not found"
- **AND** Delete, Back, and Home buttons are displayed

### Requirement: Full resolution download
When the user clicks the "Full Res" button on an image draft detail, the bot SHALL send the generated image as a **document** (file) via `sendDocument`. This preserves the original resolution without Telegram's photo compression.

#### Scenario: Download full resolution
- **WHEN** the user clicks "Full Res" on an image draft
- **THEN** the bot calls `sendDocument` with the result image from R2
- **AND** the file is delivered at original quality/resolution

### Requirement: Delete image draft
When the user clicks the "Delete" button on an image draft detail, the bot SHALL show a confirmation step before deleting. Upon confirmation, the bot SHALL delete the image draft record from D1 and clean up the associated R2 images (source and result).

#### Scenario: Delete with confirmation
- **WHEN** the user clicks "Delete" on an image draft
- **THEN** a confirmation message is shown: "Delete this image?"
- **AND** buttons [Yes, delete] [Cancel] are displayed

#### Scenario: Confirmed deletion
- **WHEN** the user confirms deletion
- **THEN** the image draft record is deleted from D1
- **AND** the associated R2 images are deleted
- **AND** the user is navigated back to the image drafts list

#### Scenario: Cancelled deletion
- **WHEN** the user clicks "Cancel" on the delete confirmation
- **THEN** the deletion is cancelled
- **AND** the image draft detail view is re-displayed

### Requirement: Image draft data persistence
Each generated image SHALL be stored as a record in the `image_drafts` D1 table with the following fields:
- `id` — unique identifier (UUID)
- `chat_id` — owner's Telegram chat ID
- `prompt` — the full prompt text used for generation
- `source_image_key` — R2 key of the user's reference image (nullable, since image is optional)
- `result_image_key` — R2 key of the generated result image
- `created_at` — ISO timestamp (default `datetime('now')`)
- `updated_at` — ISO timestamp (default `datetime('now')`)

#### Scenario: Draft created after successful generation
- **WHEN** the Gemini image model returns a generated image
- **THEN** an `image_drafts` record is created with the prompt and image keys
- **AND** the result image is stored in R2 at `images/{chatId}/{imageId}/result.{ext}`

#### Scenario: Query image drafts by chat_id
- **WHEN** the system queries image drafts for a specific user
- **THEN** only drafts belonging to that user's `chat_id` are returned
- **AND** results are ordered by `created_at` descending

### Requirement: Image drafts D1 table migration
The migration endpoint SHALL create the `image_drafts` table if it does not already exist, with the columns defined above plus an index on `chat_id`.

#### Scenario: Migration creates table
- **WHEN** the migration endpoint is called
- **THEN** the `image_drafts` table is created with columns: `id`, `chat_id`, `prompt`, `source_image_key`, `result_image_key`, `created_at`, `updated_at`
- **AND** an index `idx_image_drafts_chat` is created on `chat_id`

### Requirement: ImageDraft type definition
The `types.ts` file SHALL include an `ImageDraft` interface with fields matching the `image_drafts` D1 table: `id`, `chat_id`, `prompt`, `source_image_key`, `result_image_key`, `created_at`, `updated_at`.

#### Scenario: ImageDraft type used in DB operations
- **WHEN** the database layer queries `image_drafts`
- **THEN** results are typed as `ImageDraft`
