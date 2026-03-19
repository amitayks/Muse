## MODIFIED Requirements

### Requirement: Only commit messages and file names are sent to Grok
The `buildContentPrompt()` function SHALL send commit messages, file names, AND the repo overview (if available) to Gemini. It SHALL NOT send PR title, PR body/description, author, stats (additions/deletions/files_changed), or any other metadata. The repo overview is fetched from the `repo_overviews` table and included as structured project context.

#### Scenario: PR content prompt includes repo overview
- **WHEN** `buildContentPrompt()` is called with a PR ContentSource and the repo has an overview
- **THEN** the prompt SHALL contain the repo overview (summary, tech_stack, key_features, target_audience, brand_voice, visual_theme), followed by the list of commit messages and file names

#### Scenario: PR content prompt without repo overview
- **WHEN** `buildContentPrompt()` is called with a PR ContentSource and the repo has no overview
- **THEN** the prompt SHALL contain only the list of commit messages and file names (current behavior preserved)

#### Scenario: Commit content prompt includes repo overview
- **WHEN** `buildContentPrompt()` is called with a commit ContentSource and the repo has an overview
- **THEN** the prompt SHALL contain the repo overview, followed by the commit messages and file names

#### Scenario: buildContentPrompt receives repoId parameter
- **WHEN** `buildContentPrompt()` is called
- **THEN** it SHALL accept a `repoId` parameter to look up the overview
- **AND** the overview lookup SHALL NOT block or fail the prompt if the overview is missing

## ADDED Requirements

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
