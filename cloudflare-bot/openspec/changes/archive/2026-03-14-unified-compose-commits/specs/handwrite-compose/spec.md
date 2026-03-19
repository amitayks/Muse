## MODIFIED Requirements

### Requirement: ComposeState mode type widened
The `ComposeState.mode` field SHALL accept `'commit'` in addition to existing `'handwrite'` and `'repost'` values.

#### Scenario: ComposeState with commit mode
- **WHEN** commit compose mode is active
- **THEN** `ComposeState.mode` SHALL be `'commit'`
- **AND** `ComposeState.sourceCommit` SHALL contain `ComposeSourceCommit` data
- **AND** all existing compose behaviors (toggle buttons, message buffering, instruction capture, cancel) SHALL work identically to handwrite and repost modes

### Requirement: renderCompose extended with commit header
The `renderCompose` function SHALL render a source commit header when `ComposeOptions.sourceCommit` is present.

#### Scenario: Compose view with source commit
- **WHEN** `ComposeOptions.sourceCommit` is provided
- **THEN** the compose message SHALL display a pinned header with repo name, title, commit count, file count, and optional additions/deletions
- **AND** a separator SHALL appear between the header and the tweet buffer area

### Requirement: enterComposeMode supports commit mode
The `enterComposeMode` function SHALL accept `mode: 'commit'` with `sourceCommit` context.

#### Scenario: Enter compose for commit
- **WHEN** `enterComposeMode` is called with `mode: 'commit'`
- **THEN** `ComposeState.aiRefine` SHALL default to `true`
- **AND** `ComposeState.imageGen` SHALL default to `true`
- **AND** `ComposeState.sourceCommit` SHALL be set from options
- **AND** `renderCompose` SHALL be called with `sourceCommit` in options

### Requirement: Pen down handler branches for commit mode
The `handlePenDown` function SHALL branch on `compose.mode === 'commit'` for commit-specific generation logic.

#### Scenario: Pen down dispatches to commit handler
- **WHEN** pen down is triggered and `compose.mode === 'commit'`
- **THEN** the handler SHALL call `handleCommitPenDown` which uses the `work-progress` skill for AI generation
- **AND** draft creation SHALL use `source: 'commit'` with commit metadata (`pr_number`, `pr_title`, `commit_sha`)

### Requirement: ComposeOptions extended with sourceCommit
The `ComposeOptions` interface SHALL include an optional `sourceCommit` field for passing commit context to `renderCompose`.

#### Scenario: ComposeOptions type
- **WHEN** building compose view for commit mode
- **THEN** `ComposeOptions` SHALL accept `sourceCommit?: ComposeSourceCommit`
- **AND** the field SHALL be passed through from `buildComposeView` helper
