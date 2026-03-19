## ADDED Requirements

### Requirement: Scoring reason threaded to quote generation
The scoring `relevance_reason` SHALL be passed through the repost generation pipeline as internal AI context. When `generateRepostContent()` is called for a tweet that has a `relevance_reason`, that reason SHALL be included in the user prompt sent to the quote skill so Gemini receives the emotional entry point.

#### Scenario: Tweet with scoring reason generates quote
- **WHEN** a tweet with `relevance_reason = "challenges my assumption about scaling — I have a counterexample"` is sent to generation
- **THEN** the user prompt SHALL include a self-addressed section: `WHAT CAUGHT MY ATTENTION:` followed by the reason text
- **AND** the quote skill SHALL use this context to inform its reaction

#### Scenario: Tweet without scoring reason generates quote
- **WHEN** a tweet without `relevance_reason` (null) is sent to generation (e.g., manual repost from URL)
- **THEN** the user prompt SHALL NOT include the attention section
- **AND** generation SHALL proceed normally without the context

### Requirement: Author persona injected into scoring batch
The scoring pipeline SHALL load `TwitterAccountOverview.persona` for each unique `account_id` in the tweet batch before calling Gemini. The persona text SHALL be included alongside each tweet in the scoring user prompt so the "Author Context" evaluation channel can function.

#### Scenario: Batch with known authors
- **WHEN** a batch contains 5 tweets from 3 accounts, and 2 accounts have persona data
- **THEN** the scoring user prompt SHALL include persona text for the 2 known authors alongside their tweets
- **AND** tweets from the unknown author SHALL be presented without persona context

#### Scenario: Batch with no known authors
- **WHEN** a batch contains tweets only from accounts without persona data
- **THEN** scoring SHALL proceed normally without persona context (graceful degradation)

### Requirement: No forced character limit on scoring reason
The `what-i-like` skill SHALL NOT enforce a character limit on the `reason` field. The "one sentence" constraint SHALL remain as natural guidance, but the explicit "max 120 characters" instruction SHALL be removed from both EN and HE skill texts.

#### Scenario: AI generates natural-length reason
- **WHEN** the scoring skill produces a reason
- **THEN** the reason SHALL be a single sentence of natural length without artificial truncation

### Requirement: Score-band vision documented as TODO
Files that handle score-based behavior (`auto-approve.ts`, `batch-notification.ts`) SHALL include implementation notes documenting the score-band vision for future work. Notes SHALL reference the `what-i-like` skill's behavioral mapping and cross-reference related files.

#### Scenario: Auto-approve file has score-band notes
- **WHEN** a developer reads `auto-approve.ts`
- **THEN** they SHALL find implementation notes describing future score-band auto-approve behavior (e.g., 9-10 auto-approve, 7-8 notify) with references to `batch-notification.ts` and `what-i-like.ts`

#### Scenario: Batch notification file has score-band notes
- **WHEN** a developer reads `batch-notification.ts`
- **THEN** they SHALL find implementation notes describing future notification priority tiers with references to `auto-approve.ts` and `what-i-like.ts`
