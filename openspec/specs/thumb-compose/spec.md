## ADDED Requirements

### Requirement: Home view Thumbs button
The home view SHALL display a "Thumbs" button that opens the thumbnail compose flow. The button SHALL appear in a new row after the main action buttons (Handwrite/Generate/Repost) and before the Repos/Accounts row.

#### Scenario: Thumbs button visible on home
- **WHEN** the user views the home screen
- **THEN** a "🖼 Thumbs" button is displayed with callback data `view:thumbs`

#### Scenario: Thumbs button opens compose flow
- **WHEN** the user clicks the "Thumbs" button
- **THEN** the bot enters thumbnail compose mode and sends the compose status message

### Requirement: Thumbnail compose mode initialization
When the user enters thumbnail compose mode, the bot SHALL send a status message with instructions and inline buttons. The status message SHALL contain:
- Instruction text explaining the numbered input format (1. title, 2. color, 3. icons) and to attach an image
- Aspect ratio toggle buttons: `[16:9]` and `[9:16]`, with `16:9` selected by default (shown with a checkmark)
- Action buttons: `[Pen Down]` and `[Cancel]`

The chat state SHALL be updated with `thumbCompose.active = true` and `awaiting_input` SHALL NOT be set (the thumb compose mode is routed via the `thumbCompose.active` flag in the message handler priority chain).

#### Scenario: Initial compose message
- **WHEN** the user clicks the "Thumbs" button on the home view
- **THEN** the bot sends a message with the instruction text, aspect ratio toggle buttons (16:9 selected), and Pen Down/Cancel buttons
- **AND** the chat state context contains `thumbCompose: { active: true, ratio: '16:9', statusMessageId: <msgId> }`

### Requirement: Text input parsing by number prefix
When the user sends a text message during thumbnail compose mode, the bot SHALL parse lines starting with `1.`, `2.`, `3.` to extract title, color, and icons respectively. Each new text message SHALL fully replace the previously parsed fields from prior text messages.

Parsing rules:
- Line starting with `1.` → title (rest of line after `1.`, trimmed)
- Line starting with `2.` → color (rest of line after `2.`, trimmed)
- Line starting with `3.` → icons (rest of line after `3.`, trimmed)
- Lines not matching any numbered prefix SHALL be ignored
- Partial messages are valid — sending only `1. My Title` SHALL update only the title, preserving previously set color and icons

After parsing, the status message SHALL be edited in-place to show the current state of all fields.

#### Scenario: Full text input with all three fields
- **WHEN** the user sends a message containing:
  ```
  1. Building a CLI Tool
  2. blue, purple
  3. terminal, code, rust
  ```
- **THEN** the bot parses title="Building a CLI Tool", color="blue, purple", icons="terminal, code, rust"
- **AND** the status message is updated to show the parsed values

#### Scenario: Partial text input updates only specified fields
- **WHEN** the user has previously set title="Old Title" and color="red"
- **AND** the user sends a message containing only `1. New Title`
- **THEN** the title is updated to "New Title" and color remains "red"

#### Scenario: New text message replaces previous text
- **WHEN** the user sends a text message with `1. First Title`
- **AND** the user then sends another text message with `1. Second Title`
- **THEN** only "Second Title" is used as the title

### Requirement: Image input via photo or document
The bot SHALL accept a base image sent as either a Telegram photo or a document (file). When the user sends a photo, the bot SHALL store the largest available photo size. When the user sends a document with an image MIME type (`image/*`), the bot SHALL store the document file. Non-image documents SHALL be ignored.

Only one image is kept at a time — sending a new image SHALL replace the previous one.

After receiving an image, the status message SHALL be edited to indicate an image has been attached.

#### Scenario: Photo message sets the base image
- **WHEN** the user sends a photo during thumbnail compose
- **THEN** the largest photo variant is downloaded and stored in R2
- **AND** the status message shows "Image: ✅"

#### Scenario: Document message with image MIME type sets the base image
- **WHEN** the user sends a document with `mime_type` starting with `image/`
- **THEN** the document file is downloaded and stored in R2 at full resolution
- **AND** the status message shows "Image: ✅"

#### Scenario: Document message with non-image MIME type is ignored
- **WHEN** the user sends a document with `mime_type` of `application/pdf`
- **THEN** the document is ignored and the image field is not changed

