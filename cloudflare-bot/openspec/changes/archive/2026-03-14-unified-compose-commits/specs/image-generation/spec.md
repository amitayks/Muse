## MODIFIED Requirements

### Requirement: Commit compose image generation uses identity-aware AI pattern
Image prompt generation in commit compose mode SHALL use the combined identity + skill system (same as handwrite), not standalone image generation calls.

#### Scenario: Image prompt from work-progress skill response
- **WHEN** commit compose pen down is triggered with `imageGen: true` and `aiRefine: true`
- **THEN** the `work-progress` skill response SHALL include `imagePrompt` as a structured JSON object
- **AND** the imagePrompt SHALL be generated in the same AI call as the tweet content (not a separate call)
- **AND** the imagePrompt SHALL be influenced by the user's identity and the commit context

#### Scenario: Image generation deferred to view time
- **WHEN** a draft is created from commit compose with an `imagePrompt` in DraftContent
- **THEN** the actual image SHALL be generated lazily via `ensureImage` during `finalizeDraft`
- **AND** this SHALL follow the same pattern as handwrite compose image generation

#### Scenario: Commit compose with imageGen off
- **WHEN** `imageGen: false` in commit compose
- **THEN** no `imagePrompt` SHALL be generated
- **AND** the AI call SHALL not include image generation instructions

### Requirement: Webhook auto-generated drafts include imagePrompt from work-progress
The webhook auto-generation flow SHALL continue to include `imagePrompt` in the `work-progress` skill response, with lazy image generation on view.

#### Scenario: Webhook draft with image prompt
- **WHEN** webhook auto-generates a draft
- **THEN** the `generateContent` response SHALL include `imagePrompt` (current behavior preserved)
- **AND** the image SHALL be generated lazily when the user views the draft via `ensureImage`
