## MODIFIED Requirements

### Requirement: Commit defaults applied to fast generation and compose entry
The commit default settings SHALL affect both the `fastCommitAction` fast generation behavior and compose mode entry defaults.

#### Scenario: Fast generation respects commit_fast_image
- **WHEN** user clicks `[⚡ Fast]` on a commit event notification
- **THEN** `fastCommitAction` SHALL read `getCommitDefaults(env, chatId)`
- **AND** if `commitFastImage` is `false`, `generateContent` SHALL be called with `{ generateImagePrompt: false }`
- **AND** if `commitFastImage` is `true`, `generateContent` SHALL be called with image generation enabled
- **AND** lazy image generation via `ensureImage` SHALL only be called when `commitFastImage` is `true`

#### Scenario: Fast generation respects commit_fast_ai
- **WHEN** user clicks `[⚡ Fast]` on a commit event notification
- **THEN** `fastCommitAction` SHALL always generate with AI (Fast = auto-generate)
- **AND** the `commit_fast_ai` setting SHALL NOT affect fast generation (it always uses AI)
- **AND** `commit_fast_ai` only affects the compose mode default toggle state

#### Scenario: Compose entry respects commit_fast_ai
- **WHEN** user enters commit compose mode via `[✏️ Edit]`
- **THEN** `ComposeState.aiRefine` SHALL be initialized from the user's `commit_fast_ai` setting

#### Scenario: Compose entry respects commit_fast_image
- **WHEN** user enters commit compose mode via `[✏️ Edit]`
- **THEN** `ComposeState.imageGen` SHALL be initialized from the user's `commit_fast_image` setting
