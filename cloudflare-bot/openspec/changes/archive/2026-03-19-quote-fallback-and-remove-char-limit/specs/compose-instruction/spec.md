## MODIFIED Requirements

### Requirement: Remove character limit warnings from compose UI
The compose preview and draft detail views SHALL NOT display 280-char warnings or counters.

#### Scenario: Compose preview
- **WHEN** the user is composing a tweet (handwrite or any mode)
- **THEN** the UI SHALL NOT show "X/280" character counters
- **AND** the UI SHALL NOT show warnings about exceeding 280 characters

#### Scenario: Draft detail view
- **WHEN** the user views a draft's tweet content
- **THEN** the UI SHALL NOT display "(N/280)" character counts next to tweets
