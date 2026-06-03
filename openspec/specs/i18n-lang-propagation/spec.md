## Purpose

Ensures the user's selected language flows through every code path that produces user-facing text — render functions, input handlers, inline action results, cron notifications, and GitHub webhook notifications — so that views, errors, and notifications consistently render in the user's language rather than defaulting to English.

## Requirements

### Requirement: All render calls pass user language
Every call to a render function (`renderHome`, `renderError`, `renderSuccess`, `renderDraftsList`, `renderDraftDetail`, `renderAccountDetail`, `renderRepoDetail`, `renderCompose`, `renderDraftCategories`, etc.) across action files, input handlers, handlers, and router SHALL include the user's `lang` parameter.

#### Scenario: Pagination preserves language
- **WHEN** a Hebrew user navigates to the next page of drafts/repos/accounts
- **THEN** the paginated view renders in Hebrew

#### Scenario: Action result preserves language
- **WHEN** a Hebrew user approves, publishes, deletes, or schedules a draft
- **THEN** the resulting view (success, error, or detail) renders in Hebrew

#### Scenario: Error fallback preserves language
- **WHEN** an error occurs in any handler (message, callback, cron)
- **THEN** the error view renders in the user's language

### Requirement: Input handlers receive user language
The message handler SHALL pass `lang` to all input handler invocations (commit_sha, schedule, delete, add_repo, edit_draft, handwrite, add_account, repost_url, etc.).

#### Scenario: Handwrite compose in Hebrew
- **WHEN** a Hebrew user enters handwrite compose mode
- **THEN** the compose view and its cancel button render in Hebrew

#### Scenario: Add repo input in Hebrew
- **WHEN** a Hebrew user submits a repo name during the add-repo flow
- **THEN** any resulting error or success view renders in Hebrew

### Requirement: Inline action ViewResults use i18n
All inline `ViewResult` objects built in action files SHALL use `t(lang, key)` for user-facing text instead of hardcoded English strings.

#### Scenario: Schedule day picker in Hebrew
- **WHEN** a Hebrew user opens the schedule day picker
- **THEN** day names, month names, "Today", "Tomorrow", and all labels render in Hebrew

#### Scenario: Repo deleted confirmation in Hebrew
- **WHEN** a Hebrew user confirms repo deletion
- **THEN** the success message renders in Hebrew

### Requirement: Cron notifications respect user language
The cron handler SHALL fetch `getUserLanguage()` for each user before sending notifications, and all notification text SHALL use `t(lang, key)`.

#### Scenario: Scheduled post published notification
- **WHEN** a scheduled post is published for a Hebrew user
- **THEN** the Telegram notification renders in Hebrew

### Requirement: Webhook notifications respect user language
The GitHub webhook `sendNotification()` function SHALL use the repo owner's language preference for notification text.

#### Scenario: Auto-generated PR notification
- **WHEN** a merged PR triggers auto-generation for a Hebrew user
- **THEN** the Telegram notification renders in Hebrew
