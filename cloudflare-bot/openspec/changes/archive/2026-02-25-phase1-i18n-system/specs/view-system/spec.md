## MODIFIED Requirements

### Requirement: All view functions accept language parameter
All render functions in the views directory SHALL accept a `lang: Lang` parameter and use `t(lang, key)` for all user-facing strings. No view function SHALL contain hardcoded English strings.

#### Scenario: Home dashboard in English
- **WHEN** `renderHome(env, chatId, 'en')` is called
- **THEN** all text and button labels SHALL be in English

#### Scenario: Home dashboard in Hebrew
- **WHEN** `renderHome(env, chatId, 'he')` is called
- **THEN** all text and button labels SHALL be in Hebrew

#### Scenario: Component functions receive language
- **WHEN** a shared component from `ui/components.ts` is called
- **THEN** it SHALL accept a `lang: Lang` parameter and resolve its labels via `t(lang, key)`

### Requirement: All view functions preserve exact signatures
Each view function SHALL maintain its current parameters plus an additional `lang: Lang` parameter. Return type (`ViewResult`) SHALL remain unchanged. The rendered content SHALL be identical to the current content when `lang='en'`.

#### Scenario: English rendering unchanged
- **WHEN** any view is rendered with `lang='en'`
- **THEN** the output ViewResult SHALL be identical to the pre-i18n hardcoded English output

### Requirement: Merged repo detail and config view
The `renderRepoDetail()` view SHALL include all configuration toggle buttons inline, replacing the separate `renderRepoConfig()` screen. The language toggle button SHALL NOT be included (language is now a global user setting).

#### Scenario: Repo detail shows config toggles
- **WHEN** a user views a specific repo
- **THEN** they SHALL see config toggles (hashtags, PRs, pushes, thread image, single image probability) as inline buttons
- **AND** there SHALL be NO language toggle button
- **AND** they SHALL see action buttons (stop/start watching, delete)

#### Scenario: Config toggle updates merged view
- **WHEN** a user taps a config toggle button
- **THEN** the config SHALL update and the merged repo detail view SHALL re-render
