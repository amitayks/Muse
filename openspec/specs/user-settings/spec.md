### Requirement: Settings button on dashboard
The home dashboard SHALL include a "Settings" button that navigates to the settings view.

#### Scenario: User opens settings from dashboard
- **WHEN** user clicks the "Settings" button on the home dashboard
- **THEN** the bot displays the settings view showing current timezone

### Requirement: Settings view displays current timezone
The settings view SHALL display the user's current timezone, page size, language preference, system prompts button (with stale badge when applicable), default publish targets button, repost defaults section, and API key connection status. It SHALL NOT display video settings (those are in Video Studio). It SHALL include an API Keys management section. For admin users, a separate admin prompts button SHALL also appear.

#### Scenario: User views settings
- **WHEN** user opens settings
- **THEN** the view shows language, timezone, page size, default publish targets, repost defaults, API Keys section, and a Home button. No video settings button is shown.
- **AND** the language button SHALL display the current language with flag emoji (e.g., `🌐 🇺🇸 English` or `🌐 🇮🇱 עברית`)
- **AND** the default platforms button SHALL display current default targets with emoji badges
- **AND** the repost defaults section SHALL show `[🎨 Fast Image: OFF/ON]` and `[📷 Source Analysis: ON/OFF]` toggles

#### Scenario: User views settings with stale prompts
- **WHEN** user opens settings and has stale custom prompts
- **THEN** the System Prompts button SHALL show a notification badge (e.g., `📝 System Prompts 🔔`)

#### Scenario: User views settings without stale prompts
- **WHEN** user opens settings and has no stale custom prompts
- **THEN** the System Prompts button SHALL appear without a badge

#### Scenario: Admin views settings
- **WHEN** an admin opens settings
- **THEN** an additional "📝 System Prompts (Admin)" button SHALL appear that opens `/app/admin-prompts`
- **AND** the regular "System Prompts" button SHALL also be present (for testing user experience)

#### Scenario: User views API Keys section
- **WHEN** user navigates to API Keys in settings
- **THEN** each service (Gemini, X/Twitter, GitHub, Instagram) shows connected/disconnected status with Update or Connect buttons

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

### Requirement: Timezone selection via presets
When the user clicks "Change Timezone", the bot SHALL present common UTC offset presets as buttons plus an option to type a custom offset.

#### Scenario: User selects a preset timezone
- **WHEN** user clicks "UTC+2" from the preset buttons
- **THEN** the timezone is saved and the settings view refreshes showing "Timezone: UTC+2"

#### Scenario: User types a custom timezone offset
- **WHEN** user is prompted for timezone and types "UTC+5:30"
- **THEN** the timezone is saved and the settings view refreshes showing "Timezone: UTC+5:30"

#### Scenario: User enters invalid timezone format
- **WHEN** user types "Europe/London" or "xyz"
- **THEN** the bot shows an error with format guidance and lets the user retry

### Requirement: Timezone stored per user
The system SHALL store the timezone offset in the `users` table `timezone` column, defaulting to `'UTC'`.

#### Scenario: New user has default timezone
- **WHEN** a new user completes onboarding
- **THEN** their timezone is `'UTC'` by default in the `users` table

### Requirement: Back navigation from settings
The settings view SHALL include a "Back" button returning to the home dashboard.

#### Scenario: User navigates back from settings
- **WHEN** user clicks "Back" on the settings view
- **THEN** the bot returns to the home dashboard

### Requirement: API Keys management in settings
The settings view SHALL include an API Keys section showing connection status for each service (Gemini, X/Twitter, GitHub, Instagram). Connected services show a checkmark and an "Update" button. Disconnected services show an empty indicator and a "Connect" button.

#### Scenario: User with all keys connected
- **WHEN** user opens API Keys settings and has Gemini, X, GitHub, and Instagram keys stored
- **THEN** all four services show as connected with "Update" buttons

#### Scenario: User with partial keys
- **WHEN** user opens API Keys settings and has only Gemini and X keys
- **THEN** Gemini and X show as connected, GitHub and Instagram show as disconnected with "Connect" buttons

### Requirement: Update existing API key
When a user clicks "Update" on a connected service, the system SHALL prompt for a new key, encrypt and store it (replacing the old one), delete the Telegram message, and validate the new key.

#### Scenario: User updates Gemini key
- **WHEN** user clicks "Update" on Gemini and sends a new key
- **THEN** the message is deleted, the new key is encrypted and replaces the old one, and a validation test runs

