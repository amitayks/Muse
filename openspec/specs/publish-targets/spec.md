## Purpose

Lets a draft be published to multiple platforms (X, Instagram Post, Story, Reel) by storing per-draft `publish_targets` and per-platform `publish_results`, enforcing rules such as Post/Reel mutual exclusivity, video-gated Reels, Instagram-credential gating, and at-least-one-target, and drives the Telegram toggle UI, publish-targets header, and repost-from-published flow.

## Requirements

### Requirement: PublishTargets type
The system SHALL define a `PublishTargets` interface with boolean fields: `x`, `instagram_post`, `instagram_story`, `instagram_reel`.

#### Scenario: Default publish targets
- **WHEN** a new draft is created and no user defaults are set
- **THEN** `publish_targets` SHALL default to `{ x: true, instagram_post: false, instagram_story: false, instagram_reel: false }`

#### Scenario: User with custom defaults
- **WHEN** a new draft is created and the user has `default_publish_targets` set to `{ x: true, instagram_post: true, instagram_story: false, instagram_reel: false }`
- **THEN** the draft SHALL inherit those defaults as its `publish_targets`

### Requirement: PublishResults type
The system SHALL define a `PublishResults` interface with optional per-platform result objects and an optional `errors` record.

#### Scenario: Successful multi-platform publish
- **WHEN** X and Instagram Post both succeed
- **THEN** `publish_results` SHALL be `{ x: { tweet_ids: [...], url: "..." }, instagram_post: { post_id: "...", url: "..." } }`

#### Scenario: Partial failure
- **WHEN** X succeeds but Instagram Story fails
- **THEN** `publish_results` SHALL be `{ x: { tweet_ids: [...], url: "..." }, errors: { instagram_story: "Token expired" } }`

### Requirement: Post and Reel mutual exclusivity
The system SHALL enforce that `instagram_post` and `instagram_reel` cannot both be `true` at the same time. Enabling one SHALL automatically disable the other.

#### Scenario: User enables Post when Reel is active
- **WHEN** the user toggles `instagram_post` to `true` and `instagram_reel` is currently `true`
- **THEN** `instagram_reel` SHALL be set to `false`
- **AND** the updated targets SHALL be persisted to the draft

#### Scenario: User enables Reel when Post is active
- **WHEN** the user toggles `instagram_reel` to `true` and `instagram_post` is currently `true`
- **THEN** `instagram_post` SHALL be set to `false`

#### Scenario: Story and X combine with either
- **WHEN** the user has `instagram_story: true` and `x: true`
- **THEN** the user SHALL be able to enable either `instagram_post` or `instagram_reel` in addition (but not both)

### Requirement: Reel toggle conditional on video
The `instagram_reel` toggle SHALL only be shown when the draft has `has_video = 1`.

#### Scenario: Draft without video
- **WHEN** the platform toggle buttons are rendered for a draft with `has_video = 0`
- **THEN** the Reel button SHALL NOT be displayed

#### Scenario: Draft with video
- **WHEN** the platform toggle buttons are rendered for a draft with `has_video = 1`
- **THEN** the Reel button SHALL be displayed and toggleable

### Requirement: Instagram toggles conditional on token configuration
Instagram platform options (Post, Story, Reel) SHALL only be displayed when the user has valid Instagram credentials configured (`has_instagram = 1`).

#### Scenario: User without Instagram configured
- **WHEN** the platform toggle buttons are rendered and `user.has_instagram = 0`
- **THEN** only the X toggle SHALL be shown
- **AND** Instagram options SHALL NOT appear

#### Scenario: User with Instagram configured
- **WHEN** the platform toggle buttons are rendered and `user.has_instagram = 1`
- **THEN** X, Instagram Post, Instagram Story, and (conditionally) Instagram Reel SHALL be shown

### Requirement: At least one target required
The system SHALL prevent approving or publishing a draft with no targets selected.

#### Scenario: User deselects all targets
- **WHEN** the user attempts to toggle off the last remaining active target
- **THEN** the system SHALL prevent the toggle and keep the target active
- **AND** show a brief toast/alert via Telegram callback answer: "At least one platform must be selected"

### Requirement: Platform toggle button UI flow
The draft detail view SHALL include a "Platforms" button (🎯) in the action button rows. Clicking it SHALL replace the action button rows with platform toggle buttons. Clicking "Done" SHALL restore the action buttons.

#### Scenario: Enter platform toggle mode
- **WHEN** the user clicks the 🎯 Platforms button
- **THEN** the inline keyboard SHALL be replaced with platform toggle buttons showing current state
- **AND** checked platforms SHALL show `✓` suffix (e.g., `🐦 X ✓`)
- **AND** unchecked platforms SHALL show without suffix (e.g., `📸 Post`)
- **AND** a `✖ Done` button SHALL be present

