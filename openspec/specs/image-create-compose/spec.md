# Image Create Compose Spec

## Purpose

A standalone image-create compose mode where the user sends a text prompt and optionally attaches a reference image (photo or document), sees a live status preview, and on Pen Down generates an image via the Gemini image model, storing the result in R2 and saving an image draft. Supports prompt replacement, edited messages, single-image replacement, captions setting both fields, slash-command exit, and cancel.

## Requirements

### Requirement: Image create compose mode initialization
When the user enters image create compose mode, the bot SHALL send a status message with instructions and inline buttons. The status message SHALL contain:
- Instruction text explaining that the user should send their prompt as a text message and optionally attach a reference image
- Action buttons: `[Pen Down]` and `[Cancel]`

The chat state SHALL be updated with `imageCompose.active = true`. The compose mode is routed via the `imageCompose.active` flag in the message handler priority chain (same pattern as `thumbCompose.active`).

#### Scenario: Initial compose message
- **WHEN** the user clicks the "Image" button on the home view
- **THEN** the bot sends a message with the instruction text and Pen Down/Cancel buttons
- **AND** the chat state context contains `imageCompose: { active: true, statusMessageId: <msgId> }`

### Requirement: Text input sets or replaces the prompt
When the user sends a text message during image create compose mode, the bot SHALL store the entire text as the prompt. Each new text message SHALL fully replace the previously set prompt. No parsing of numbered fields or structured input — the full message text is the prompt.

#### Scenario: First text message sets prompt
- **WHEN** the user sends "A cyberpunk cityscape at sunset with neon signs in 16:9"
- **THEN** the compose state prompt is set to "A cyberpunk cityscape at sunset with neon signs in 16:9"
- **AND** the status message is updated to show the prompt (truncated if long)

#### Scenario: Second text message replaces prompt
- **WHEN** the user has previously set a prompt
- **AND** the user sends a new text message "A serene forest with morning mist"
- **THEN** the prompt is replaced with "A serene forest with morning mist"
- **AND** the status message is updated

#### Scenario: Edited message updates prompt
- **WHEN** the user edits a previously sent message during image compose
- **THEN** the prompt is updated with the edited message text
- **AND** the status message is re-rendered with the updated prompt

### Requirement: Image input via photo or document
The bot SHALL accept a reference image sent as either a Telegram photo or a document (file). When the user sends a photo, the bot SHALL store the largest available photo size. When the user sends a document with an image MIME type (`image/*`), the bot SHALL store the document file. Non-image documents SHALL be ignored.

Only one image is kept at a time — sending a new image SHALL replace the previous one.

After receiving an image, the status message SHALL be edited to indicate an image has been attached.

#### Scenario: Photo message sets reference image
- **WHEN** the user sends a photo during image create compose
- **THEN** the largest photo variant is downloaded and stored in R2
- **AND** the status message shows "Image: ✅"

#### Scenario: Document with image MIME type sets reference image
- **WHEN** the user sends a document with `mime_type` starting with `image/`
- **THEN** the document file is downloaded and stored in R2 at full resolution
- **AND** the status message shows "Image: ✅"

#### Scenario: Non-image document is ignored
- **WHEN** the user sends a document with `mime_type` of `application/pdf`
- **THEN** the document is ignored and the image field is not changed

#### Scenario: New image replaces previous image
- **WHEN** the user has already attached an image
- **AND** the user sends a new photo or image document
- **THEN** the new image replaces the previous one in the compose state

### Requirement: Image with caption sets both image and prompt
When the user sends a photo or image document with a caption, the bot SHALL store both the image and use the caption text as the prompt (replacing any existing prompt).

#### Scenario: Photo with caption sets both fields
- **WHEN** the user sends a photo with caption "A painting of this scene in watercolor style"
- **THEN** the image is stored as the reference image
- **AND** the prompt is set to "A painting of this scene in watercolor style"
- **AND** the status message shows both fields updated

