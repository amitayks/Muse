## Purpose

Skill-based, identity-aware AI image generation for a specific tweet slot. Owns the per-slot API endpoint, source-aware context assembly (handwrite / commit / repost), the `image-prompt-builder` skill invocation, the standalone JSON-prompt LLM call, JSON-as-is delivery to the Gemini image model, R2 storage, attachment to per-tweet `media[]`, and bot sync of the new media.

## Requirements

### Requirement: Per-tweet image generation endpoint
The system SHALL provide `POST /api/v1/drafts/:id/tweets/:idx/image` that generates an AI image for the tweet at index `idx` in draft `id`, attaches it to that tweet's `media`, persists the updated draft content, and returns the new media reference `{ key, type: 'photo' }`. The endpoint SHALL require the same Telegram initData authentication as all other `/api/v1/` routes and SHALL operate only on a draft owned by the authenticated user.

#### Scenario: Generate an image for a tweet slot
- **WHEN** an authenticated user POSTs to `/api/v1/drafts/:id/tweets/:idx/image` for a draft they own
- **THEN** the system SHALL generate an image, store it in R2, append `{ key, type: 'photo' }` to `content.tweets[idx].media`, save the draft, and return the new media reference

#### Scenario: Draft not found or not owned
- **WHEN** the draft id does not exist or is not owned by the authenticated user
- **THEN** the endpoint SHALL return a 404 error and SHALL NOT generate an image

#### Scenario: Invalid tweet index
- **WHEN** `idx` is out of range for the draft's tweets
- **THEN** the endpoint SHALL return a 400 error and SHALL NOT generate an image

### Requirement: Image AI receives only the image-prompt-builder skill, identity, and tweet context
The generation call's system instruction SHALL consist solely of the `/image-gen` skill and the user's identity document, assembled via the existing skill-assembly path. The user message SHALL consist solely of the tweet text plus the source-derived context defined below. No additional stylistic direction, repo visual-theme injection, or other steering SHALL be added — the model decides the image from skill + identity + tweet alone. (The `/image-gen` skill is the "how, not what" creative-freedom skill; it is no longer the generic `image-prompt-builder` methodology.)

#### Scenario: Handwrite generation inputs
- **WHEN** generating an image for a `handwrite` draft tweet
- **THEN** the system instruction SHALL be exactly the `/image-gen` skill plus the user's identity
- **AND** the user message SHALL be the tweet text only, with no extra style guidance injected

#### Scenario: No external steering injected
- **WHEN** the generation prompt is assembled for any source
- **THEN** the only inputs SHALL be the `/image-gen` skill, the identity document, the tweet text, and the source-derived context — nothing else

### Requirement: The /image-gen skill prescribes how, not what
The `/image-gen` skill used by this pipeline SHALL guide the model only on **how** to produce an image that accompanies the tweet, and SHALL NOT bias the model toward any particular subject, genre, or photographic style. In particular it SHALL NOT default to depicting a person, SHALL NOT impose a fashion/portrait framework, and SHALL NOT carry a fixed category schema or camera/lighting/film-stock vocabulary. The choice of subject and visual style SHALL be the model's, grounded by the attached identity and the tweet.

#### Scenario: Commit tweet does not default to a person photo
- **WHEN** an image is generated for a `commit` draft tweet whose text and context contain no person
- **THEN** the skill SHALL NOT cause the model to invent and depict a person
- **AND** the generated image SHALL relate to the tweet's actual subject rather than a styled portrait of an imagined person

#### Scenario: No genre or style is forced by the skill
- **WHEN** the `/image-gen` skill is in effect for any source
- **THEN** the skill SHALL NOT require a specific photographic genre, styling framework, or camera/lighting vocabulary
- **AND** the model SHALL remain free to choose both subject and visual style

### Requirement: Source-aware context assembly
The service SHALL assemble the user-message context by branching on `draft.source`, using identifiers already stored on the draft, without requiring the caller to pass context:
- `handwrite` SHALL use the tweet text only.
- `commit` SHALL use the tweet text plus the repo overview and commit message, reconstructed from the stored `commit_sha` via `getContentSource(sha)` and the repo overview from D1.
- `repost` SHALL use the tweet text plus the original tweet, reconstructed from the stored `original_tweet_id` when needed.

#### Scenario: Commit draft reconstructs repo and commit context
- **WHEN** generating an image for a `commit` draft tweet
- **THEN** the context SHALL include the tweet text, the commit message, and the repo overview resolved from the draft's stored `commit_sha`

