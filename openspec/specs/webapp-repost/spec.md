## Purpose

Provides the repost page where users paste an X/Twitter tweet URL, view the fetched original tweet as an embedded preview, compose a quote tweet with AI-refine/image/instruction toggles, get warned about duplicate drafts for the same tweet, and save a repost draft linked to the original tweet.

## Requirements

### Requirement: URL input for repost
The system SHALL provide a text input for pasting an X/Twitter tweet URL.

#### Scenario: Paste tweet URL
- **WHEN** the user pastes a URL like `https://x.com/user/status/123456` into the input
- **THEN** the system SHALL fetch the original tweet and display an embedded preview

#### Scenario: Invalid URL
- **WHEN** the user enters a URL that is not a valid X/Twitter tweet URL
- **THEN** the input SHALL show a validation error "Please enter a valid X/Twitter tweet URL"

### Requirement: Original tweet embedded preview
The system SHALL display the original tweet as an embedded preview card.

#### Scenario: Tweet preview renders
- **WHEN** the original tweet is successfully fetched
- **THEN** the preview card SHALL display: author display name and @username, author profile image, tweet text (full), media thumbnail (if present), engagement metrics (likes, retweets, replies), thread indicator (if part of a thread), link to original tweet

#### Scenario: Tweet with media
- **WHEN** the original tweet has attached images
- **THEN** the preview card SHALL show the image thumbnails

### Requirement: Quote tweet compose area
The system SHALL provide a compose area below the original tweet preview for writing the quote tweet.

#### Scenario: Compose quote tweet
- **WHEN** the original tweet preview is displayed
- **THEN** a textarea SHALL appear below it for composing the user's quote tweet, with a character counter (0/280)

#### Scenario: Compose with toggles
- **WHEN** the compose area is active
- **THEN** the same toggles as the compose page SHALL be available: AI Refine, Image Generation (or Analyze if images attached), and Instruction input

### Requirement: Duplicate repost detection
The system SHALL detect if the user already has a draft for the same original tweet.

#### Scenario: Duplicate detected
- **WHEN** the user enters a URL for a tweet that already has an existing draft
- **THEN** the system SHALL display a warning "You already have a draft for this tweet" with a [View Existing Draft] button that navigates to `/#/draft/:existingDraftId`

### Requirement: Save repost as draft
The system SHALL create a repost draft linking to the original tweet.

#### Scenario: Save repost
- **WHEN** the user taps "Save as Draft" on the repost page
- **THEN** the system SHALL create a draft via `POST /api/v1/repost` with the original tweet URL and the composed text, and navigate to the draft editor for the new draft

#### Scenario: Save repost with AI refine
- **WHEN** the user saves with AI Refine enabled
- **THEN** the draft SHALL be created with AI-refined content, preserving the link to the original tweet