#### Scenario: Toggle a platform
- **WHEN** the user clicks a platform toggle button (e.g., `📸 Post`)
- **THEN** the draft's `publish_targets` SHALL be updated in the database
- **AND** the message header text SHALL update to reflect the new targets
- **AND** the toggle buttons SHALL re-render showing the updated state

#### Scenario: Exit platform toggle mode
- **WHEN** the user clicks `✖ Done`
- **THEN** the inline keyboard SHALL be replaced with the normal action buttons for the draft's current status

### Requirement: Publish targets header display
The draft detail view message text SHALL include a "Publish targets:" line showing the currently selected platforms with emoji badges.

#### Scenario: X only selected
- **WHEN** a draft has `publish_targets = { x: true }`
- **THEN** the header SHALL display `Publish targets: 🐦 X`

#### Scenario: Multiple targets selected
- **WHEN** a draft has `publish_targets = { x: true, instagram_post: true, instagram_story: true }`
- **THEN** the header SHALL display `Publish targets: 🐦 X • 📸 Post • 📖 Story`

### Requirement: Platforms button available from all active draft states
The 🎯 Platforms button SHALL appear in the action button rows for drafts in `draft`, `approved`, and `scheduled` statuses. It SHALL NOT appear for `published` status (which has the Repost button instead).

#### Scenario: Draft status shows Platforms button
- **WHEN** a draft detail is rendered with `status = 'draft'`
- **THEN** the action buttons SHALL include `[✅ Approve] [🗑 Delete]` row and `[📝 Edit] [📅 Schedule] [🎯 Plat]` row

#### Scenario: Approved status shows Platforms button
- **WHEN** a draft detail is rendered with `status = 'approved'`
- **THEN** the action buttons SHALL include the 🎯 Platforms button

#### Scenario: Scheduled status shows Platforms button
- **WHEN** a draft detail is rendered with `status = 'scheduled'`
- **THEN** the action buttons SHALL include the 🎯 Platforms button

### Requirement: Repost from published
Published drafts SHALL have a "Repost" button (🔄) that enters a platform selection mode for re-publishing.

#### Scenario: Published draft shows Repost button
- **WHEN** a draft detail is rendered with `status = 'published'`
- **THEN** the action buttons SHALL include `[🔗 View on X] [🔄 Repost]`

#### Scenario: Click Repost enters platform picker
- **WHEN** the user clicks 🔄 Repost on a published draft
- **THEN** the inline keyboard SHALL be replaced with platform toggle buttons (all unchecked initially)
- **AND** a `📤 Publish` button and `✖ Cancel` button SHALL be present

#### Scenario: Repost publish executes
- **WHEN** the user selects platforms and clicks `📤 Publish` in the repost flow
- **THEN** the system SHALL publish the draft content to the selected platforms
- **AND** the `publish_results` SHALL be updated with the new results (merged with existing)
- **AND** the draft detail SHALL re-render showing the combined results

#### Scenario: Repost cancel
- **WHEN** the user clicks `✖ Cancel` in the repost flow
- **THEN** the inline keyboard SHALL return to the normal published state buttons

### Requirement: Published detail shows per-platform results
The published draft detail view SHALL display which platforms succeeded and which failed.

#### Scenario: All platforms succeeded
- **WHEN** a published draft has `publish_results` with X and Instagram Post both successful
- **THEN** the message SHALL display `Published: 🐦 X ✅ • 📸 Post ✅`
- **AND** a "View on X" URL button and "View on Instagram" URL button SHALL be shown

#### Scenario: Partial success
- **WHEN** a published draft has X succeeded but Instagram Story failed
- **THEN** the message SHALL display `Published: 🐦 X ✅ • 📖 Story ❌`
- **AND** the error message SHALL be shown below (e.g., "Instagram Story: Token expired")

### Requirement: Callback data format for platform toggles
Platform toggle callbacks SHALL use the format `plat:toggle:{platform}:{draftId}` where platform is one of `x`, `ig_post`, `ig_story`, `ig_reel`.

#### Scenario: Toggle X callback
- **WHEN** the user clicks the X toggle button
- **THEN** the callback data SHALL be `plat:toggle:x:{draftId}`

#### Scenario: Repost platform toggle callback
- **WHEN** the user clicks a platform toggle in the repost flow
- **THEN** the callback data SHALL be `plat:repost:toggle:{platform}:{draftId}`

#### Scenario: Repost publish callback
- **WHEN** the user clicks Publish in the repost flow
- **THEN** the callback data SHALL be `plat:repost:publish:{draftId}`
