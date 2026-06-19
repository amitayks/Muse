## Purpose

Provides the webapp compose page for creating tweet drafts: a thread builder with character counters, per-tweet image uploads, AI Refine / Image Generation / Analyze Images toggles, an optional AI instruction, a per-session language override (with i18n and API support), and a save-as-draft flow.
## Requirements
### Requirement: Unified Composer and Draft-viewer component
The system SHALL implement composing a new draft and viewing/editing an existing draft as a **single component** driven by an explicit lifecycle state derived from the draft's source, status, and the active toggles. The component's primary action SHALL be the system `MainButton`, whose label and behavior morph by state:

- **composing** (new handwrite): `MainButton` = **Save**
- **pre-generate** (seeded from a commit/repost source, not yet generated): `MainButton` = **Generate**
- **draft** (saved/generated, status `draft`): `MainButton` = **Approve**
- **approved**: `MainButton` = **Publish**
- **scheduled**: `MainButton` = **Publish** (with a scheduled banner and unschedule affordance)
- **published**: read-only, no `MainButton` primary action

Only after Save/Generate produces a persisted draft SHALL the action morph from Save/Generate to Approve, then Publish. The tweet-editing surface (per-tweet text, media, thread tabs) SHALL be identical across states; the existing-draft states additionally show full media, platform toggles, and the top action row (delete · schedule · refine).

#### Scenario: Handwrite composing state
- **WHEN** the user opens the Composer empty (e.g. from the Home placeholder)
- **THEN** the state SHALL be "composing" and the `MainButton` SHALL read "Save"

#### Scenario: Commit-seeded pre-generate state
- **WHEN** the Composer is seeded from a commit event (Edit flow) and no draft exists yet
- **THEN** the state SHALL be "pre-generate" and the `MainButton` SHALL read "Generate"

#### Scenario: Morph to Approve after save
- **WHEN** a Save or Generate completes and a draft with status `draft` now exists
- **THEN** the same screen SHALL update so the `MainButton` reads "Approve" without leaving the component

#### Scenario: Morph to Publish after approve
- **WHEN** the user approves the draft
- **THEN** the `MainButton` SHALL read "Publish"

#### Scenario: Published is read-only
- **WHEN** the component opens a draft with status `published`
- **THEN** the tweet text SHALL be read-only, no editing actions SHALL be offered, and publish results/links SHALL be shown

### Requirement: Add commit source in the composer
The Composer SHALL provide a `[+ commit]` affordance in the customize row that accepts a partial commit SHA, resolves it to a repo+commit via the existing GitHub flow (`findCommitBysha` / `getContentSource`, scoped by `GITHUB_OWNER`/`GITHUB_TOKEN`), and attaches it as the generation source — combined with any text the user has already typed. Generation does not occur until the user taps the `MainButton` (Generate).

#### Scenario: Paste a partial SHA
- **WHEN** the user taps `[+ commit]` and enters a partial commit SHA
- **THEN** the system SHALL resolve the commit's repo and details via the existing GitHub resolution flow and show a commit summary attached to the compose

#### Scenario: SHA not found
- **WHEN** the entered SHA cannot be resolved in any accessible repo
- **THEN** the app SHALL show an actionable error and let the user retry, without creating a draft

#### Scenario: Generate combines message and commit
- **WHEN** a commit source is attached, the user has typed message text, and taps Generate
- **THEN** the generation request SHALL combine the user's message with the resolved commit as the source

### Requirement: Tweet compose editor
The system SHALL provide a compose page for creating new drafts with a rich editing experience, mirroring the bot's handwrite flow but with full editing power.

#### Scenario: Empty compose page
- **WHEN** the user navigates to `/#/compose`
- **THEN** a single empty tweet textarea SHALL be displayed with a character counter (0/280), plus toggle options and an "Add tweet to thread" button below

#### Scenario: Type tweet text
- **WHEN** the user types in the textarea
- **THEN** the character counter SHALL update in real-time

