## ADDED Requirements

### Requirement: Accounts list page
The system SHALL display all followed Twitter/X accounts as a list with status indicators.

#### Scenario: Accounts list loads
- **WHEN** the user navigates to `/#/accounts`
- **THEN** the system SHALL fetch and display all accounts with: @username, display name, profile image, watching status (following/unfollowed), relevance threshold (X/10)

#### Scenario: No accounts
- **WHEN** the user has no followed accounts
- **THEN** the page SHALL display "No accounts added" with an "Add Account" button

### Requirement: Add account
The system SHALL allow adding a new Twitter account to follow by username.

#### Scenario: Add account form
- **WHEN** the user taps "Add Account"
- **THEN** a form SHALL appear with a text input for the Twitter @username

#### Scenario: Submit add account
- **WHEN** the user enters a username and taps "Add"
- **THEN** the system SHALL call `POST /api/v1/accounts`, validate the account exists on X, and add it to the list

### Requirement: Account detail page
The system SHALL display full account configuration and persona on a detail page.

#### Scenario: Account detail loads
- **WHEN** the user navigates to `/#/account/:id`
- **THEN** the page SHALL display: @username, display name, profile image, watching status, relevance threshold slider, auto-approve toggle, media AI toggle, persona text (if bootstrapped)

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
