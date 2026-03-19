## ADDED Requirements

### Requirement: Commit compose mode lifecycle
The system SHALL provide a compose mode for commit-based content where users can view source commit/PR context, optionally add their own tweets as initial thoughts, set instructions, and control AI/image generation before finalizing.

#### Scenario: Enter commit compose via `/generate` with SHA
- **WHEN** user sends `/generate abc1234` or sends a commit SHA while `awaiting_input === 'commit_sha'`
- **THEN** the bot SHALL fetch the content source from GitHub via `getContentSource`
- **AND** build a `ComposeSourceCommit` from the fetched data (type, repo, title, commitMessages, fileNames, stats)
- **AND** call `enterComposeMode` with `mode: 'commit'`, `sourceCommit` set, `aiRefine: true`, `imageGen: true`
- **AND** the user SHALL see the compose view with source commit header

#### Scenario: Commit compose default toggles
- **WHEN** entering commit compose mode
- **THEN** `ComposeState.aiRefine` SHALL default to `true`
- **AND** `ComposeState.imageGen` SHALL default to `true`
- **AND** these defaults MAY be overridden by user settings (`commit_fast_ai`, `commit_fast_image`)

#### Scenario: Duplicate detection in commit compose
- **WHEN** a draft already exists for the given `commit_sha`
- **THEN** the compose view SHALL show a warning banner
- **AND** a `[View Existing]` button SHALL be added to the keyboard
- **AND** the user MAY still proceed with compose (creating a second draft)

### Requirement: Source commit header in compose view
The compose preview SHALL display a header section when `sourceCommit` is present, showing the commit/PR context above the tweet buffer.

#### Scenario: PR source commit header
- **WHEN** `sourceCommit.type === 'pr'` and `sourceCommit.prNumber` is set
- **THEN** the header SHALL show: `📌 {repoShort} | {title}`
- **AND** a stats line: `{commitMessages.length} commits · {filesChanged} files · +{additions} / -{deletions}`
- **AND** a separator line below the header

#### Scenario: Push source commit header
- **WHEN** `sourceCommit.type === 'commit'`
- **THEN** the header SHALL show: `📌 {repoShort} | {title}`
- **AND** a stats line: `{commitMessages.length} commits · {filesChanged} files`
- **AND** a separator line below the header

#### Scenario: Commit compose empty state instructions
- **WHEN** no tweets are buffered in commit compose mode
- **THEN** the empty state text SHALL show: "Add your own tweets, attach images, or tap Pen Down to generate from this change."

### Requirement: Pen down in commit mode with AI on and no user tweets
When pen down is triggered in commit mode with AI enabled and no user tweets buffered, the system SHALL generate content from the commit source using the `work-progress` skill.

#### Scenario: Generate from commit source only
- **WHEN** user clicks Pen Down in commit compose with `aiRefine: true` and zero tweets buffered
- **THEN** the system SHALL call `generateContent` with the stored `ContentSource` (built from `sourceCommit`), optional repo overview, optional instruction
- **AND** the system prompt SHALL use `assembleSystemInstruction(env, chatId, 'work-progress', lang)`
- **AND** the response SHALL include `imagePrompt` when `imageGen: true`
- **AND** a draft SHALL be created with `source: 'commit'`, `pr_number`, `pr_title`, `commit_sha` from the source commit

### Requirement: Pen down in commit mode with AI on and user tweets
When pen down is triggered with AI enabled and user tweets buffered, the system SHALL generate content using the `work-progress` skill with the user's tweets as "initial thoughts".

#### Scenario: Generate with initial thoughts
- **WHEN** user clicks Pen Down in commit compose with `aiRefine: true` and 1+ tweets buffered
- **THEN** the system SHALL call `generateContent` with `options.userTweets` containing the user's tweet texts
- **AND** the user prompt SHALL include a "MY INITIAL THOUGHTS" section with the user's tweets
- **AND** the AI MAY reshape, expand, or reimagine the user's input through the `work-progress` skill lens
- **AND** user-attached images SHALL be re-attached to the generated draft content

#### Scenario: Generate with instruction
- **WHEN** user clicks Pen Down in commit compose with `aiRefine: true` and `instruction` set
- **THEN** the user prompt SHALL include a "WHAT I'M GOING FOR" section with the instruction text
- **AND** the instruction SHALL guide the AI's angle on the commit content

### Requirement: Pen down in commit mode with AI off
When pen down is triggered with AI disabled, the user's tweets SHALL be saved directly as a draft.

#### Scenario: Save user tweets directly
- **WHEN** user clicks Pen Down in commit compose with `aiRefine: false` and 1+ tweets buffered
- **THEN** a draft SHALL be created directly from the user's tweets without AI processing
- **AND** `source` SHALL be `'commit'`
- **AND** `pr_number`, `pr_title`, `commit_sha` SHALL be set from `sourceCommit`

#### Scenario: No content to save
- **WHEN** user clicks Pen Down in commit compose with `aiRefine: false` and zero tweets
- **THEN** the bot SHALL remain in compose mode and re-render the compose view

### Requirement: ComposeSourceCommit type definition
The system SHALL define `ComposeSourceCommit` for carrying commit/PR metadata through the compose session.

#### Scenario: ComposeSourceCommit stored in ComposeState
- **WHEN** commit compose mode is active
- **THEN** `ComposeState.sourceCommit` SHALL have fields: `type: 'pr' | 'commit'`, `repo: string`, `repoShort: string`, optional `repoId: string`, `title: string`, optional `prNumber: number`, `commitSha: string`, `commitMessages: string[]`, `fileNames: string[]`, `filesChanged: number`, `additions: number`, `deletions: number`, `author: string`

### Requirement: Image generation in commit compose follows identity-aware pattern
Image prompt generation in commit mode SHALL use the AI skill + identity system, not standalone image calls.

#### Scenario: Image prompt from work-progress skill
- **WHEN** `imageGen: true` and AI generates content from commit source
- **THEN** the `work-progress` skill response SHALL include `imagePrompt` as a structured JSON object
- **AND** the imagePrompt SHALL be stored in `DraftContent` for lazy image generation via `ensureImage`

#### Scenario: Image prompt with user tweets
- **WHEN** `imageGen: true` and user has tweets buffered
- **THEN** `generateContent` SHALL be called with image generation enabled
- **AND** the imagePrompt SHALL reflect both the commit context and the user's tweet content
