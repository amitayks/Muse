## Purpose

Provides the webapp compose page for creating tweet drafts: a thread builder with character counters, per-tweet image uploads, AI Refine / Image Generation / Analyze Images toggles, an optional AI instruction, a per-session language override (with i18n and API support), and a save-as-draft flow.

## Requirements

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
The system SHALL allow attaching images to each tweet during compose via file picker or drag-and-drop.

#### Scenario: Attach image during compose
- **WHEN** the user taps "Add image" or drags an image onto a tweet area
- **THEN** the image SHALL be uploaded via `POST /api/v1/media/upload` and a thumbnail preview SHALL appear below the tweet text

#### Scenario: Multiple images per tweet
- **WHEN** the user attaches multiple images to a single tweet
- **THEN** up to 4 images SHALL be allowed, and all SHALL display as thumbnails

### Requirement: Compose toggles (AI, Image Gen, Analyze)
The system SHALL provide toggle switches that mirror the bot's compose toggles.

#### Scenario: AI Refine toggle
- **WHEN** the user enables the "AI Refine" toggle
- **THEN** the composed content SHALL be refined by AI when the user saves the draft (pen-down equivalent)

#### Scenario: Image Generation toggle
- **WHEN** the user enables "Image Generation" toggle (only visible when no images are attached)
- **THEN** the system SHALL generate an AI image prompt from the content when saving

#### Scenario: Analyze Images toggle
- **WHEN** the user enables "Analyze Images" toggle (only visible when images ARE attached)
- **THEN** the system SHALL include the attached images in the AI refinement context

#### Scenario: Image Gen hides when images attached
- **WHEN** the user attaches at least one image to any tweet
- **THEN** the "Image Generation" toggle SHALL be replaced by "Analyze Images" toggle

### Requirement: Instruction input for AI
The system SHALL allow an optional instruction to guide AI refinement.

#### Scenario: Add instruction
- **WHEN** the user taps "Add Instruction" and types a message
- **THEN** the instruction SHALL be included in the AI refinement request when saving

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
