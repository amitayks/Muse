# draft-content-language Specification

## Purpose
TBD - created by archiving change refine-draft-language-media. Update Purpose after archive.
## Requirements
### Requirement: Drafts persist their content language
Every draft SHALL store the content language it was authored in, in a nullable `drafts.language` column holding `'en'` or `'he'`. Each draft-creation site SHALL compute the effective language as `langOverride ?? globalLang` (the same value already used for AI generation) and persist it onto the created draft, regardless of whether AI generation/refinement ran at creation time. This applies to the webapp handwrite, commit, and repost creation endpoints and to the Telegram bot handwrite, commit, and repost pen-down creation paths.

#### Scenario: Handwrite compose persists language
- **WHEN** a draft is created via `POST /api/v1/compose` with `options.langOverride = 'he'`
- **THEN** the created draft's `language` SHALL be stored as `'he'`

#### Scenario: Commit generation persists language
- **WHEN** a draft is created via `POST /api/v1/generate` with `options.langOverride = 'he'`
- **THEN** the created draft's `language` SHALL be stored as `'he'`

#### Scenario: Repost creation persists language
- **WHEN** a repost draft is created via `POST /api/v1/repost` with `options.langOverride = 'he'`
- **THEN** the created draft's `language` SHALL be stored as `'he'`

#### Scenario: Language stored even when AI is off
- **WHEN** a handwrite draft is created with `options.aiRefine = false` and `options.langOverride = 'he'`
- **THEN** the created draft's `language` SHALL still be stored as `'he'` (the value is persisted independently of AI refinement)

#### Scenario: No override falls back to the user's global language
- **WHEN** a draft is created with no `langOverride` and the user's global `users.language` is `'en'`
- **THEN** the created draft's `language` SHALL be stored as `'en'`

#### Scenario: Telegram bot pen-down persists language
- **WHEN** a draft is created from a Telegram compose session (handwrite, commit, or repost) whose effective language is `'he'`
- **THEN** the created draft's `language` SHALL be stored as `'he'`

#### Scenario: Column is nullable for legacy drafts
- **WHEN** a draft predates this capability and was created without a stored language
- **THEN** its `language` column SHALL be `NULL` and the system SHALL NOT treat that as an error

### Requirement: AI refine resolves the draft's content language
When refining an existing draft, the system SHALL resolve the refine language from the draft itself, not default to English. Resolution SHALL follow this order: (1) the draft's stored `language`; (2) if `NULL`, a content-detection heuristic that returns `'he'` when the draft text contains any Hebrew-block character; (3) if still unresolved, the user's global `getUserLanguage()`. The resolved language SHALL be passed to the AI refine function so the correct prompt version and `languageDirective` are used.

#### Scenario: Refine uses the draft's stored language
- **WHEN** a draft with `language = 'he'` is refined via `POST /api/v1/drafts/:id/refine`
- **THEN** the AI refine function SHALL be called with language `'he'`
- **AND** the refined output SHALL be in Hebrew

#### Scenario: Hebrew draft no longer flips to English
- **WHEN** a Hebrew draft with a Hebrew instruction is refined
- **THEN** the output SHALL remain in Hebrew (the previous English-default behavior SHALL NOT occur)

#### Scenario: Legacy NULL-language Hebrew draft detected from content
- **WHEN** a draft has `language = NULL` and its tweet text contains Hebrew-block characters
- **THEN** the refine language SHALL resolve to `'he'` via content detection

#### Scenario: Legacy NULL-language draft with no Hebrew signal
- **WHEN** a draft has `language = NULL` and its tweet text contains no Hebrew-block characters
- **THEN** the refine language SHALL resolve to the user's global `getUserLanguage()` value

#### Scenario: Webapp no longer needs to send language on refine
- **WHEN** the webapp calls `POST /api/v1/drafts/:id/refine` with only `{ instruction }` (no language field)
- **THEN** the server SHALL still refine in the draft's correct language by resolving it server-side

