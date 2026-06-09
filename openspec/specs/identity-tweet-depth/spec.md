# identity-tweet-depth Specification

## Purpose
TBD - created by archiving change add-configurable-identity-tweet-depth. Update Purpose after archive.
## Requirements
### Requirement: Identity analysis depth setting storage
The system SHALL persist a per-user identity analysis depth as an integer column `identity_tweet_count` on the `users` table, constrained to the preset values 100, 200, or 400, with a default of 200. This stored value SHALL be the single source of truth for how many recent posts the identity analysis fetches, honored by every identity analysis entry point (onboarding analysis, settings re-analysis, and language-sync re-analysis).

#### Scenario: Migration adds the depth column with default 200
- **WHEN** the `019_identity_tweet_depth.sql` migration runs
- **THEN** the `users` table SHALL have an `identity_tweet_count` integer column defaulting to 200
- **AND** existing user rows SHALL read as 200

#### Scenario: New user defaults to 200
- **WHEN** a user has never changed their identity analysis depth
- **THEN** the effective depth SHALL be 200

#### Scenario: Invalid stored value falls back to default
- **WHEN** the stored `identity_tweet_count` is missing, null, or not one of 100/200/400
- **THEN** the system SHALL treat the depth as 200

#### Scenario: Saving a depth persists only valid presets
- **WHEN** a save is requested with a value of 100, 200, or 400
- **THEN** the value SHALL be written to `identity_tweet_count` for that user
- **AND** a value outside {100, 200, 400} SHALL be rejected without changing the stored value

### Requirement: Identity depth selector in settings
The system SHALL provide an identity analysis depth selector on the Settings → Skills & Identity sub-page, showing the current depth and offering the presets 100 / 200 / 400. The selector SHALL be fully localized in English and Hebrew.

#### Scenario: Skills sub-page shows current depth
- **WHEN** the user opens Settings → Skills & Identity
- **THEN** the page SHALL display the current identity analysis depth
- **AND** a button SHALL be available to change it (callback `view:identity_depth_select`)

#### Scenario: Depth selector shows presets with current highlighted
- **WHEN** the user taps the depth button
- **THEN** a selector SHALL show options 100, 200, 400
- **AND** the currently configured value SHALL be visually marked as selected
- **AND** each option SHALL use callback `config:identity_depth:<N>`

#### Scenario: Selecting a depth saves and returns to Skills sub-page
- **WHEN** the user selects a depth option
- **THEN** the depth SHALL be saved for that user
- **AND** the Skills & Identity sub-page SHALL be re-rendered showing the new depth

#### Scenario: Depth selector renders in Hebrew
- **WHEN** the user's language is Hebrew
- **THEN** the depth setting label, description, and selector SHALL render in Hebrew

### Requirement: Identity depth selector in onboarding
The onboarding identity step SHALL present the identity analysis depth selector (presets 100 / 200 / 400) with the current selection highlighted, before the "Understand Me" analyze action. Selecting a depth SHALL persist to the shared `identity_tweet_count` setting and re-render the step with the new selection highlighted. The step's cost/duration line SHALL reflect the selected count. The selector SHALL be fully localized in English and Hebrew.

#### Scenario: Identity step shows depth selector defaulting to 200
- **WHEN** onboarding advances to the identity step
- **THEN** the step SHALL display a 100 / 200 / 400 selector with 200 highlighted by default
- **AND** the analyze ("Understand Me") and "Use default" actions SHALL remain available

#### Scenario: Selecting a depth during onboarding persists and re-renders
- **WHEN** the user taps a depth option (callback `onboard:identity_depth:<N>`)
- **THEN** the value SHALL be saved to the shared `identity_tweet_count` setting
- **AND** the identity step SHALL re-render with the chosen depth highlighted

#### Scenario: Cost line reflects the selected depth
- **WHEN** the identity step is rendered with a selected depth
- **THEN** the cost/transparency line SHALL state the selected number of posts (not a hardcoded count)

#### Scenario: Larger depth surfaces a duration hint
- **WHEN** the selected depth is 200 or 400
- **THEN** the step SHALL indicate the analysis may take a bit longer

#### Scenario: Onboarding depth selector renders in Hebrew
- **WHEN** the user's onboarding language is Hebrew
- **THEN** the depth selector and its labels SHALL render in Hebrew

### Requirement: Configured depth drives identity analysis volume
The identity analysis SHALL fetch up to the user's configured `identity_tweet_count` recent posts. Because all entry points run through the same analysis service, changing the depth in either onboarding or settings SHALL apply to every subsequent identity analysis and re-analysis for that user.

#### Scenario: Settings change affects later re-analysis
- **WHEN** a user sets depth to 400 in settings and later triggers re-analysis
- **THEN** the re-analysis SHALL fetch up to 400 recent posts

#### Scenario: Onboarding selection affects the onboarding analysis
- **WHEN** a user selects depth 400 on the onboarding identity step and clicks Understand Me
- **THEN** the onboarding identity analysis SHALL fetch up to 400 recent posts

