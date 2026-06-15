## Purpose

This capability assembles the data sent to the AI for commit/PR-based content. It populates commit messages and changed file names on `PRData` and `CommitData`, restricts `buildContentPrompt` to send only those plus the repo overview (no PR titles, bodies, authors, or stats), and threads optional user thoughts, instructions, and image parts through `buildContentPrompt`/`generateContent`. It also routes `/generate` to create a commit event rather than entering compose, and removes the `codeContext` and `tone` fields from `RepoConfig`.
## Requirements
### Requirement: PRData includes commit messages
The system SHALL populate `PRData.commitMessages` with the FULL commit message of each commit (the complete message, not just the first line) fetched from the GitHub API when assembling PR data — both for PR webhook events and for the manual PR opt-in path.

#### Scenario: PR webhook with multiple commits
- **WHEN** a PR merge webhook is received with 5 commits
- **THEN** the system fetches commit details via `GET /repos/{owner}/{repo}/pulls/{number}/commits` and populates `commitMessages` with all 5 FULL commit messages (subject + body each)

#### Scenario: Manual PR opt-in resolves PR commits
- **WHEN** a user pastes a SHA with PR mode enabled and a PR is found via `getContentSource(env, sha, true)`
- **THEN** `PRData.commitMessages` is populated with the full message of every commit in the PR

### Requirement: PRData includes file names
The system SHALL populate `PRData.fileNames` with the list of all changed file paths fetched from the GitHub API when assembling PR data — both for PR webhook events and for the manual PR opt-in path.

#### Scenario: PR webhook with changed files
- **WHEN** a PR merge webhook is received
- **THEN** the system fetches file list via `GET /repos/{owner}/{repo}/pulls/{number}/files` and populates `fileNames` with all file paths

#### Scenario: Manual PR opt-in resolves PR files
- **WHEN** a user pastes a SHA with PR mode enabled and a PR is found
- **THEN** `PRData.fileNames` is populated with all changed file paths from the PR

### Requirement: CommitData includes commit messages
The system SHALL populate `CommitData.commitMessages` with the commit message(s) extracted from the push webhook payload or fetched from the GitHub API.

#### Scenario: Push webhook with multiple commits
- **WHEN** a push webhook is received with 3 commits
- **THEN** `CommitData.commitMessages` is populated with the first-line message of each commit from `event.commits[].message`

#### Scenario: Manual SHA always builds direct commit data
- **WHEN** a user provides a commit SHA via `getContentSource()` without PR mode
- **THEN** the system SHALL build `CommitData` directly from that single commit without any PR lookup
- **AND** `CommitData.commitMessages` contains the FULL commit message (subject + body)
- **AND** `CommitData.title`/`CommitData.body` hold the first line / remainder for the event title

### Requirement: CommitData includes file names
The system SHALL populate `CommitData.fileNames` with all changed file paths extracted from the webhook payload or fetched from the GitHub API.

#### Scenario: Push webhook extracts file names
- **WHEN** a push webhook is received
- **THEN** `CommitData.fileNames` is populated by combining `added`, `modified`, and `removed` arrays from all commits in the payload, deduplicated

#### Scenario: Manual SHA fetches file names
- **WHEN** a user provides a SHA and commit data is fetched directly
- **THEN** `CommitData.fileNames` is populated from the commit's `files[].filename` array

### Requirement: Only commit messages and file names are sent to Grok
The `buildContentPrompt()` function SHALL send commit messages, file names, AND the repo overview (if available) to Gemini. It SHALL NOT send PR title, PR body/description, author, stats (additions/deletions/files_changed), or any other metadata. The repo overview is fetched from the `repo_overviews` table and included as structured project context.

For a **commit-type** `ContentSource`, the commit section SHALL contain the FULL commit message (subject + body) — sanitized but NOT length-capped. For a **PR-type** `ContentSource`, the commit section SHALL contain the FULL message of every commit in the PR — sanitized but NOT length-capped — so the AI sees all commits written out in full.

#### Scenario: Commit prompt sends the full commit message
- **WHEN** `buildContentPrompt()` is called with a commit-type `ContentSource` whose message has a subject and a multi-line body
- **THEN** the commit section of the prompt SHALL contain both the subject and the full body
- **AND** the message SHALL NOT be truncated to 200 characters

