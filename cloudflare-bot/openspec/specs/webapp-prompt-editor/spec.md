### Requirement: Prompt editor shows stale warning
The user prompt editor WebApp SHALL detect stale prompts when loading a tab and display a warning banner with action options.

#### Scenario: Loading stale prompt
- **WHEN** the editor loads a prompt where `isStale: true` from the API response
- **THEN** a warning banner SHALL appear above the textarea with "New default available" message
- **AND** action buttons: [View Default], [Update to New], [Keep Mine]

#### Scenario: Loading non-stale prompt
- **WHEN** the editor loads a prompt where `isStale: false`
- **THEN** no warning banner SHALL appear

#### Scenario: After acknowledging stale prompt
- **WHEN** the user clicks [Keep Mine] and switches to another tab then back
- **THEN** the warning banner SHALL NOT reappear (based_on_version was updated)
