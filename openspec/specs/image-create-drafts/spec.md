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
When the user clicks the "Delete" button on an image draft detail, the bot SHALL show a confirmation step before deleting. Upon confirmation, the bot SHALL delete the image draft record from D1 and clean up the associated R2 images: the result image AND **every** source image. Source keys SHALL be read from the `source_image_keys` JSON array; for legacy rows without that column populated, the bot SHALL fall back to the single `source_image_key` column.

#### Scenario: Delete with confirmation
- **WHEN** the user clicks "Delete" on an image draft
- **THEN** a confirmation message is shown: "Delete this image?"
- **AND** buttons [Yes, delete] [Cancel] are displayed

#### Scenario: Confirmed deletion cleans up all source images
- **WHEN** the user confirms deletion of a draft generated from three reference images
- **THEN** the image draft record is deleted from D1
- **AND** all three source images are deleted from R2
- **AND** the result image is deleted from R2
- **AND** the user is navigated back to the image drafts list

#### Scenario: Confirmed deletion of a legacy single-image draft
- **WHEN** the user confirms deletion of a legacy draft that has only `source_image_key` set (no `source_image_keys`)
- **THEN** the single source image from `source_image_key` is deleted from R2
- **AND** the result image is deleted from R2

#### Scenario: Cancelled deletion
- **WHEN** the user clicks "Cancel" on the delete confirmation
- **THEN** the deletion is cancelled
- **AND** the image draft detail view is re-displayed

### Requirement: Image draft data persistence
Each generated image SHALL be stored as a record in the `image_drafts` D1 table with the following fields:
- `id` — unique identifier (UUID)
- `chat_id` — owner's Telegram chat ID
- `prompt` — the full combined prompt text used for generation (all segments joined with single spaces)
- `source_image_key` — R2 key of the first reference image, retained for back-compat (nullable, since images are optional)
- `source_image_keys` — JSON-encoded array of all reference image R2 keys (nullable; `null` or `[]` when no images were used)
- `result_image_key` — R2 key of the generated result image
- `created_at` — ISO timestamp (default `datetime('now')`)
- `updated_at` — ISO timestamp (default `datetime('now')`)

#### Scenario: Draft created after successful generation
- **WHEN** the Gemini image model returns a generated image
- **THEN** an `image_drafts` record is created with the combined prompt, `source_image_keys` set to the JSON array of all reference keys, `source_image_key` set to the first key (or null), and the result key
- **AND** the result image is stored in R2 at `images/{chatId}/{imageId}/result.{ext}`

#### Scenario: Draft created with no reference images
- **WHEN** the user generated from prompt text only (no reference images)
- **THEN** `source_image_keys` is `null` (or an empty array) and `source_image_key` is `null`

#### Scenario: Query image drafts by chat_id
- **WHEN** the system queries image drafts for a specific user
- **THEN** only drafts belonging to that user's `chat_id` are returned
- **AND** results are ordered by `created_at` descending

### Requirement: Image drafts D1 table migration
The migration endpoint SHALL ensure the `image_drafts` table exists with all columns defined above plus an index on `chat_id`. The migration SHALL additively add the `source_image_keys TEXT` column to existing `image_drafts` tables (D1 has no `ALTER COLUMN`; the column is added via an idempotent `ALTER TABLE ... ADD COLUMN` that is safe to re-run). A numbered migration file SHALL be added under `cloudflare-bot/migrations/` recording this column addition.

#### Scenario: Migration creates table with new column
- **WHEN** the migration endpoint is called against a database without `image_drafts`
- **THEN** the `image_drafts` table is created with columns: `id`, `chat_id`, `prompt`, `source_image_key`, `source_image_keys`, `result_image_key`, `created_at`, `updated_at`
- **AND** an index `idx_image_drafts_chat` is created on `chat_id`

#### Scenario: Migration adds column to existing table
- **WHEN** the migration endpoint is called against a database where `image_drafts` already exists without `source_image_keys`
- **THEN** the `source_image_keys TEXT` column is added to the table
- **AND** re-running the migration does not error (the duplicate-column error is caught)

### Requirement: ImageDraft type definition
The `types.ts` file SHALL include an `ImageDraft` interface with fields matching the `image_drafts` D1 table: `id`, `chat_id`, `prompt`, `source_image_key`, `source_image_keys`, `result_image_key`, `created_at`, `updated_at`. The `source_image_keys` field SHALL be typed as a nullable string (the JSON-encoded array as stored in D1).

#### Scenario: ImageDraft type used in DB operations
- **WHEN** the database layer queries `image_drafts`
- **THEN** results are typed as `ImageDraft` including the `source_image_keys` field

