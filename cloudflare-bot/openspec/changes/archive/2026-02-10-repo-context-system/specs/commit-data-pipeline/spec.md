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
