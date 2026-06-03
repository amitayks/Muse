## Purpose

Provides the drafts list view with category tabs and count badges, an infinite-scrolling list of draft preview cards showing content, media, and status, status-based quick actions, navigation into the draft editor, and confirmed deletion.

## Requirements

### Requirement: Draft list with category tabs
The system SHALL display drafts in a tabbed list view with categories: All, Auto, Handwritten, Repost, Approved, Scheduled, Published.

#### Scenario: Default tab
- **WHEN** the user navigates to `/#/drafts` without a tab parameter
- **THEN** the "All" tab SHALL be selected, showing all drafts sorted by most recent

#### Scenario: Tab from URL parameter
- **WHEN** the user navigates to `/#/drafts?tab=approved`
- **THEN** the "Approved" tab SHALL be selected, showing only approved drafts

#### Scenario: Tab with count badges
- **WHEN** the drafts page loads
- **THEN** each tab SHALL display a count badge with the number of drafts in that category

### Requirement: Scrollable draft list without pagination limits
The system SHALL display drafts in a scrollable list that loads more items on scroll (infinite scroll or load-more button), not limited to the bot's 5-per-page constraint.

#### Scenario: Initial page load
- **WHEN** the drafts list loads
- **THEN** the system SHALL fetch and display the first 20 drafts for the selected category

#### Scenario: Load more on scroll
- **WHEN** the user scrolls near the bottom of the list
- **THEN** the system SHALL fetch the next batch of 20 drafts and append them to the list

#### Scenario: Empty category
- **WHEN** a category has no drafts
- **THEN** the list SHALL display "No drafts in this category" with a link to create content

### Requirement: Draft card preview
Each draft in the list SHALL be displayed as a card showing a preview of the draft content.

#### Scenario: Draft card content
- **WHEN** a draft card renders
- **THEN** it SHALL display: status emoji/badge, first tweet text (truncated to ~120 chars), source type (auto/handwrite/repost), format indicator (single or thread with count), platform target badges (X, IG Post, IG Story, IG Reel), created/updated timestamp

#### Scenario: Draft card with media
- **WHEN** a draft has attached media (photos)
- **THEN** the card SHALL show a thumbnail or media count indicator

#### Scenario: Published draft card
- **WHEN** a draft has status "published"
- **THEN** the card SHALL show links to the published posts on each platform

### Requirement: Quick actions on draft cards
Each draft card SHALL provide quick action buttons based on the draft's status.

#### Scenario: Draft status quick actions
- **WHEN** a draft has status "draft"
- **THEN** the card SHALL show quick action buttons: Approve, Schedule, Delete

#### Scenario: Approved status quick actions
- **WHEN** a draft has status "approved"
- **THEN** the card SHALL show quick action buttons: Publish, Schedule, Delete

#### Scenario: Scheduled status quick actions
- **WHEN** a draft has status "scheduled"
- **THEN** the card SHALL show quick action buttons: Publish Now, Unschedule, Delete

### Requirement: Draft card navigation to editor
Tapping a draft card (not its action buttons) SHALL navigate to the draft editor.

#### Scenario: Tap draft card
- **WHEN** the user taps the main area of a draft card
- **THEN** the app SHALL navigate to `/#/draft/:id` where `:id` is the draft's ID

### Requirement: Delete confirmation dialog
The system SHALL require confirmation before deleting a draft.

#### Scenario: Delete with confirmation
- **WHEN** the user taps the "Delete" button on a draft card
- **THEN** a confirmation dialog SHALL appear with "Are you sure? This cannot be undone" and buttons "Delete" (destructive) and "Cancel"

#### Scenario: Confirm delete
- **WHEN** the user confirms deletion
- **THEN** the draft SHALL be deleted via API, the card SHALL be removed from the list with an animation, and a success toast SHALL appear
