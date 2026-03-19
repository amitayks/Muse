## ADDED Requirements

### Requirement: Publish action returns draft detail for inline transition
After publishing a draft via the publish action handler, the system SHALL return `renderDraftDetail()` instead of `renderSuccess()`, so the user sees the published state with the tweet URL inline.

#### Scenario: Manual publish shows result inline
- **WHEN** user clicks "Publish Now" and the publish succeeds
- **THEN** the action SHALL return `renderDraftDetail()` for the published draft
- **AND** the published detail SHALL include the tweet URL

#### Scenario: Manual publish failure shows error inline
- **WHEN** user clicks "Publish Now" and the publish fails
- **THEN** the action SHALL return `renderError()` with a retry suggestion