### Requirement: Thread builder
The system SHALL allow composing multi-tweet threads during compose.

#### Scenario: Add tweet to thread
- **WHEN** the user taps "+ Add tweet to thread"
- **THEN** a new numbered textarea SHALL appear below the existing one(s)

#### Scenario: Remove tweet from thread
- **WHEN** the user taps the remove button on a tweet (with 2+ tweets)
- **THEN** the tweet SHALL be removed and remaining tweets renumbered

### Requirement: Image upload during compose
The system SHALL allow attaching images or a single video to each tweet during compose via file picker or drag-and-drop, respecting the photo/video exclusivity rule.

#### Scenario: Attach image during compose
- **WHEN** the user taps "Add image" or drags an image onto a tweet area (with no video attached)
- **THEN** the image SHALL be uploaded via `POST /api/v1/media/upload` and a thumbnail preview SHALL appear below the tweet text

#### Scenario: Attach video during compose
- **WHEN** the user taps "Add video" or drags a `video/mp4` onto a tweet area that has no media yet
- **THEN** the video SHALL be uploaded via `POST /api/v1/media/upload` and a `<video>` preview SHALL appear below the tweet text

#### Scenario: Multiple images per tweet
- **WHEN** the user attaches multiple images to a single tweet
- **THEN** up to 4 images SHALL be allowed, and all SHALL display as thumbnails

#### Scenario: Video exclusivity during compose
- **WHEN** a tweet has a video attached
- **THEN** no additional media SHALL be addable to that tweet
- **AND WHEN** a tweet has photos attached, the video option SHALL NOT be offered

### Requirement: Compose toggles (AI, Image Gen, Analyze)
The system SHALL present compose customization as a bottom **customize row** containing `[+ commit]` and the toggles `ai | language`, each with a default that the user can flip. The **image-generation toggle SHALL be removed** — AI image generation is a per-slot action on each image placeholder (see the `webapp-media` and `per-tweet-image-generation` capabilities), not a compose-time toggle. The `language` toggle SHALL override the AI generation language for the session. Toggling SHALL emit haptic feedback.

#### Scenario: AI toggle
- **WHEN** the user enables the `ai` toggle
- **THEN** the content SHALL be refined by AI when the user saves/generates the draft

#### Scenario: No image toggle in the customize row
- **WHEN** the composer renders the customize row
- **THEN** there SHALL be no image-generation (or image-analyze) toggle
- **AND** the save/generate requests SHALL NOT include an `imageGen`/`image` option

#### Scenario: Image generation is a per-slot action
- **WHEN** the user wants an AI-generated image
- **THEN** they SHALL use the per-slot Generate action on an image placeholder rather than a compose toggle

#### Scenario: Language toggle override
- **WHEN** the user flips the `language` toggle to the non-default language
- **THEN** subsequent save/generate requests SHALL include `langOverride` for that language

### Requirement: Instruction input for AI
The system SHALL provide an optional **instruction tab rendered after the tweet tabs** (the last thread item), which may stay empty or be filled. Its contents SHALL be included as AI guidance in the save/generate/refine request.

#### Scenario: Instruction tab present after tweets
- **WHEN** the Composer renders the thread
- **THEN** an optional instruction field SHALL appear after the last tweet tab, distinct from the tweets

#### Scenario: Instruction guides generation
- **WHEN** the user fills the instruction field and taps Generate (or Save with `ai` on)
- **THEN** the instruction SHALL be included as guidance in the AI request

### Requirement: Save as draft (pen-down equivalent)
The system SHALL provide a "Save as Draft" button that creates the draft, optionally running AI refinement. When a language override is active, the API request SHALL include it so the server uses the correct language for AI calls.

#### Scenario: Save without AI
- **WHEN** the user taps "Save as Draft" with AI Refine toggle OFF
- **THEN** the system SHALL create a draft via `POST /api/v1/compose` with the raw content and navigate to the draft editor for the new draft

