## ADDED Requirements

### Requirement: String registry with English translations
The system SHALL provide a `ui/strings/en.ts` module exporting an object with all user-facing strings organized by domain (common, home, settings, repos, accounts, drafts, onboarding, repost, video, errors).

#### Scenario: English string resolution
- **WHEN** `t('en', 'common.home')` is called
- **THEN** it SHALL return `'🏠 Home'`

#### Scenario: All strings covered
- **WHEN** any view or component renders user-facing text
- **THEN** every displayed string SHALL have a corresponding key in the English string registry

### Requirement: String registry with Hebrew translations
The system SHALL provide a `ui/strings/he.ts` module exporting an object with the same structure and keys as `en.ts`, containing native Hebrew translations for all user-facing strings.

#### Scenario: Hebrew string resolution
- **WHEN** `t('he', 'common.home')` is called
- **THEN** it SHALL return the Hebrew equivalent (e.g., `'🏠 בית'`)

#### Scenario: Structure matches English
- **WHEN** the Hebrew string registry is compared to the English registry
- **THEN** every key present in `en.ts` SHALL also be present in `he.ts`

### Requirement: Translation function with fallback
The system SHALL provide a `t(lang: Lang, key: string): string` function in `ui/strings/index.ts` that resolves a dot-path key to a string for the given language.

#### Scenario: Valid key in target language
- **WHEN** `t('he', 'settings.title')` is called and the Hebrew translation exists
- **THEN** it SHALL return the Hebrew string

#### Scenario: Missing key falls back to English
- **WHEN** `t('he', 'some.key')` is called and the Hebrew translation is missing
- **THEN** it SHALL fall back to the English string for that key

#### Scenario: Missing key in both languages
- **WHEN** `t('en', 'nonexistent.key')` is called and the key doesn't exist
- **THEN** it SHALL return the key string itself (`'nonexistent.key'`) as a visible bug indicator

### Requirement: Lang type definition
The system SHALL export a `Lang` type defined as `'en' | 'he'` from `ui/strings/index.ts`.

#### Scenario: Type usage
- **WHEN** a function accepts a language parameter
- **THEN** it SHALL use the `Lang` type for type safety
