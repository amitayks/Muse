## MODIFIED Requirements

### Requirement: Two-row layout per draft in list views
Each draft item in `renderDraftsList` SHALL render two rows of inline buttons: the first row is the full-width title button (navigates to draft detail), and the second row contains quick-action buttons side by side.

#### Scenario: Draft with status "draft" shows approve and delete
- **WHEN** a draft list is rendered containing a draft with status "draft"
- **THEN** the draft item has two rows: `[title button]` and `[✅] [🗑]`
- **AND** ✅ has callback `action:list_approve:<draftId>:<listType>:<page>`
- **AND** 🗑 has callback `action:list_delete:<draftId>:<listType>:<page>`

#### Scenario: Draft with status "approved" shows publish and delete
- **WHEN** a draft list is rendered containing a draft with status "approved"
- **THEN** the draft item has two rows: `[title button]` and `[📤] [🗑]`
- **AND** 📤 has callback `action:list_publish:<draftId>:<listType>:<page>`

#### Scenario: Draft with status "published" shows only delete
- **WHEN** a draft list is rendered containing a draft with status "published"
- **THEN** the draft item has two rows: `[title button]` and `[🗑]`

#### Scenario: Draft with status "scheduled" shows only delete
- **WHEN** a draft list is rendered containing a draft with status "scheduled"
- **THEN** the draft item has two rows: `[title button]` and `[🗑]`

#### Scenario: Draft with status "rejected" shows only delete
- **WHEN** a draft list is rendered containing a draft with status "rejected"
- **THEN** the draft item has two rows: `[title button]` and `[🗑]`

### Requirement: Draft title shows platform badges
The draft title button in list views SHALL include platform target badges showing which platforms the draft is configured for.

#### Scenario: Draft targeting X only
- **WHEN** a draft has `publish_targets = { x: true }`
- **THEN** the title button SHALL show the standard title without additional badges (X is the default)

#### Scenario: Draft targeting X and Instagram Post
- **WHEN** a draft has `publish_targets = { x: true, instagram_post: true }`
- **THEN** the title button SHALL append `📸` badge to the title text

#### Scenario: Draft targeting multiple Instagram options
- **WHEN** a draft has `publish_targets = { x: true, instagram_post: true, instagram_story: true }`
- **THEN** the title button SHALL append `📸📖` badges to the title text

### Requirement: Quick publish respects publish targets
The quick publish action from the list view SHALL publish to all platforms specified in the draft's `publish_targets`.

#### Scenario: Quick publish to X and Instagram
- **WHEN** user taps 📤 on an approved draft that targets X and Instagram Post
- **THEN** `publishDraft()` SHALL be called with the draft's configured targets
- **AND** the list SHALL re-render showing the draft's updated status