#### Scenario: Key update validation fails
- **WHEN** user provides an invalid key during update
- **THEN** the old key is preserved, an error is shown, and the user can retry

### Requirement: Connect new API key
When a user clicks "Connect" on a disconnected service, the system SHALL prompt for the key with instructions, following the same flow as onboarding (encrypt, delete message, validate).

#### Scenario: User connects GitHub token after onboarding
- **WHEN** user clicks "Connect" on GitHub in settings and sends a valid token
- **THEN** the token is encrypted, stored, validated, `has_github` set to 1, and settings view refreshes

### Requirement: Default publish targets setting
The settings view SHALL include a "Default Publish Targets" section where users can configure which platforms new drafts default to.

#### Scenario: User opens default targets in settings
- **WHEN** user navigates to Settings
- **THEN** a "🎯 Default Platforms" button SHALL be visible
- **AND** the button label SHALL show current defaults (e.g., "🎯 Default Platforms: 🐦 X")

#### Scenario: Click default platforms shows toggles
- **WHEN** user clicks "🎯 Default Platforms"
- **THEN** the button row SHALL be replaced with platform toggle buttons (same UI as per-draft toggles)
- **AND** the toggles SHALL reflect the user's current `default_publish_targets`
- **AND** a "✖ Done" button SHALL return to the normal settings view

#### Scenario: Toggle updates user defaults
- **WHEN** user toggles a platform in the default targets
- **THEN** `users.default_publish_targets` SHALL be updated in the database
- **AND** the toggle buttons SHALL re-render showing the updated state

#### Scenario: Post/Reel mutual exclusivity in defaults
- **WHEN** user enables Instagram Post in defaults and Instagram Reel is currently enabled
- **THEN** Instagram Reel SHALL be automatically disabled (same mutual exclusivity as per-draft)

#### Scenario: Instagram options hidden when not configured
- **WHEN** user opens default platforms settings and `has_instagram = 0`
- **THEN** only the X toggle SHALL be shown
- **AND** no Instagram options SHALL appear

#### Scenario: Instagram options visible with warning when tokens invalid
- **WHEN** user opens default platforms in Settings and Instagram tokens are configured but invalid
- **THEN** the Instagram toggles SHALL be visible with a "(⚠️)" indicator

### Requirement: Default targets stored on user record
The `users` table SHALL have a `default_publish_targets` column (`TEXT DEFAULT '{"x":true}'`) storing the user's default platform selection as JSON.

#### Scenario: New user default
- **WHEN** a new user completes onboarding
- **THEN** `default_publish_targets` SHALL be `'{"x":true}'`

#### Scenario: Read defaults
- **WHEN** `getUser(env, chatId)` is called
- **THEN** the returned user object SHALL include `default_publish_targets` field

### Requirement: Commit default settings on users table
The `users` table SHALL have columns for controlling commit compose and webhook auto-generation defaults.

#### Scenario: commit_fast_image column
- **WHEN** the users table is queried
- **THEN** `commit_fast_image` SHALL be an INTEGER column with DEFAULT 1
- **AND** value 1 means webhook auto-generated drafts include imagePrompt (current behavior)
- **AND** value 0 means webhook auto-generated drafts skip imagePrompt for faster generation

#### Scenario: commit_fast_ai column
- **WHEN** the users table is queried
- **THEN** `commit_fast_ai` SHALL be an INTEGER column with DEFAULT 1
- **AND** value 1 means commit compose defaults `aiRefine` to true
- **AND** value 0 means commit compose defaults `aiRefine` to false

### Requirement: Commit defaults section in settings view
The settings view SHALL include a "Commit Defaults" section with toggle buttons.

#### Scenario: Settings view renders commit defaults
- **WHEN** `renderSettings` is called
- **THEN** the settings message SHALL include a "Commit Defaults" section
- **AND** the section SHALL show: `[Auto Image: ON/OFF]` `[Auto AI: ON/OFF]`
- **AND** the toggle buttons SHALL use callback_data `settings:commit:fast_image` and `settings:commit:fast_ai`

#### Scenario: Toggle commit fast image setting
- **WHEN** user clicks the `[Auto Image]` toggle
- **THEN** `commit_fast_image` SHALL be toggled (0<->1) in the users table
- **AND** the settings view SHALL re-render with updated toggle state

#### Scenario: Toggle commit fast AI setting
- **WHEN** user clicks the `[Auto AI]` toggle
- **THEN** `commit_fast_ai` SHALL be toggled (0<->1) in the users table
- **AND** the settings view SHALL re-render with updated toggle state

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
