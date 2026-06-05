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
When the user sends a text message during image create compose mode, the bot SHALL append the entire message text as a new prompt **segment**, keyed by the message's Telegram `message_id`. Text messages SHALL NOT overwrite previously sent text — each new text message adds another segment. There SHALL be no parsing of numbered fields or structured input; each full message text is one segment. At Pen Down all segments are combined (see "Pen Down triggers generation").

This replaces the previous single-slot behavior where each text message fully replaced the prompt, so that a prompt split by Telegram across multiple messages (Telegram auto-splits any outgoing message longer than 4096 characters) is preserved in full.

#### Scenario: First text message adds a segment
- **WHEN** the user sends "A cyberpunk cityscape at sunset with neon signs"
- **THEN** a segment `{ messageId, text: "A cyberpunk cityscape at sunset with neon signs" }` is appended to the compose state
- **AND** the status message is updated to show one segment preview and a message count of 1

#### Scenario: Second text message adds another segment (does not replace)
- **WHEN** the user has already sent one text message
- **AND** the user sends a second text message "reflected in rain puddles, 16:9"
- **THEN** a second segment is appended (the first segment is retained)
- **AND** the status message shows two numbered segment previews and a message count of 2

#### Scenario: Telegram-split long prompt is preserved in full
- **WHEN** the user pastes a prompt longer than 4096 characters and the Telegram client delivers it as multiple messages
- **THEN** each delivered message is appended as its own segment
- **AND** no fragment is lost or overwritten
- **AND** the combined character tally in the status message reflects the total length of all segments

#### Scenario: Edited text message updates only that segment
- **WHEN** the user edits a previously sent text message during image compose
- **THEN** the segment whose `messageId` matches the edited message is updated with the new text
- **AND** other segments are left unchanged
- **AND** the status message is re-rendered with the updated segment preview

#### Scenario: Edited message that is not tracked is appended
- **WHEN** the user edits a message during image compose whose `messageId` does not match any existing segment
- **THEN** a new segment is appended with the edited text

### Requirement: Image input via photo or document
The bot SHALL accept reference images sent as Telegram photos or documents (files). When the user sends a photo, the bot SHALL store the largest available photo size. When the user sends a document with an image MIME type (`image/*`), the bot SHALL store the document file. Non-image documents SHALL be ignored.

The bot SHALL accumulate **multiple** reference images — each photo/image-document sent before Pen Down is added as an `ImageRef` keyed by its Telegram `message_id`. Sending another image adds to the set rather than replacing the previous one. A Telegram album of several photos arrives as separate messages and each becomes its own `ImageRef`.

After receiving an image, the status message SHALL be edited to reflect the current image count.

#### Scenario: Photo message adds a reference image
- **WHEN** the user sends a photo during image create compose
- **THEN** the largest photo variant is downloaded and stored in R2
- **AND** an `ImageRef { messageId, key }` is appended to the compose state
- **AND** the status message shows the updated image count

#### Scenario: Document with image MIME type adds a reference image
- **WHEN** the user sends a document with `mime_type` starting with `image/`
- **THEN** the document file is downloaded and stored in R2 at full resolution
- **AND** an `ImageRef` is appended and the status message shows the updated image count

#### Scenario: Non-image document is ignored
- **WHEN** the user sends a document with `mime_type` of `application/pdf`
- **THEN** the document is ignored and the image set is not changed

#### Scenario: Second image adds to the set
- **WHEN** the user has already attached one image
- **AND** the user sends another photo or image document
- **THEN** a second `ImageRef` is appended (the first is retained)
- **AND** the status message shows an image count of 2

#### Scenario: Album of photos adds one image per photo
- **WHEN** the user sends a Telegram album of 3 photos during image compose
- **THEN** each photo arrives as a separate message and adds its own `ImageRef`
- **AND** the status message shows an image count of 3

#### Scenario: Edited photo message replaces that image
- **WHEN** the user edits a previously sent photo message, replacing the photo
- **THEN** the `ImageRef` whose `messageId` matches is updated with the newly stored R2 key
- **AND** other images are left unchanged

### Requirement: Image with caption sets both image and prompt
When the user sends a photo or image document with a caption, the bot SHALL store the image as an `ImageRef` and SHALL append the caption text as a normal tracked prompt **segment** keyed by the same `message_id`. The caption SHALL NOT overwrite existing segments; it is appended like any other text segment and is editable by editing that message.

#### Scenario: Photo with caption adds image and segment
- **WHEN** the user sends a photo with caption "A painting of this scene in watercolor style"
- **THEN** an `ImageRef` is appended for the photo
- **AND** a segment `{ messageId, text: "A painting of this scene in watercolor style" }` is appended with the same `messageId`
- **AND** the status message shows both the new segment preview and the updated image count

#### Scenario: Editing a captioned photo updates its segment
- **WHEN** the user edits the caption of a previously sent photo message
- **THEN** the segment whose `messageId` matches that photo message is updated with the new caption text

