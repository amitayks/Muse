## Purpose

Provides the admin-only Video Studio: a home page with repo selection and per-repo video counts by status, status-filtered video lists, a video detail page with script preview/editing and embedded playback, status-based actions, and a form for creating new videos from a repository.

## Requirements

### Requirement: Video studio home page (admin only)
The system SHALL display the video studio home page with repo selection and video status overview, accessible only to admin users.

#### Scenario: Admin access
- **WHEN** an admin user navigates to `/#/videos`
- **THEN** the video studio page SHALL load with a list of watched repos and a "Create Standalone Video" button

#### Scenario: Non-admin access denied
- **WHEN** a non-admin user navigates to `/#/videos`
- **THEN** the app SHALL redirect to the home page or show an "Access Denied" message

### Requirement: Video list by status
The system SHALL display videos grouped by status for each repository.

#### Scenario: Repo video overview
- **WHEN** the admin selects a repository
- **THEN** the page SHALL display video counts by status: Draft, Queued, Generating, Completed, Approved, Scheduled, Published, Failed, with clickable links to filtered lists

#### Scenario: Filtered video list
- **WHEN** the admin taps a status count (e.g., "Completed: 3")
- **THEN** a list of videos with that status SHALL be displayed with: title, creation date, and status badge

### Requirement: Video detail page
The system SHALL display full video detail with script preview and actions.

#### Scenario: Video detail loads
- **WHEN** the admin navigates to `/#/video/:id`
- **THEN** the page SHALL display: title, status, video config (length, aspect ratio, emotion, captions), script preview (all scenes), creation date

#### Scenario: Script editing for draft videos
- **WHEN** the video has status "draft"
- **THEN** the script text SHALL be displayed in editable textareas per scene

#### Scenario: Video preview for completed videos
- **WHEN** the video has status "completed" or "approved" and has a video URL
- **THEN** a video player SHALL be embedded for preview

### Requirement: Video actions by status
The system SHALL provide action buttons based on video status.

#### Scenario: Draft video actions
- **WHEN** a video has status "draft"
- **THEN** action buttons SHALL include: Approve & Generate, Regenerate Script, Delete

#### Scenario: Completed video actions
- **WHEN** a video has status "completed"
- **THEN** action buttons SHALL include: Publish, Schedule, Delete

#### Scenario: Failed video actions
- **WHEN** a video has status "failed"
- **THEN** action buttons SHALL include: Retry, Delete

### Requirement: Create video
The system SHALL allow creating a new video for a repository.

#### Scenario: Create video form
- **WHEN** the admin taps "Create Video" for a repository
- **THEN** a form SHALL appear with: commit depth selector, tone input, length selector (30s-5m), aspect ratio selector, character/look selection (from settings), emotion dropdown, captions toggle

#### Scenario: Submit create video
- **WHEN** the admin fills the form and taps "Create"
- **THEN** the system SHALL create a video draft via API and navigate to its detail page
