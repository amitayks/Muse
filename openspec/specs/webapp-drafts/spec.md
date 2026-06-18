## Purpose

Provides the drafts list view with category tabs and count badges, an infinite-scrolling list of draft preview cards showing content, media, and status, status-based quick actions, navigation into the draft editor, and confirmed deletion.

## Requirements

### Requirement: Draft list with category tabs
The Drafts screen SHALL be a **hub presented as a grid of status categories**, not a tab bar. The grid SHALL include a tile per draft status — Needs Review (draft), Approved, Scheduled, Published (and Publishing when any exist) — each showing a count. Tapping a tile SHALL open that status's list. Within a status list, an optional source filter (Commit · Repost · Handwrite) MAY be offered.

#### Scenario: Hub grid loads
- **WHEN** the user navigates to the Drafts hub
- **THEN** the app SHALL display a grid of status tiles (Needs Review, Approved, Scheduled, Published, …), each with the count of drafts in that status

#### Scenario: Open a status list
- **WHEN** the user taps a status tile (e.g. "Scheduled")
- **THEN** the app SHALL open a list showing only drafts of that status

#### Scenario: Source filter within a list
- **WHEN** the user is viewing a status list and selects a source filter (e.g. "Repost")
- **THEN** the list SHALL show only drafts of that status and source

#### Scenario: Empty status
- **WHEN** a status tile has zero drafts
- **THEN** the tile SHALL show a count of 0, and opening it SHALL show an empty state

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
Tapping a draft card (not its action buttons) SHALL navigate to the unified Composer/Draft-viewer for that draft.

#### Scenario: Tap draft card
- **WHEN** the user taps the main area of a draft card
- **THEN** the app SHALL open the Composer/Draft-viewer for that draft's id

### Requirement: Delete confirmation dialog
The system SHALL require confirmation before deleting a draft, using Telegram's native `showConfirm`/`showPopup` rather than a custom modal, with haptic feedback.

#### Scenario: Delete with native confirmation
- **WHEN** the user taps "Delete" on a draft card
- **THEN** the app SHALL present a native Telegram confirmation popup, and proceed only on confirm

#### Scenario: Confirm delete
- **WHEN** the user confirms deletion
- **THEN** the draft SHALL be deleted via API, the card SHALL be removed from the list, and a success indication SHALL be shown
