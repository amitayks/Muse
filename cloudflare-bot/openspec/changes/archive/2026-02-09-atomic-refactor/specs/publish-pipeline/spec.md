## ADDED Requirements

### Requirement: Shared publish pipeline function
The system SHALL provide a single `publishDraft(env, chatId, draft)` function in `core/publish.ts` that executes the full publish flow: parse content → get/generate image → upload media → post thread → update DB status → create published record.

#### Scenario: Publish draft with existing R2 image
- **WHEN** `publishDraft()` is called and the draft has `image_url` starting with `drafts/`
- **THEN** it reads the image from R2, uploads to X via `uploadMediaFromBuffer`, posts the thread, updates draft status to `published`, and creates a published record

#### Scenario: Publish draft without image, generates one
- **WHEN** `publishDraft()` is called and the draft has no `image_url` and no R2 image
- **THEN** it calls `generateImage()` to create one, uploads to X via `uploadMediaFromBuffer`, posts the thread, and updates status

#### Scenario: Publish draft when image generation fails
- **WHEN** `publishDraft()` is called and image generation/upload fails
- **THEN** it continues to post the thread without media, updates status, and creates the published record

#### Scenario: Publish draft returns result
- **WHEN** `publishDraft()` completes successfully
- **THEN** it returns `{ success: true, url: string, tweetIds: string[] }`

#### Scenario: Publish draft handles failure
- **WHEN** the thread posting fails
- **THEN** `publishDraft()` throws an error (callers handle their own error UI)

### Requirement: All publish flows use the shared pipeline
The publish action, publish-all-approved action, cron scheduled publish, and /approve command SHALL all use `publishDraft()` instead of duplicating the publish logic.

#### Scenario: Callback publish action uses pipeline
- **WHEN** user clicks the Publish button on a draft
- **THEN** the action handler calls `publishDraft()` and renders the result

#### Scenario: Cron publish uses pipeline
- **WHEN** the cron handler publishes scheduled drafts
- **THEN** it calls `publishDraft()` for each due draft

#### Scenario: Publish all approved uses pipeline
- **WHEN** user triggers publish-all-approved (via button or /approve command)
- **THEN** it loops through approved drafts calling `publishDraft()` for each

### Requirement: gemini.ts renamed from grok.ts contains only AI generation
The file `services/gemini.ts` (renamed from `grok.ts`) SHALL contain only AI-related functions: `generateContent`, `editContent`, `generateImage`, `callGeminiText`, `parseContentResponse`, prompts, and `consolidateImagePrompt`/`buildImagePrompt`. It SHALL NOT contain R2 storage operations.

#### Scenario: generateImage returns buffer data only
- **WHEN** `generateImage()` is called
- **THEN** it returns `{ data: ArrayBuffer; mimeType: string }` or `null` — it does NOT store anything in R2

### Requirement: Image storage consolidated in storage service
The system SHALL provide `services/storage.ts` that handles image persistence. Functions `generateAndStoreImage(env, chatId, draftId, content)` and `ensureImage(env, chatId, draft)` SHALL move from `grok.ts` to `storage.ts`. This service imports `generateImage` from `gemini.ts` and uses `env.IMAGES` (R2) for storage.

#### Scenario: generateAndStoreImage stores in R2
- **WHEN** `generateAndStoreImage()` is called
- **THEN** it calls `generateImage()` from `gemini.ts`, stores the result in R2, updates the draft's `image_url`, and returns the R2 key

#### Scenario: ensureImage checks R2 before generating
- **WHEN** `ensureImage()` is called for a draft that already has an `image_url`
- **THEN** it verifies the image exists in R2 and returns the URL without regenerating
