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

### Requirement: Quick approve from list
The system SHALL allow approving a draft directly from the list view. After approval, the list SHALL re-render showing the draft's updated status with a publish button.

#### Scenario: Quick approve updates list in place
- **WHEN** user taps ✅ on a draft in the list
- **THEN** the draft status is updated to "approved" in the database
- **AND** the list is re-rendered on the same page
- **AND** the draft's quick-action row now shows `[📤] [🗑]` instead of `[✅] [🗑]`

### Requirement: Quick publish from list
The system SHALL allow publishing an approved draft directly from the list view.

#### Scenario: Quick publish publishes and re-renders list
- **WHEN** user taps 📤 on an approved draft in the list
- **THEN** the draft is published to X
- **AND** the list is re-rendered on the same page

### Requirement: Quick delete from list with confirmation
The system SHALL show a confirmation prompt before deleting a draft from the list view.

#### Scenario: Quick delete shows confirmation
- **WHEN** user taps 🗑 on a draft in the list
- **THEN** the message is updated to a confirmation prompt showing the draft title
- **AND** confirmation buttons are `[✅ Yes, Delete] [❌ Cancel]`
- **AND** both buttons encode the list context for return navigation

#### Scenario: Confirm delete removes draft and re-renders list
- **WHEN** user confirms deletion from the list confirmation prompt
- **THEN** the draft and its R2 image are deleted
- **AND** the list is re-rendered on the same page

#### Scenario: Cancel delete returns to list
- **WHEN** user cancels deletion from the list confirmation prompt
- **THEN** the list is re-rendered on the same page without changes

### Requirement: Quick actions support repost drafts
All existing quick actions (list approve, list publish, list delete, list confirm delete, list cancel delete) SHALL work with repost drafts (`source='repost'`). The `listType='repost'` with short code `'r'` SHALL be supported in the context parsing.

#### Scenario: Quick approve repost draft
- **WHEN** user taps ✅ on a repost draft in the RePosts list
- **THEN** the draft status SHALL update to 'approved' and the list SHALL re-render

#### Scenario: Quick publish repost draft
- **WHEN** user taps 📤 on an approved repost draft
- **THEN** the draft SHALL be published as a quote tweet on X and the list SHALL re-render

#### Scenario: Quick delete repost draft
- **WHEN** user taps 🗑 on a repost draft in the RePosts list
- **THEN** a confirmation prompt SHALL appear with the draft title

### Requirement: Repost list type in short code mapping
The `listTypeToShort` and `shortToListType` mappings SHALL include repost: `{ repost: 'r' }` and `{ r: 'repost' }`.

#### Scenario: Callback data encoding
- **WHEN** a repost draft quick action is rendered
- **THEN** the context SHALL use `r` as the short code (e.g., `action:la:DRAFT_ID:r:0`)

### Requirement: Repost draft title in quick actions
The quick-action list SHALL display repost drafts with the `🔄` emoji prefix and show `@username — tweet-preview...` format (parsed from `pr_title`).

#### Scenario: Repost draft in list
- **WHEN** a repost draft appears in the RePosts list
- **THEN** the title button SHALL show `🔄 @vercel — Next.js 15.3 is here...`