#### Scenario: Commit message is sanitized but not truncated
- **WHEN** `buildContentPrompt()` is called with a commit-type `ContentSource` whose message is very long
- **THEN** the message SHALL be sanitized (control/dangerous characters stripped)
- **AND** the message SHALL NOT be length-capped

#### Scenario: PR prompt sends all commit messages in full
- **WHEN** `buildContentPrompt()` is called with a PR-type `ContentSource` containing multiple commits
- **THEN** the commit section SHALL contain the FULL message of every commit in the PR
- **AND** each message SHALL be sanitized but NOT truncated to 200 characters
- **AND** commit boundaries SHALL remain distinguishable in the rendered prompt

#### Scenario: PR content prompt includes repo overview
- **WHEN** `buildContentPrompt()` is called with a PR ContentSource and the repo has an overview
- **THEN** the prompt SHALL contain the repo overview (summary, tech_stack, key_features, target_audience, brand_voice, visual_theme), followed by the list of full commit messages and file names

#### Scenario: PR content prompt without repo overview
- **WHEN** `buildContentPrompt()` is called with a PR ContentSource and the repo has no overview
- **THEN** the prompt SHALL contain only the list of full commit messages and file names

#### Scenario: Commit content prompt includes repo overview
- **WHEN** `buildContentPrompt()` is called with a commit ContentSource and the repo has an overview
- **THEN** the prompt SHALL contain the repo overview, followed by the (full) commit message and file names

#### Scenario: buildContentPrompt receives repoId parameter
- **WHEN** `buildContentPrompt()` is called
- **THEN** it SHALL accept a `repoId` parameter to look up the overview
- **AND** the overview lookup SHALL NOT block or fail the prompt if the overview is missing

### Requirement: buildContentPrompt accepts optional user context
The `buildContentPrompt` function SHALL accept optional `userTweets` and `instruction` parameters and append corresponding sections to the user prompt when present.

#### Scenario: Prompt with user initial thoughts
- **WHEN** `options.userTweets` is provided and non-empty
- **THEN** the prompt SHALL include a "MY INITIAL THOUGHTS:" section with numbered user tweets
- **AND** the section SHALL appear after the commit/file data and before the language instruction

#### Scenario: Prompt with instruction
- **WHEN** `options.instruction` is provided and non-empty
- **THEN** the prompt SHALL include a "WHAT I'M GOING FOR:" section with the instruction text
- **AND** the section SHALL appear after the initial thoughts section (if present)

#### Scenario: Prompt without user context
- **WHEN** neither `userTweets` nor `instruction` is provided
- **THEN** the prompt SHALL remain identical to the current format (backward compatible)

### Requirement: generateContent accepts optional user context
The `generateContent` function SHALL accept optional parameters for user tweets, instruction, and image parts via an options object.

#### Scenario: Generate with user tweets and instruction
- **WHEN** `generateContent` is called with `options.userTweets` and `options.instruction`
- **THEN** these SHALL be passed through to `buildContentPrompt`
- **AND** the `work-progress` skill SHALL handle the initial thoughts through its "initial thoughts" paragraph

#### Scenario: Generate with user image parts
- **WHEN** `generateContent` is called with `options.userImageParts`
- **THEN** the user prompt SHALL be built as a multimodal prompt with text + image parts
- **AND** the images SHALL be appended after the text prompt for Gemini analysis

#### Scenario: Generate with default options (backward compatible)
- **WHEN** `generateContent` is called without options
- **THEN** behavior SHALL be identical to current implementation

### Requirement: Shared prompt section builder utility
A reusable `buildPromptSections` utility SHALL construct the "MY INITIAL THOUGHTS" and "WHAT I'M GOING FOR" sections from optional parameters.

#### Scenario: Build sections for repost prompt
- **WHEN** `buildPromptSections` is called with `userTweets` and `instruction`
- **THEN** it SHALL return formatted section strings identical to the sections in `buildRepostUserPrompt`

