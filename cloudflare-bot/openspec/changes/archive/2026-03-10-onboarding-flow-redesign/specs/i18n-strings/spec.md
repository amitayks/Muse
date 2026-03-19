## MODIFIED Requirements

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
