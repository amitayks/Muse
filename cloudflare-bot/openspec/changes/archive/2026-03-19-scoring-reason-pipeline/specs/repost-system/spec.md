## MODIFIED Requirements

### Requirement: AI generation with context
The system SHALL generate a quote-tweet draft using the `/quote` skill, with the user's full Identity Document injected into the system instruction. If the quoted author is a followed account with an existing persona, the persona SHALL be included. The selected tone SHALL influence HOW the user reacts, not WHO they are — identity always takes precedence over tone setting. If a `relevance_reason` exists for the tweet (from prior scoring), it SHALL be included in the user prompt as self-addressed context so the quote skill receives the emotional entry point.

#### Scenario: Generation for followed account with persona
- **WHEN** user clicks Generate for a tweet from a followed account that has a persona overview
- **THEN** bot uses the user's identity (as self) + the stored persona overview (as other), generates content framed as personal reaction, creates a draft with source='repost', and shows the draft detail

#### Scenario: Generation for unknown account
- **WHEN** user clicks Generate for a tweet from an account not being followed
- **THEN** bot generates content using the user's identity + the tweet content ONLY — no persona is fetched or created for the unknown account

#### Scenario: Generation with scoring reason
- **WHEN** user generates a quote for a tweet that has `relevance_reason` from prior scoring
- **THEN** the user prompt SHALL include the reason as self-addressed context (e.g., "WHAT CAUGHT MY ATTENTION: ...")
- **AND** the quote skill SHALL use this to inform its reaction rather than re-analyzing from scratch

#### Scenario: Generation without scoring reason
- **WHEN** user generates a quote for a tweet without `relevance_reason` (e.g., manual URL repost)
- **THEN** generation SHALL proceed without the attention context
