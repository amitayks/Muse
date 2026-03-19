## MODIFIED Requirements

### Requirement: Remove character truncation from video tweet captions
When publishing a video to X, the system SHALL NOT truncate the tweet caption to 280 characters.

#### Scenario: Video publish to X
- **WHEN** the system publishes a video draft to X
- **THEN** the tweet caption SHALL be posted at full length without truncation
