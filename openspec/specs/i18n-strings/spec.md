## Purpose

Provides the localization foundation: English and Hebrew string registries with matching keys organized by domain (including the redesigned onboarding flow), a `Lang` type, and a `t(lang, key)` translation function that resolves dot-path keys and falls back to English (then to the raw key) when a translation is missing.

## Requirements

### Requirement: String registry with English translations
The system SHALL provide a `ui/strings/en.ts` module exporting an object with all user-facing strings organized by domain (common, home, settings, repos, accounts, drafts, onboarding, repost, video, errors). The onboarding section SHALL include keys for the redesigned flow: welcome screen with merged value prop, language toggle labels, feature-unlock framing for each step (X, Identity, Gemini, GitHub), identity cost transparency, identity snippet display, bonus step labeling, and completion screen with unlocked/locked feature summary.

#### Scenario: English string resolution
- **WHEN** `t('en', 'common.home')` is called
- **THEN** it SHALL return `'🏠 Home'`

#### Scenario: Onboarding unlock framing strings exist
- **WHEN** any onboarding view renders a step screen
- **THEN** every displayed string (contextual headers, feature lists, cost lines, button labels) SHALL have a corresponding key in the English string registry under the `onboarding` domain

#### Scenario: Welcome value prop strings exist
- **WHEN** the welcome screen renders
- **THEN** the English string registry SHALL contain keys for the welcome title, merged value prop text (covering Repost, Generate, Handwrite, Follow capabilities), language toggle labels, and the "Let's Go" button

#### Scenario: Removed Learn More strings
- **WHEN** the onboarding string keys are checked
- **THEN** the keys `onboarding.learnTitle`, `onboarding.learnRepost`, `onboarding.learnGenerate`, `onboarding.learnHandwrite`, `onboarding.learnFollow`, `onboarding.learnKeys`, `onboarding.learnSecurity`, and `onboarding.btnLearnMore` SHALL be removed and replaced by new welcome-integrated keys

### Requirement: String registry with Hebrew translations
The system SHALL provide a `ui/strings/he.ts` module exporting an object with the same structure and keys as `en.ts`, containing native Hebrew translations for all user-facing strings including all new and updated onboarding keys.

#### Scenario: Hebrew string resolution
- **WHEN** `t('he', 'common.home')` is called
- **THEN** it SHALL return the Hebrew equivalent (e.g., `'🏠 בית'`)

#### Scenario: Structure matches English for onboarding
- **WHEN** the Hebrew string registry is compared to the English registry
- **THEN** every onboarding key present in `en.ts` (including new unlock framing, identity snippet, bonus labels, and completion feature summary keys) SHALL also be present in `he.ts`

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
