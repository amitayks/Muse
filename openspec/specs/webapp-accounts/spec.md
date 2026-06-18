## Purpose

Provides the webapp pages for managing followed Twitter/X accounts: listing accounts with status, adding accounts by username, and an account detail page for configuring the relevance threshold, auto-approve and media-AI toggles, persona bootstrap/re-bootstrap, and follow/unfollow/delete actions.

## Requirements

### Requirement: Accounts list page
The system SHALL display all followed Twitter/X accounts as a list with status indicators.

#### Scenario: Accounts list loads
- **WHEN** the user navigates to `/#/accounts`
- **THEN** the system SHALL fetch and display all accounts with: @username, display name, profile image, watching status (following/unfollowed), relevance threshold (X/10)

#### Scenario: No accounts
- **WHEN** the user has no followed accounts
- **THEN** the page SHALL display "No accounts added" with an "Add Account" button

### Requirement: Add account
The system SHALL allow adding an account to follow by `@username`, validated against X before it is saved, using a native input affordance.

#### Scenario: Add account form
- **WHEN** the user taps "Add Account"
- **THEN** a form SHALL appear with a text input for the Twitter @username

#### Scenario: Submit add account
- **WHEN** the user enters a username and confirms
- **THEN** the system SHALL call the add endpoint, validate the account exists on X, add it to the list, and open its detail page

#### Scenario: Invalid username
- **WHEN** the entered username does not resolve on X
- **THEN** the app SHALL show an actionable error and not add the account

### Requirement: Account detail page
The account detail page SHALL mirror the bot's account detail exactly — no more, no less — using native components and chrome. It SHALL display: `@username` (+ display name), watching status, a follow/unfollow control, the relevance threshold (x/10), an auto-approve toggle, a media-AI (Analyze Media) toggle, the AI persona overview with Update/Bootstrap, and Delete.

#### Scenario: Account detail loads with the bot's fields
- **WHEN** the user navigates to an account's detail page
- **THEN** the page SHALL display @username, display name, watching status, relevance threshold (x/10), auto-approve toggle, media-AI toggle, and persona overview (if bootstrapped)

#### Scenario: No fields beyond the bot's
- **WHEN** the account detail renders
- **THEN** it SHALL NOT introduce configuration beyond what the bot exposes (threshold/auto-approve/media-AI/persona/follow/delete)

#### Scenario: Native confirmation on delete
- **WHEN** the user deletes the account
- **THEN** a native Telegram confirmation SHALL be shown before deletion, with haptic feedback

### Requirement: Relevance threshold slider
The system SHALL provide a slider (1-10) for configuring the relevance threshold.

#### Scenario: Adjust threshold
- **WHEN** the user drags the threshold slider to a new value
- **THEN** the threshold value display SHALL update in real-time, and upon release, the new value SHALL be saved via API

#### Scenario: Threshold display
- **WHEN** the slider renders
- **THEN** it SHALL show the current value as a number (e.g., "8/10") with a visual fill bar

### Requirement: Account configuration toggles
The system SHALL allow toggling: auto-approve, media AI analysis.

#### Scenario: Toggle auto-approve
- **WHEN** the user toggles "Auto-Approve"
- **THEN** the change SHALL be saved via API immediately

#### Scenario: Toggle media AI
- **WHEN** the user toggles "Analyze Media"
- **THEN** the change SHALL be saved via API immediately

### Requirement: Persona display and bootstrap
The system SHALL display the AI-generated persona and allow bootstrapping/re-bootstrapping.

#### Scenario: Persona text display
- **WHEN** the account has a bootstrapped persona
- **THEN** the detail page SHALL display the persona text in a read-only card, including: personality summary, topics, communication style, notable context

#### Scenario: Bootstrap persona
- **WHEN** the account has no persona and the user taps "Bootstrap Persona"
- **THEN** the system SHALL call the bootstrap API, show a loading state ("Analyzing account..."), and upon completion, display the generated persona

#### Scenario: Re-bootstrap persona
- **WHEN** the account has an existing persona and the user taps "Update Persona"
- **THEN** the persona SHALL be regenerated via API

### Requirement: Follow/unfollow and delete account
The system SHALL allow unfollowing (pausing) and deleting accounts.

#### Scenario: Unfollow account
- **WHEN** the user taps "Unfollow" on an active account
- **THEN** the account's `is_watching` SHALL be set to 0 via API

#### Scenario: Follow account
- **WHEN** the user taps "Follow" on an unfollowed account
- **THEN** the account's `is_watching` SHALL be set to 1 via API

#### Scenario: Delete account
- **WHEN** the user taps "Delete" on an account
- **THEN** a confirmation dialog SHALL appear. On confirm, the account SHALL be deleted via API and the user SHALL be navigated back to the accounts list