#### Scenario: Build sections for commit prompt
- **WHEN** `buildPromptSections` is called with `userTweets` and `instruction`
- **THEN** it SHALL return the same formatted sections
- **AND** `buildContentPrompt` SHALL use this utility instead of inline formatting

#### Scenario: Build sections with empty inputs
- **WHEN** both `userTweets` and `instruction` are empty/undefined
- **THEN** `buildPromptSections` SHALL return an empty string

### Requirement: generateContent strips imagePrompt when disabled
When `generateImagePrompt` is explicitly set to `false` in the options, `generateContent` SHALL remove the `imagePrompt` field from the generated content after parsing.

#### Scenario: imagePrompt stripped when generateImagePrompt is false
- **WHEN** `generateContent` is called with `options.generateImagePrompt === false`
- **THEN** after `parseContentResponse` returns the content
- **AND** if the content has an `imagePrompt` field (from the model response or fallback)
- **THEN** `imagePrompt` SHALL be deleted from the `DraftContent`
- **AND** the returned `ContentResponse.content` SHALL NOT contain `imagePrompt`

#### Scenario: imagePrompt preserved when generateImagePrompt is true
- **WHEN** `generateContent` is called with `options.generateImagePrompt === true` or without the option
- **THEN** the `imagePrompt` field SHALL remain on the content (existing behavior preserved)

#### Scenario: imagePrompt preserved when no options passed
- **WHEN** `generateContent` is called without an `options` parameter (legacy callers)
- **THEN** the `imagePrompt` field SHALL remain on the content (backward compatible)

### Requirement: /generate command creates commit event instead of entering compose
The `/generate` command flow SHALL create a `commit_events` row and show an event summary with `[⚡ Fast] [✏️ Edit]` buttons, instead of immediately entering compose mode.

#### Scenario: User sends SHA via /generate command
- **WHEN** user sends `/generate abc1234` or sends a commit SHA while `awaiting_input === 'commit_sha'`
- **THEN** the handler SHALL fetch the content source from GitHub via `getContentSource`
- **AND** look up the watched repo by owner/repo to get `repoId`
- **AND** build a `ContentSource` from the fetched data
- **AND** call `createCommitEvent` with the fetched data (same fields as webhook handler)
- **AND** show the event summary message with `[⚡ Fast] [✏️ Edit]` buttons
- **AND** the handler SHALL NOT enter compose mode directly

#### Scenario: Event summary message for /generate
- **WHEN** the commit event is created from `/generate`
- **THEN** the "Generating..." status message SHALL be edited to show the event summary
- **AND** the summary SHALL show: event type emoji, repo, title, author, stats
- **AND** buttons SHALL be `[⚡ Fast] [✏️ Edit]`
- **AND** the `message_id` SHALL be stored on the event for edit-in-place

#### Scenario: Duplicate detection in /generate
- **WHEN** user sends a SHA that already has a `commit_events` row
- **THEN** the existing event SHALL be shown (not a duplicate)
- **AND** if the event already has a `draft_id`, the summary SHALL show `[✅ Generated] [👀 View]` instead

#### Scenario: Fetch failure in /generate
- **WHEN** `getContentSource` fails (GitHub API error, SHA not found)
- **THEN** the "Generating..." message SHALL be edited to show an error
- **AND** the user SHALL be prompted to retry with a different SHA
- **AND** `awaiting_input` SHALL remain `'commit_sha'` for retry

#### Scenario: /generate clears awaiting state after event creation
- **WHEN** the commit event is created and summary is shown
- **THEN** `awaiting_input` SHALL be cleared (set context to null or remove `awaiting_input`)
- **AND** the user SHALL NOT be in input-awaiting state anymore

### Requirement: Remove codeContext from RepoConfig
The system SHALL remove the `codeContext` field from `RepoConfig`, the `CodeContextLevel` type, and all related UI (toggle button in callback handler, display in views).

#### Scenario: Config toggle no longer includes codeContext
- **WHEN** a user views the repo configuration screen
- **THEN** there is no codeContext toggle button or display

### Requirement: Remove tone from RepoConfig
The system SHALL remove the `tone` field from `RepoConfig` and all related UI (toggle button in callback handler, display in views).

