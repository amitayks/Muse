## ADDED Requirements

### Requirement: Compose mode view
The system SHALL provide a `renderCompose(tweetsCount, charWarnings, imageGen, aiRefine)` view that shows the compose status message with toggle buttons.

#### Scenario: Initial compose view (0 tweets)
- **WHEN** `renderCompose(0, [], false, false)` is called
- **THEN** it SHALL return text "✍️ Composing... (0 tweets)\n\nSend your tweets below. Each message = one tweet.\nEdit any message to update it."
- **AND** keyboard SHALL have: Row 1: [✏️ Pen Down], Row 2: [🎨 Image: OFF] [✨ AI: OFF], Row 3: [❌ Cancel]
- **AND** Pen Down callback SHALL be `compose:pendown`
- **AND** toggle callbacks SHALL be `compose:toggle_image` and `compose:toggle_ai`
- **AND** Cancel callback SHALL be `compose:cancel`

#### Scenario: Compose view with tweets and warnings
- **WHEN** `renderCompose(3, [2], true, false)` is called (3 tweets, tweet 2 over limit, image ON)
- **THEN** text SHALL show "✍️ Composing... (3 tweets)\n⚠️ Tweet 2 exceeds 280 characters"
- **AND** the Image button SHALL show "🎨 Image: ON"
- **AND** the AI button SHALL show "✨ AI: OFF"

### Requirement: Handwritten draft category in categories view
The draft categories navigation SHALL include a "Handwritten" category showing the count of handwritten drafts.

#### Scenario: Handwritten drafts exist
- **WHEN** `renderDraftCategories()` is called and handwritten drafts exist
- **THEN** it SHALL show a "✍️ Handwritten (N)" button linking to `view:drafts_handwrite`
- **AND** the button SHALL be stacked vertically with other category buttons

#### Scenario: No handwritten drafts
- **WHEN** `renderDraftCategories()` is called and no handwritten drafts exist
- **THEN** the "Handwritten" category button SHALL still appear with count 0

### Requirement: Handwritten draft list filter
The `renderDraftsList()` function SHALL support a `handwrite` filter to show only handwritten drafts.

#### Scenario: Handwrite filter
- **WHEN** `renderDraftsList()` is called with filter `handwrite`
- **THEN** it SHALL show only drafts with `source = 'handwrite'` and status in (`draft`, `rejected`)
- **AND** pagination callbacks SHALL use `page:handwrite:N`

### Requirement: Draft detail shows per-tweet media indicators
The `renderDraftDetail()` view SHALL indicate which tweets have attached media when displaying a handwritten draft.

#### Scenario: Handwritten draft with media
- **WHEN** `renderDraftDetail()` displays a handwritten thread where some tweets have media
- **THEN** tweets with media SHALL show a 📷 indicator next to the tweet text in the preview

## MODIFIED Requirements

### Requirement: Draft categories navigation view
The system SHALL provide a `renderDraftCategories(env, chatId)` view that shows draft category buttons with counts: Auto-generated, Handwritten, Approved (ready to publish), and Scheduled.

#### Scenario: Categories with drafts
- **WHEN** `renderDraftCategories()` is called and drafts exist
- **THEN** it SHALL show buttons for each category with their count in parentheses
- **AND** buttons SHALL be stacked vertically (one per row)
- **AND** categories SHALL include: Auto-generated, Handwritten, Approved, Scheduled

#### Scenario: Empty state
- **WHEN** `renderDraftCategories()` is called and no drafts exist
- **THEN** it SHALL show a message encouraging content generation with Generate and Handwrite buttons
