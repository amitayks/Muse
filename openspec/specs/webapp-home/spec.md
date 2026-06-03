## Purpose

Provides the webapp home dashboard with draft/approved/scheduled/published status counters that link to filtered draft lists, a next-scheduled-draft preview card, content-creation action buttons (Handwrite, Generate, Repost, Image), and an admin-only Video Studio entry point.

## Requirements

### Requirement: Dashboard status counters
The system SHALL display status counters showing the number of drafts, approved, scheduled, and published posts.

#### Scenario: Counters load on page mount
- **WHEN** the user opens the home page
- **THEN** the app SHALL fetch and display counts for each draft status category: drafts, approved, scheduled, published

#### Scenario: Zero state
- **WHEN** all counters are zero
- **THEN** the home page SHALL display a welcome message with a prompt to create first content

### Requirement: Next scheduled draft preview
The system SHALL display a preview card of the next scheduled draft, if any.

#### Scenario: Scheduled draft exists
- **WHEN** the user has at least one scheduled draft
- **THEN** the home page SHALL show a preview card with: first tweet text (truncated to ~100 chars), scheduled date/time in user's timezone, and buttons [View] and [Publish Now]

#### Scenario: No scheduled drafts
- **WHEN** the user has no scheduled drafts
- **THEN** the next-up section SHALL be hidden or show "All clear — nothing scheduled"

### Requirement: Action buttons for content creation
The system SHALL provide action buttons that mirror the bot's home screen: Handwrite, Generate, Repost. The home view's bottom row (Settings/Help) SHALL include an "Image" button between Settings and Help that enters image create compose mode.

#### Scenario: Handwrite button navigates to compose
- **WHEN** the user taps the "Handwrite" button
- **THEN** the app SHALL navigate to `/#/compose`

#### Scenario: Generate button navigates to generate page
- **WHEN** the user taps the "Generate" button
- **THEN** the app SHALL navigate to `/#/generate`

#### Scenario: Repost button navigates to repost page
- **WHEN** the user taps the "Repost" button
- **THEN** the app SHALL navigate to `/#/repost`

#### Scenario: Image button in settings row on bot home
- **WHEN** the user views the bot home screen
- **THEN** the bottom row SHALL contain `[Settings] [🎨 Image] [Help]`
- **AND** the Image button callback data SHALL be `view:image_create`

### Requirement: Quick navigation to drafts by status
The system SHALL allow tapping a status counter to navigate directly to the filtered drafts list.

#### Scenario: Tap approved counter
- **WHEN** the user taps the "Approved" counter showing "3"
- **THEN** the app SHALL navigate to `/#/drafts?tab=approved`

### Requirement: Admin-only Video Studio link
The system SHALL show a Video Studio navigation item only for admin users.

#### Scenario: Admin user sees Video Studio
- **WHEN** the current user is an admin (determined from API response)
- **THEN** the home page and navigation bar SHALL include a "Video Studio" link

#### Scenario: Non-admin user does not see Video Studio
- **WHEN** the current user is not an admin
- **THEN** the Video Studio link SHALL NOT appear anywhere in the UI
