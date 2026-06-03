## Purpose

When a user switches language, detects whether they have an analyzed identity in the target language and, if not, sends a one-time notification offering to re-analyze or keep the default. Tracks which languages have been notified via the `identity_lang_notified` column so the prompt appears at most once per language.

## Requirements

### Requirement: Language switch identity detection
When a user switches language via `config:language`, the system SHALL check whether the user has an analyzed identity in the target language. Detection logic: (1) check if ANY `user_prompts` row exists for `(chatId, 'identity', any_language)` — if none, user is on defaults everywhere, no action needed; (2) check if a `user_prompts` row exists for `(chatId, 'identity', targetLang)` — if yes, user has identity in target language, no action needed; (3) otherwise, user has analyzed identity in another language but not this one.

#### Scenario: User with analyzed EN identity switches to HE
- **WHEN** user has `user_prompts(chatId, 'identity', 'en')` but no row for `'he'`, and switches language to Hebrew
- **THEN** the system SHALL detect that identity is missing for Hebrew

#### Scenario: User with defaults everywhere switches language
- **WHEN** user has no `user_prompts` rows for `identity` at all, and switches language
- **THEN** the system SHALL NOT trigger any identity notification

#### Scenario: User with analyzed identity in both languages switches
- **WHEN** user has `user_prompts` rows for `identity` in both `'en'` and `'he'`, and switches language
- **THEN** the system SHALL NOT trigger any identity notification

### Requirement: One-time identity language notification
When the system detects missing identity for the target language (per detection logic above), it SHALL check the `identity_lang_notified` column on the `users` table. If the target language is NOT in the notified list, the system SHALL send a separate notification message with buttons `[Re-analyze]`, `[Keep default]`, and `[Home]`. After sending, the target language SHALL be added to `identity_lang_notified`.

#### Scenario: First time switching to HE without identity
- **WHEN** user switches to Hebrew, has analyzed EN identity, no HE identity, and `identity_lang_notified` does not include `'he'`
- **THEN** the system SHALL send a notification message offering to re-analyze or keep default, and add `'he'` to `identity_lang_notified`

#### Scenario: Second time switching to HE without identity
- **WHEN** user switches to Hebrew again, still no HE identity, but `identity_lang_notified` already includes `'he'`
- **THEN** the system SHALL NOT send any notification

#### Scenario: User clicks Re-analyze on notification
- **WHEN** user clicks `[Re-analyze]` on the identity language notification
- **THEN** the system SHALL run `analyzeIdentity()` for the current language and store the result as `user_prompts(chatId, 'identity', currentLang)`

#### Scenario: User clicks Keep default on notification
- **WHEN** user clicks `[Keep default]` on the identity language notification
- **THEN** the system SHALL dismiss the notification and take no further action — the user continues using the default skeleton for that language

### Requirement: identity_lang_notified column on users table
The `users` table SHALL have an `identity_lang_notified TEXT DEFAULT ''` column storing comma-separated language codes for which the identity language notification has been shown.

#### Scenario: New user has empty notified field
- **WHEN** a new user is created
- **THEN** `identity_lang_notified` SHALL be `''`

#### Scenario: After notification shown for Hebrew
- **WHEN** the identity language notification is shown for Hebrew
- **THEN** `identity_lang_notified` SHALL contain `'he'`