#### Scenario: New image replaces previous image
- **WHEN** the user has already attached an image
- **AND** the user sends a new photo or image document
- **THEN** the new image replaces the previous one in the compose state

### Requirement: Aspect ratio toggle
The compose status message SHALL include two inline buttons for aspect ratio selection: `[16:9]` and `[9:16]`. The currently selected ratio SHALL be visually indicated with a checkmark (✓). Clicking a ratio button SHALL update the selection and edit the status message to reflect the change.

#### Scenario: Toggle from 16:9 to 9:16
- **WHEN** the current ratio is 16:9
- **AND** the user clicks the 9:16 button
- **THEN** the ratio is updated to 9:16
- **AND** the status message is re-rendered with 9:16 showing the checkmark

#### Scenario: Clicking already-selected ratio is a no-op
- **WHEN** the current ratio is 16:9
- **AND** the user clicks the 16:9 button
- **THEN** no state change occurs (or the message is re-rendered identically)

### Requirement: Status message live preview
The compose status message SHALL be edited in-place every time the user sends a text message, an image, or toggles the aspect ratio. The updated message SHALL display the current state of all fields:

```
🖼 Thumbnail Compose

Title: {title or "—"}
Color: {color or "—"}
Icons: {icons or "—"}
Image: {✅ or "—"}
Aspect: {ratio}

Send me your choices:
1. "title"
2. "color"
3. "icons"
Attach the image (photo or file)
```

#### Scenario: Status message updates after text input
- **WHEN** the user sends a text message with parsed fields
- **THEN** the status message is edited to show the updated field values

#### Scenario: Status message updates after image attachment
- **WHEN** the user sends a photo or image document
- **THEN** the status message is edited to show "Image: ✅"

### Requirement: Pen Down triggers generation
When the user clicks the "Pen Down" button, the bot SHALL:
1. Validate that title, color, icons, and image are all set. If any field is missing, show a toast notification indicating which fields are missing and do NOT proceed.
2. Load the `thumbnail` skill prompt from the database via `getPrompt()`
3. Replace placeholders: `[TITLE]` → title, `[GLOW_COLOR]` → color, `[ICONS]` → icons, `[ASPECT]` → ratio
4. Fetch the source image from R2 and base64-encode it
5. Call the Gemini image model (`gemini-3-pro-image-preview`) with the composed prompt as text and the image as `inline_data`, requesting `responseModalities: ['IMAGE', 'TEXT']`
6. Do NOT attach any identity document, image-gen skill, or other skill — only the thumbnail prompt and the image
7. Extract the generated image from the response
8. Store the generated image in R2 under `thumbs/{chatId}/{thumbId}/result.*`
9. Save a `thumb_drafts` record with all metadata
10. Send the generated image to the user as a photo with a caption showing the title
11. Clear the `thumbCompose` state and return to home view

#### Scenario: Successful generation
- **WHEN** all fields (title, color, icons, image) are set
- **AND** the user clicks "Pen Down"
- **THEN** the bot generates a thumbnail via Gemini
- **AND** the result image is stored in R2 and saved as a thumb draft
- **AND** the result image is sent to the user as a photo message

#### Scenario: Missing fields on pen down
- **WHEN** the title is not set
- **AND** the user clicks "Pen Down"
- **THEN** a toast notification is shown: "Missing: title"
- **AND** generation does NOT proceed

#### Scenario: Gemini generation failure
- **WHEN** all fields are set but the Gemini API call fails
- **THEN** an error message is shown to the user
- **AND** the compose state is preserved so the user can retry

### Requirement: Cancel exits compose mode
When the user clicks the "Cancel" button, the bot SHALL clear the `thumbCompose` state and navigate back to the home view.

#### Scenario: Cancel clears state
- **WHEN** the user clicks "Cancel" during thumbnail compose
- **THEN** the `thumbCompose` state is removed from context
- **AND** the home view is displayed

### Requirement: Slash commands cancel thumb compose
If the user sends a recognized slash command (e.g., `/start`, `/drafts`) during thumbnail compose mode, the bot SHALL cancel the thumb compose session and execute the command.

#### Scenario: Slash command during thumb compose
- **WHEN** the user is in thumbnail compose mode
- **AND** the user sends `/drafts`
- **THEN** the thumb compose state is cleared
- **AND** the `/drafts` command is executed normally
