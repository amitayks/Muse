## ADDED Requirements

### Requirement: Identity step in onboarding flow
The onboarding flow SHALL include a new step after the GitHub token step (before completion): the identity analysis step. This step SHALL present the user with two buttons: "Understand who I am" and "Use default". The step SHALL be stored as `onboarding_step = 'identity'`.

#### Scenario: User reaches identity step
- **WHEN** the user completes or skips the GitHub token step
- **THEN** the onboarding SHALL advance to `onboarding_step = 'identity'` and display the identity prompt with two buttons: "Understand who I am" and "Use default"

#### Scenario: User selects "Understand who I am"
- **WHEN** the user clicks "Understand who I am" during `onboarding_step = 'identity'`
- **AND** the user has valid X API credentials (`has_x = 1`)
- **THEN** the system SHALL fetch the user's last 100 tweets, filter pure retweets, run the `/who-am-i` analysis, store the resulting Identity Document, and advance to completion

#### Scenario: User selects "Understand who I am" without X credentials
- **WHEN** the user clicks "Understand who I am" during `onboarding_step = 'identity'`
- **AND** the user has no X API credentials (`has_x = 0`)
- **THEN** the system SHALL display a message explaining that X credentials are needed for tweet analysis, and offer to use the default identity or go back to set up X credentials

#### Scenario: User selects "Use default"
- **WHEN** the user clicks "Use default" during `onboarding_step = 'identity'`
- **THEN** the default skeleton identity SHALL be stored and onboarding SHALL advance to completion

#### Scenario: Identity analysis in progress
- **WHEN** the tweet fetch and analysis is running
- **THEN** the bot SHALL display a "thinking" or progress message (e.g., "Analyzing your writing style...") since the analysis may take several seconds

#### Scenario: Identity analysis fails
- **WHEN** the tweet fetch or Gemini analysis fails during onboarding
- **THEN** the bot SHALL display an error, store the default skeleton identity, and advance to completion with a note that the user can retry from settings

## MODIFIED Requirements

### Requirement: Onboarding completion
When all steps are done, the system SHALL set `status = 'active'`, clear `onboarding_step`, and display a completion summary showing which services are connected and whether identity was analyzed or using default.

#### Scenario: User completes all steps including identity
- **WHEN** the final onboarding step (identity) is completed
- **THEN** `users.status` is set to `'active'`, `onboarding_step` is set to null, and a summary screen shows connected/skipped services plus identity status ("Identity analyzed" or "Using default identity") with "Dashboard" and "Add More Keys" buttons

#### Scenario: User completes with default identity
- **WHEN** the user chose "Use default" for identity
- **THEN** the completion summary SHALL indicate "Using default identity — you can analyze your writing style anytime from Settings"