#### Scenario: Repost draft includes the original tweet
- **WHEN** generating an image for a `repost` draft tweet
- **THEN** the context SHALL include the tweet text and the original tweet resolved from the draft's stored `original_tweet_id`

#### Scenario: Handwrite draft uses tweet text only
- **WHEN** generating an image for a `handwrite` draft tweet
- **THEN** the context SHALL be the tweet text with no commit or repost reconstruction

### Requirement: Single JSON image prompt sent to the image model as-is
The generation LLM call SHALL return a single JSON image prompt object. The service SHALL serialize it with `JSON.stringify` and pass it unmodified as the text part to `generateGeminiImage()` (the existing resilient Gemini image helper). The service SHALL NOT flatten the prompt into prose and SHALL NOT depend on a fixed `ImagePromptData` schema.

#### Scenario: JSON prompt forwarded intact
- **WHEN** the LLM returns a JSON image prompt
- **THEN** the service SHALL send `JSON.stringify(prompt)` as the text input to `generateGeminiImage()` with no prose consolidation step

#### Scenario: Non-JSON model response
- **WHEN** the LLM response cannot be parsed as a JSON object
- **THEN** the endpoint SHALL return an error and SHALL NOT call the image model with malformed input

### Requirement: Generated image attaches to per-tweet media, not draft.image_url
Generated image bytes SHALL be stored in R2 under the webapp media key format `webapp/{chatId}/{timestamp}-{random}.{ext}` (uniform with uploads for serving, CORS, and cleanup) and appended as `{ key, type: 'photo' }` to `content.tweets[idx].media`. The service SHALL NOT write `draft.image_url`. Existing `draft.image_url` values SHALL remain readable for legacy drafts and the publish/tweet-card paths.

#### Scenario: New image lands in the target tweet's media array
- **WHEN** an image is generated for tweet `idx`
- **THEN** a new `{ key, type: 'photo' }` SHALL be appended to `content.tweets[idx].media`
- **AND** `draft.image_url` SHALL be left unchanged

#### Scenario: Legacy image_url still renders
- **WHEN** an older draft has `draft.image_url` set and no generated per-tweet media
- **THEN** the publish and tweet-card paths SHALL still read `draft.image_url`

### Requirement: Generated media syncs to the bot message
After attaching the new media and saving the draft, the webapp endpoint SHALL drive `syncBotMessage()` via `ctx.waitUntil()` so the Telegram bot message reflects the newly generated image, consistent with other webapp mutations. The webapp client SHALL update local state only after a successful generation (the server already persisted and synced), to avoid a duplicate draft save and a second bot photo.

#### Scenario: Bot reflects the generated image
- **WHEN** a per-tweet image generation completes via the webapp
- **THEN** the existing bot-message sync SHALL run so the Telegram draft view shows the new media

#### Scenario: No duplicate sync from the client
- **WHEN** the webapp receives the new media from a successful generation
- **THEN** it SHALL update local editor state without re-persisting the draft (no second PUT, no second bot photo)

### Requirement: Generation failure surfaces an actionable error
When image generation fails — `GeminiImageError`, a 4xx/safety block from the image model, or a malformed LLM response — the endpoint SHALL return an error response including the model/error detail, and SHALL leave the tweet's media unchanged.

#### Scenario: Image model rejects or fails
- **WHEN** `generateGeminiImage()` throws a `GeminiImageError`
- **THEN** the endpoint SHALL return an error including the status/detail and SHALL NOT modify the draft's media

### Requirement: Generated images are sized for delivery
The service SHALL request a `2K` image from the image model rather than the `4K` default, so the result (≈2–3 MB) stays within Telegram's `sendPhoto`-by-URL size limit and the bot-message sync can attach it.

#### Scenario: Tweet image generated at 2K
- **WHEN** the service calls `generateGeminiImage()`
- **THEN** it SHALL request `imageSize: '2K'`

### Requirement: Bot fast flows use the unified per-tweet generation service
The bot flows that previously auto-generated an image via the removed content-coupled `imagePrompt` path (`fast-generate`, `fast-commit`, and compose pen-down) SHALL, when their image option is enabled, generate the image via the unified per-tweet service writing `content.tweets[0].media`, rather than via `ensureImage`/`generateAndStoreImage` writing `draft.image_url`.

#### Scenario: Fast commit generates into per-tweet media
- **WHEN** a bot fast-commit flow runs with its image option enabled
- **THEN** the image SHALL be produced by the unified per-tweet service and attached to `content.tweets[0].media`
- **AND** `draft.image_url` SHALL NOT be written
