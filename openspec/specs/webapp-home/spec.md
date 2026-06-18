## Purpose

Provides the webapp Home screen built around two timelines — a notifications timeline (pending commit events and repost candidates the bot would surface) and a scheduled timeline (upcoming scheduled drafts) — switched by a single bell ↔ schedule toggle, plus a persistent "What's happening?" compose placeholder for starting a new handwritten draft.

## Requirements

### Requirement: Bell toggle between notifications and scheduled timelines
The Home screen SHALL present a single toggle that switches the main area between two timelines: 🔔 a **notifications timeline** and 📅 a **scheduled timeline**. Toggling SHALL morph the toggle icon (bell ↔ schedule) and transition the timeline items between the two views. Both timelines' data SHALL be fetched together so the toggle is instant.

#### Scenario: Toggle from scheduled to notifications
- **WHEN** the user taps the toggle while the scheduled timeline is shown
- **THEN** the icon SHALL change to the bell, and the main area SHALL morph to the notifications timeline

#### Scenario: Toggle back to scheduled
- **WHEN** the user taps the toggle while the notifications timeline is shown
- **THEN** the icon SHALL change to the schedule icon, and the main area SHALL morph back to the scheduled timeline

#### Scenario: Default view
- **WHEN** the Home screen first loads
- **THEN** it SHALL show the scheduled timeline by default

### Requirement: Scheduled posts timeline
The Home scheduled view SHALL display the user's upcoming scheduled drafts as a chronological timeline-flow. Each row SHALL show the post title (first tweet, truncated), the scheduled date/time in the user's timezone, and an icon per selected publish platform. Rows SHALL be grouped by day where helpful (e.g. Today / Tomorrow / date).

#### Scenario: Scheduled drafts exist
- **WHEN** the user has one or more scheduled drafts
- **THEN** the timeline SHALL list them in ascending time order, each row showing title · date/time · platform icons

#### Scenario: Tap a scheduled row
- **WHEN** the user taps a scheduled row
- **THEN** the app SHALL open that draft in the Composer/Draft-viewer

#### Scenario: No scheduled drafts
- **WHEN** the user has no scheduled drafts
- **THEN** the scheduled view SHALL show an empty state inviting the user to compose or review notifications

#### Scenario: Live update after publish
- **WHEN** a scheduled draft is published by the backend cron while Home is open
- **THEN** the timeline SHALL reflect the change on next refresh (it SHALL no longer appear as upcoming)

### Requirement: Notifications timeline
The Home notifications view SHALL display every pre-draft indicator the bot would notify the user about — `commit_events` from watched-repo PR/push activity **and** repost candidates (AI-scored tweets from followed accounts) — that have not yet been turned into drafts. Each row SHALL summarize its source (e.g. PR/commit title + repo, or candidate tweet preview + score). These are indicators, not drafts.

#### Scenario: Notification rows render
- **WHEN** the notifications view loads and there are pending commit events and/or repost candidates
- **THEN** each SHALL appear as a row summarizing its source, ordered most-recent-first

#### Scenario: Tap a notification opens the Composer seeded with its source
- **WHEN** the user taps a notification row
- **THEN** the app SHALL open the Composer/Draft-viewer seeded from that source (a commit event seeds the `[+ commit]` flow; a repost candidate seeds the repost source), with no draft created until the user saves/generates

#### Scenario: Empty notifications
- **WHEN** there are no pending commit events or repost candidates
- **THEN** the notifications view SHALL show an empty state ("Nothing new to review")

### Requirement: Compose placeholder entry
The Home screen SHALL display a persistent "What's happening?" placeholder that opens the Composer for a new handwritten draft.

#### Scenario: Tap the placeholder
- **WHEN** the user taps the "What's happening?" placeholder
- **THEN** the app SHALL open the Composer in the empty handwrite state
