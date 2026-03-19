## MODIFIED Requirements

### Requirement: Combined Back and Home buttons in list views
All list views SHALL render the Back and Home buttons in the same inline row instead of separate rows.

#### Scenario: Draft list shows combined navigation row
- **WHEN** a draft list is rendered
- **THEN** the bottom row contains `[◀️ Back] [🏠 Home]` in a single row

#### Scenario: Empty draft list shows combined navigation row
- **WHEN** an empty draft list is rendered
- **THEN** the bottom row contains `[◀️ Back] [🏠 Home]` in a single row

#### Scenario: Draft categories shows combined navigation row
- **WHEN** the draft categories view is rendered (empty state)
- **THEN** the bottom row contains `[◀️ Back] [🏠 Home]` or just `[🏠 Home]` in a single row

### Requirement: Auto-generated draft title shows repo name and tweet content
In list views, auto-generated drafts SHALL display the repo short name followed by the first tweet's text content, instead of `PR #N — commit message`.

#### Scenario: Auto-draft with repo name stored shows new format
- **WHEN** an auto-generated draft is displayed in a list
- **AND** the `pr_title` contains a ` | ` separator (new format: `repoName | originalTitle`)
- **THEN** the button label shows `📝 repoShort — tweet-preview...`
- **AND** `repoShort` is the repo name truncated to 10 characters
- **AND** `tweet-preview` is the first tweet text from parsed `content` JSON, truncated

#### Scenario: Old auto-draft without repo name falls back
- **WHEN** an auto-generated draft is displayed in a list
- **AND** the `pr_title` does NOT contain a ` | ` separator
- **THEN** the button label falls back to current format using `pr_title` as-is

#### Scenario: Repo name stored at webhook creation time
- **WHEN** a draft is created via GitHub webhook
- **THEN** `pr_title` is stored as `repoShortName | originalTitle`
- **AND** `repoShortName` is the repo part of `owner/repo`

#### Scenario: Repo name stored at generate command creation time
- **WHEN** a draft is created via `/generate` command
- **THEN** `pr_title` is stored as `repoShortName | originalTitle`