### Requirement: Status message live preview
The compose status message SHALL be edited in-place every time the user sends or edits a text message or an image. The updated message SHALL show a compact preview rather than the full prompt:
- A header with the number of prompt messages and the combined character count of all segments
- A numbered list of per-segment previews, each truncated to a short length (≈40 characters)
- If the number of segments exceeds a display cap, the list SHALL be truncated with a "+N more" overflow indicator so the status message itself cannot overflow Telegram's 4096-character limit
- An image count line
- Instruction and action buttons (`[Pen Down]`, `[Cancel]`)

```
🎨 Image Create

Prompt — {N} messages ({total} chars):
  1. {first ~40 chars of segment 1…}
  2. {first ~40 chars of segment 2…}
  …
  (+{K} more)
Images: {count or —}

Send text and/or photos — as many messages as you like.
Tap Pen Down when you're done.
```

#### Scenario: Status shows per-segment previews and counts
- **WHEN** the user has sent three text segments totaling 412 characters
- **THEN** the status message shows "3 messages (412 chars)" and three numbered, truncated segment previews

#### Scenario: Long segment list is capped
- **WHEN** the number of segments exceeds the display cap
- **THEN** only the first capped number of previews are shown
- **AND** a "+N more" line indicates the remaining count

#### Scenario: Status shows image count
- **WHEN** the user has attached two reference images
- **THEN** the status message shows an image count of 2

#### Scenario: Status updates after an edit
- **WHEN** the user edits a tracked segment or image
- **THEN** the status message is re-rendered with the updated preview, counts, and tally

### Requirement: Pen Down triggers generation
When the user clicks the "Pen Down" button, the bot SHALL:
1. Validate that at least one prompt segment exists. If there are no segments, show a toast notification and do NOT proceed.
2. Combine all segments into a single prompt by joining their texts with a single space, in the order received.
3. Send a "Generating..." status message.
4. Build the Gemini request `parts` array: a single `text` part containing the combined prompt, followed by one `inline_data` part per reference image (each fetched from R2 and base64-encoded).
5. Call the Gemini image model (`gemini-3-pro-image-preview`) with `responseModalities: ['IMAGE', 'TEXT']` and `imageConfig.imageSize: '4K'`.
6. Extract the generated image from the response.
7. Store the generated image in R2 under `images/{chatId}/{imageId}/result.{ext}`.
8. Save an `image_drafts` record with the combined prompt, all source image keys, and the result image key.
9. Delete the "Generating..." message.
10. Send the generated image to the user as a photo (falling back to document) with a caption showing a truncated combined prompt.
11. Clear the `imageCompose` state and return to home view.

#### Scenario: Successful generation from multiple segments, no image
- **WHEN** the user has sent three text segments and no reference image
- **AND** the user clicks "Pen Down"
- **THEN** the segments are joined with single spaces into one combined prompt
- **AND** the bot calls Gemini with a single text part containing the combined prompt
- **AND** the result image is stored in R2 and saved as an image draft with the combined prompt

#### Scenario: Successful generation with multiple images
- **WHEN** the user has at least one segment and two reference images
- **AND** the user clicks "Pen Down"
- **THEN** the bot calls Gemini with one text part (combined prompt) followed by two `inline_data` parts
- **AND** the image draft stores all source image keys

#### Scenario: No segments on pen down
- **WHEN** the user has not sent any text segment
- **AND** the user clicks "Pen Down"
- **THEN** a toast notification is shown indicating the prompt is missing
- **AND** generation does NOT proceed

#### Scenario: Gemini generation failure
- **WHEN** segments exist but the Gemini API call fails
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
- `segments: ImagePromptSegment[]` — the ordered prompt segments
- `images: ImageRef[]` — the ordered reference images
- `statusMessageId: number` — Telegram message ID of the compose status message

The `types.ts` file SHALL also include:
- `ImagePromptSegment` with `messageId: number` and `text: string`
- `ImageRef` with `messageId: number` and `key: string`

The `ChatContext` interface SHALL include an optional `imageCompose?: ImageComposeState` field.

When reading compose state, the bot SHALL tolerate the legacy shape (`prompt?: string`, `imageKey?: string`) by normalizing a legacy `prompt` into a single segment and a legacy `imageKey` into a single image, so that compose sessions already in progress at deploy time do not break.

#### Scenario: ImageComposeState in ChatContext
- **WHEN** the user enters image create compose mode
- **THEN** the `ChatContext.imageCompose` field contains an `ImageComposeState` with `active: true`, `segments: []`, and `images: []`

#### Scenario: Legacy state normalized on read
- **WHEN** the chat state contains a legacy `imageCompose` with `prompt: "old prompt"` and `imageKey: "k1"` (no `segments`/`images`)
- **THEN** the handler normalizes it to one segment `{ messageId: 0, text: "old prompt" }` and one image `{ messageId: 0, key: "k1" }`
- **AND** the session continues without error