#### Scenario: Config toggle no longer includes tone
- **WHEN** a user views the repo configuration screen
- **THEN** there is no tone toggle button or display

### Requirement: Manually pasted commit SHA resolves to a single commit by default
When a commit SHA is supplied through `getContentSource()` (manual paste path) WITHOUT PR mode, the system SHALL build single-commit data for exactly that commit and SHALL NOT expand the SHA to its pull request. After locating the repo via `findCommitBysha`, `getContentSource(env, sha)` (with `preferPr` falsy) SHALL return a `ContentSource` of `type: 'commit'` produced by `buildCommitData`, and SHALL NOT call `findPRForCommit` or `getPR`. This is the default for every caller of `getContentSource` (Telegram `/generate`, webapp compose, scheduled generation, and the test endpoint). The GitHub webhook handler does not use `getContentSource` and is unaffected.

#### Scenario: Pasted SHA (default) whose commit belongs to a merged PR
- **WHEN** a user pastes a commit SHA that belongs to a merged PR containing several other commits, without enabling PR mode
- **THEN** `getContentSource()` SHALL return a `type: 'commit'` `ContentSource` for that single commit
- **AND** it SHALL NOT call `findPRForCommit` or `getPR`
- **AND** the resulting data SHALL describe only the pasted commit, not its sibling commits

#### Scenario: CommitData carries the full single-commit message and files
- **WHEN** `getContentSource()` builds commit data for a pasted SHA via `buildCommitData`
- **THEN** `CommitData.commitMessages` SHALL contain the FULL commit message (subject + body) as a single entry
- **AND** `CommitData.title` SHALL contain the first line and `CommitData.body` the remainder (used for the event title)
- **AND** `CommitData.fileNames` SHALL contain all changed file paths from `GET /repos/{owner}/{repo}/commits/{sha}`
- **AND** no additional GitHub API calls beyond the commit fetch SHALL be required

#### Scenario: Commit event for a default pasted SHA is single-commit shaped
- **WHEN** a `commit_events` row is created from a pasted SHA without PR mode
- **THEN** the event SHALL be `event_type: 'push'` with `commit_count: 1`
- **AND** the stored `sourceData` SHALL be a `type: 'commit'` `ContentSource`

### Requirement: Generate flow offers a PR opt-in
The `/generate` SHA-input prompt SHALL offer a toggle that lets the user opt into treating the pasted SHA as its pull request. When PR mode is enabled, the system SHALL resolve the PR that contains the pasted SHA and generate from ALL of that PR's commits (full messages) instead of the single commit.

#### Scenario: PR toggle on the SHA prompt
- **WHEN** the user opens the `/generate` SHA-input prompt
- **THEN** the prompt SHALL show a PR-mode toggle button in addition to the Cancel button
- **AND** activating it SHALL set `pr_mode` in the chat context and re-render the prompt indicating PR mode is ON
- **AND** deactivating it SHALL clear `pr_mode` and indicate PR mode is OFF

#### Scenario: Pasting a SHA with PR mode enabled
- **WHEN** the user pastes a commit SHA while `pr_mode` is enabled in the chat context
- **THEN** the handler SHALL call `getContentSource(env, sha, true)` (PR preferred)
- **AND** if a PR is found, the resulting `ContentSource` SHALL be `type: 'pr'` containing all of the PR's commits and changed files
- **AND** the created `commit_events` row SHALL be `event_type: 'pr'` with `commit_count` equal to the number of commits in the PR

#### Scenario: PR mode requested but no PR exists
- **WHEN** the user pastes a SHA with PR mode enabled but the commit has no associated merged PR
- **THEN** `getContentSource(env, sha, true)` SHALL fall back to single-commit data (`type: 'commit'`)
- **AND** the flow SHALL still produce a valid single-commit event rather than failing

#### Scenario: getContentSource preferPr resolution order
- **WHEN** `getContentSource(env, sha, true)` is called
- **THEN** it SHALL locate the repo via `findCommitBysha`, then call `findPRForCommit`
- **AND** return `{ type: 'pr', data }` when a PR is found, otherwise `{ type: 'commit', data }`

