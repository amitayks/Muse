## MODIFIED Requirements

### Requirement: Settings view displays current timezone
The settings view SHALL display the user's current timezone, page size, language preference, and API key connection status. It SHALL NOT display video settings (those are in Video Studio). It SHALL include an API Keys management section.

#### Scenario: User views settings
- **WHEN** user opens settings
- **THEN** the view shows language, timezone, page size, API Keys section, and a Home button. No video settings button is shown.
- **AND** the language button SHALL display the current language with flag emoji (e.g., `🌐 🇺🇸 English` or `🌐 🇮🇱 עברית`)

#### Scenario: User views API Keys section
- **WHEN** user navigates to API Keys in settings
- **THEN** each service (Gemini, X/Twitter, GitHub, HeyGen) shows connected/disconnected status with Update or Connect buttons

## ADDED Requirements

### Requirement: Language picker in settings
The settings view SHALL include a language toggle button that cycles between English and Hebrew. Tapping the button SHALL immediately update the user's language and re-render the settings view in the new language.

#### Scenario: Switch from English to Hebrew
- **WHEN** user taps the language button while in English
- **THEN** `user.language` SHALL be updated to `'he'` in the database
- **AND** the settings view SHALL re-render entirely in Hebrew

#### Scenario: Switch from Hebrew to English
- **WHEN** user taps the language button while in Hebrew
- **THEN** `user.language` SHALL be updated to `'en'` in the database
- **AND** the settings view SHALL re-render entirely in English

#### Scenario: Language persists across sessions
- **WHEN** a user sets their language to Hebrew and later returns to the bot
- **THEN** the bot SHALL display in Hebrew from the first interaction

### Requirement: Language stored per user
The `users` table SHALL have a `language` column of type `TEXT` with default value `'en'`. Valid values are `'en'` and `'he'`.

#### Scenario: New user default language
- **WHEN** a new user completes onboarding
- **THEN** their language is `'en'` by default in the `users` table

#### Scenario: Language column in user record
- **WHEN** `getUser(env, chatId)` is called
- **THEN** the returned user object SHALL include the `language` field
