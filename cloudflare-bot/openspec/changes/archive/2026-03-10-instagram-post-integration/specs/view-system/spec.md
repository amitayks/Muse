## MODIFIED Requirements

### Requirement: Draft detail shows published state with platform results
The `renderDraftDetail()` view SHALL handle published status by showing the tweet content and per-platform publish results with success/failure indicators and URL buttons for successful platforms.

#### Scenario: Published draft detail view — all succeeded
- **WHEN** `renderDraftDetail()` is called for a published draft with X and Instagram Post both successful
- **THEN** it SHALL show `Published: 🐦 X ✅ • 📸 Post ✅`
- **AND** it SHALL include "View on X" URL button and "View on Instagram" URL button
- **AND** a "🔄 Repost" button SHALL be shown

#### Scenario: Published draft detail view — partial success
- **WHEN** `renderDraftDetail()` is called for a published draft where X succeeded but Instagram failed
- **THEN** it SHALL show `Published: 🐦 X ✅ • 📸 Post ❌`
- **AND** it SHALL show the error message for the failed platform
- **AND** "View on X" URL button SHALL be shown
- **AND** a "🔄 Repost" button SHALL be shown (for retrying failed platforms)

#### Scenario: Published draft detail view — X only (backward compatible)
- **WHEN** `renderDraftDetail()` is called for a published draft with only X results
- **THEN** it SHALL show "Published: 🐦 X ✅"
- **AND** it SHALL include a "View on X" button using Telegram's URL button feature
- **AND** a "🔄 Repost" button SHALL be shown

### Requirement: Draft detail includes publish targets header
The `renderDraftDetail()` view SHALL display a "Publish targets:" line in the message text for non-published drafts, showing the currently selected platforms.

#### Scenario: Draft with X and Instagram targets
- **WHEN** `renderDraftDetail()` is called for a draft with `publish_targets = { x: true, instagram_post: true }`
- **THEN** the message text SHALL include `Publish targets: 🐦 X • 📸 Post`

#### Scenario: Draft with X only
- **WHEN** `renderDraftDetail()` is called for a draft with `publish_targets = { x: true }`
- **THEN** the message text SHALL include `Publish targets: 🐦 X`

### Requirement: Draft detail action buttons include Platforms
The `renderDraftDetail()` view SHALL include a 🎯 Platforms button (labeled "Plat") in the action button rows for draft, approved, and scheduled statuses.

#### Scenario: Draft status action buttons
- **WHEN** a draft detail is rendered with `status = 'draft'`
- **THEN** the action buttons SHALL be: Row 1: `[✅ Approve] [🗑 Delete]`, Row 2: `[📝 Edit] [📅 Schedule] [🎯 Plat]`

#### Scenario: Approved status action buttons
- **WHEN** a draft detail is rendered with `status = 'approved'`
- **THEN** the action buttons SHALL include `[📤 Publish] [📅 Schedule]` and `[🎯 Plat]`

#### Scenario: Scheduled status action buttons
- **WHEN** a draft detail is rendered with `status = 'scheduled'`
- **THEN** the action buttons SHALL include `[📤 Publish] [⏹ Cancel]` and `[🎯 Plat]`

#### Scenario: Published status action buttons (no Platforms, has Repost)
- **WHEN** a draft detail is rendered with `status = 'published'`
- **THEN** the action buttons SHALL include URL buttons for successful platforms and `[🔄 Repost]`
- **AND** the 🎯 Platforms button SHALL NOT be shown

### Requirement: Publish action returns draft detail with multi-platform results
The publish action SHALL publish the draft and return `renderDraftDetail()` which shows published state with per-platform success/failure indicators.

#### Scenario: Publish draft inline transition — full success
- **WHEN** user clicks "Publish Now" on an approved draft targeting X and Instagram
- **THEN** the draft SHALL be published to both platforms
- **AND** the screen SHALL re-render as draft detail in published state
- **AND** success indicators SHALL be shown for each platform

#### Scenario: Publish draft inline transition — partial failure
- **WHEN** user clicks "Publish Now" and X succeeds but Instagram fails
- **THEN** the screen SHALL re-render showing X success and Instagram failure with error details

### Requirement: Approve action returns draft detail
The approve action SHALL update the draft status and return `renderDraftDetail()` so the user stays on the same screen with updated buttons.

#### Scenario: Approve draft inline transition
- **WHEN** user clicks "Approve" on a draft detail screen
- **THEN** the draft status SHALL change to `approved`
- **AND** the screen SHALL re-render as draft detail with approved-state buttons (Publish Now, Schedule, Platforms)