#### Scenario: Save with AI refine
- **WHEN** the user taps "Save as Draft" with AI Refine toggle ON
- **THEN** the system SHALL show a loading state ("Refining..."), create the draft with AI refinement via `POST /api/v1/compose`, and navigate to the draft editor for the new draft

#### Scenario: Save with AI refine and lang override
- **WHEN** the user taps "Save as Draft" with AI Refine toggle ON and `langOverride` set to `'he'`
- **THEN** the `POST /api/v1/compose` request body SHALL include `options.langOverride: 'he'`
- **AND** the server SHALL use `'he'` as the language for `refineHandwrittenContent` and `assembleSystemInstruction`

#### Scenario: Cancel compose
- **WHEN** the user taps "Cancel"
- **THEN** a confirmation dialog SHALL appear if any text has been entered ("Discard draft?"), and on confirm, navigate back to home

### Requirement: Compose preserves context on navigation
The system SHALL preserve compose state if the user accidentally navigates away.

#### Scenario: Back navigation with unsaved content
- **WHEN** the user has typed content and taps the back button
- **THEN** a confirmation dialog SHALL appear: "You have unsaved changes. Discard?"

### Requirement: Language override toggle in compose page
The webapp ComposePage SHALL include a language override toggle button in the toggles card that allows the user to switch the AI generation language for the current compose session.

#### Scenario: Default state — no override
- **WHEN** the ComposePage loads
- **THEN** the lang toggle SHALL display the opposite language name as a button (e.g., "עברית" if user's language is English)
- **AND** no `langOverride` SHALL be included in the API request

#### Scenario: Toggle to Hebrew
- **WHEN** the user clicks the lang toggle button showing "עברית"
- **THEN** the button SHALL change to show "English"
- **AND** `langOverride: 'he'` SHALL be included in the compose API request

#### Scenario: Toggle back to default
- **WHEN** the user clicks the lang toggle button showing "English" (after previously switching to Hebrew)
- **THEN** the button SHALL change back to show "עברית"
- **AND** `langOverride` SHALL not be included in the API request (back to default)

#### Scenario: Lang toggle placement in toggles card
- **WHEN** the ComposePage toggles card is rendered
- **THEN** the lang toggle SHALL appear in the toggles card alongside AI Refine and Image Gen toggles

### Requirement: Webapp i18n strings for lang toggle
The webapp i18n registries (en.ts, he.ts) SHALL include string keys for the language override toggle label.

#### Scenario: English i18n registry
- **WHEN** the English i18n registry is examined
- **THEN** it SHALL include a key for the compose lang toggle label (e.g., `compose.langToggle`)

#### Scenario: Hebrew i18n registry
- **WHEN** the Hebrew i18n registry is examined
- **THEN** it SHALL include the corresponding key for the compose lang toggle label

### Requirement: Compose API accepts langOverride
The `POST /api/v1/compose` endpoint SHALL accept an optional `langOverride` field in the `options` object. When present, the server SHALL use it instead of the user's global language for AI calls.

#### Scenario: Compose API with langOverride
- **WHEN** `POST /api/v1/compose` is called with `options.langOverride: 'he'`
- **THEN** `refineHandwrittenContent` SHALL be called with `lang = 'he'`
- **AND** the AI system instruction SHALL use Hebrew skill variants and Hebrew identity document

#### Scenario: Compose API without langOverride
- **WHEN** `POST /api/v1/compose` is called without `langOverride` in options
- **THEN** `refineHandwrittenContent` SHALL use the user's global language from `getUserLanguage()` (existing behavior preserved)

#### Scenario: Generate API with langOverride
- **WHEN** `POST /api/v1/generate` is called with `langOverride: 'he'`
- **THEN** `generateContent` SHALL be called with `lang = 'he'`

#### Scenario: Repost API with langOverride
- **WHEN** `POST /api/v1/repost` is called with `options.langOverride: 'he'`
- **THEN** any AI calls in the repost flow SHALL use `'he'` as the language