### Requirement: Status message live preview
The compose status message SHALL be edited in-place every time the user sends a text message or an image. The updated message SHALL display the current state of all fields:

```
🎨 Image Create

Prompt: {first ~80 chars of prompt… or "—"}
Image: {✅ or "—"}

Send your prompt as a text message.
Optionally attach a reference image (photo or file).
```

#### Scenario: Status message updates after text input
- **WHEN** the user sends a text message with a prompt
- **THEN** the status message is edited to show the prompt (truncated to ~80 chars if longer)

#### Scenario: Status message updates after image attachment
- **WHEN** the user sends a photo or image document
- **THEN** the status message is edited to show "Image: ✅"

### Requirement: Pen Down triggers generation
When the user clicks the "Pen Down" button, the bot SHALL:
1. Validate that the prompt is set. If the prompt is missing, show a toast notification and do NOT proceed.
2. Send a "Generating..." status message.
3. If a reference image exists, fetch it from R2 and base64-encode it.
4. Call the Gemini image model (`gemini-3-pro-image-preview`) with `responseModalities: ['IMAGE', 'TEXT']`:
   - With image: send the prompt as a `text` part and the image as an `inline_data` part
   - Without image: send only the prompt as a `text` part
5. Extract the generated image from the response.
6. Store the generated image in R2 under `images/{chatId}/{imageId}/result.{ext}`.
7. Save an `image_drafts` record with the prompt, source image key (if any), and result image key.
8. Delete the "Generating..." message.
9. Send the generated image to the user as a photo with a caption showing a truncated prompt.
10. Clear the `imageCompose` state and return to home view.

#### Scenario: Successful generation with prompt only
- **WHEN** the prompt is set and no reference image is attached
- **AND** the user clicks "Pen Down"
- **THEN** the bot calls Gemini with only the text prompt
- **AND** the result image is stored in R2 and saved as an image draft
- **AND** the result image is sent to the user as a photo message

#### Scenario: Successful generation with prompt and image
- **WHEN** the prompt and a reference image are both set
- **AND** the user clicks "Pen Down"
- **THEN** the bot calls Gemini with the text prompt and the reference image as inline_data
- **AND** the result image is stored in R2 and saved as an image draft

#### Scenario: Missing prompt on pen down
- **WHEN** the prompt is not set
- **AND** the user clicks "Pen Down"
- **THEN** a toast notification is shown indicating the prompt is missing
- **AND** generation does NOT proceed

#### Scenario: Gemini generation failure
- **WHEN** the prompt is set but the Gemini API call fails
- **THEN** an error message is shown to the user with the error detail
- **AND** the compose state is preserved so the user can retry

### Requirement: Cancel exits compose mode
When the user clicks the "Cancel" button, the bot SHALL clear the `imageCompose` state and navigate back to the home view.

#### Scenario: Cancel clears state
- **WHEN** the user clicks "Cancel" during image create compose
- **THEN** the `imageCompose` state is removed from context
- **AND** the home view is displayed

### Requirement: Slash commands cancel image compose
If the user sends a recognized slash command (e.g., `/start`, `/drafts`) during image create compose mode, the bot SHALL cancel the compose session and execute the command.

#### Scenario: Slash command during image compose
- **WHEN** the user is in image create compose mode
- **AND** the user sends `/drafts`
- **THEN** the image compose state is cleared
- **AND** the `/drafts` command is executed normally

### Requirement: ImageComposeState type definition
The `types.ts` file SHALL include an `ImageComposeState` interface with the following fields:
- `active: boolean` — whether compose mode is active
- `prompt?: string` — the user's prompt text
- `imageKey?: string` — R2 key of the user's reference image (optional)
- `statusMessageId: number` — Telegram message ID of the compose status message

The `ChatContext` interface SHALL include an optional `imageCompose?: ImageComposeState` field.

#### Scenario: ImageComposeState in ChatContext
- **WHEN** the user enters image create compose mode
- **THEN** the `ChatContext.imageCompose` field contains an `ImageComposeState` with `active: true`
