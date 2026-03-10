## ADDED Requirements

### Requirement: Onboarding trigger for unregistered users
Any message from an unregistered user (no row in `users` table) SHALL create a `users` row with `status = 'onboarding'` and present the welcome screen.

#### Scenario: New user sends /start
- **WHEN** an unregistered user sends `/start`
- **THEN** a `users` row is created with `status = 'onboarding'` and `onboarding_step = 'welcome'`, and the welcome message is displayed

#### Scenario: New user sends any message
- **WHEN** an unregistered user sends any message (not just /start)
- **THEN** the user enters the onboarding flow the same as if they sent /start

### Requirement: Welcome screen with Get Started
The welcome screen SHALL display a greeting, value proposition (features: Repost, Generate, Handwrite, Follow), a language toggle (English/Hebrew), and a "Let's Go" button. There SHALL NOT be a separate "Learn More" screen. The welcome message SHALL include the value prop content directly. The language toggle SHALL display the currently selected language with a checkmark (✓). Auto-detection: on user creation, the system SHALL read `update.message.from.language_code` and set `users.language` to `'he'` if it equals `'he'`, otherwise `'en'`.

#### Scenario: User sees welcome screen for the first time
- **WHEN** an unregistered user sends any message and their Telegram `language_code` is `'he'`
- **THEN** a user row is created with `language = 'he'`, and the welcome screen renders in Hebrew with `[English] [עברית ✓]` buttons and a `[Let's Go]` button

#### Scenario: User sees welcome screen with English default
- **WHEN** an unregistered user sends any message and their Telegram `language_code` is not `'he'`
- **THEN** a user row is created with `language = 'en'`, and the welcome screen renders in English with `[English ✓] [עברית]` buttons and a `[Let's Go]` button

#### Scenario: User switches language on welcome screen
- **WHEN** user clicks the `[עברית]` button while welcome is displayed in English
- **THEN** `users.language` is updated to `'he'`, and the welcome message is re-rendered (edited in-place) entirely in Hebrew with `[English] [עברית ✓]`

#### Scenario: User switches language back
- **WHEN** user clicks the `[English]` button while welcome is displayed in Hebrew
- **THEN** `users.language` is updated to `'en'`, and the welcome message is re-rendered (edited in-place) entirely in English with `[English ✓] [עברית]`

#### Scenario: User clicks Let's Go
- **WHEN** user clicks "Let's Go" on the welcome screen
- **THEN** the onboarding advances to `onboarding_step = 'x_keys'` and the X/Twitter key prompt is shown with feature-unlock framing

### Requirement: Step 1 — X/Twitter API keys with feature-unlock framing
The X/Twitter step SHALL be the first credential step after welcome. It SHALL display feature-unlock framing showing which features connecting X unlocks (Repost, Handwrite, Follow, Identity analysis). The step SHALL prompt for 4 API values (API_KEY, API_SECRET, ACCESS_TOKEN, ACCESS_SECRET) with the format shown inline in the message body. The step header SHALL use a contextual label (e.g., "Unlock Your Voice") instead of "Step 1/3".

#### Scenario: User sees X step with unlock framing
- **WHEN** onboarding advances to the X/Twitter step
- **THEN** the screen displays a contextual header, a list of locked features that X enables, and inline format instructions for the 4 API values

#### Scenario: User provides valid X keys
- **WHEN** user sends a 4-line message during `onboarding_step = 'x_keys'`
- **THEN** the message is deleted, all 4 values are encrypted and stored separately, a `verifyCredentials()` test call validates them, `has_x` is set to 1, and onboarding advances to `onboarding_step = 'identity'`

#### Scenario: X key message has wrong number of lines
- **WHEN** user sends a message with fewer or more than 4 lines during `onboarding_step = 'x_keys'`
- **THEN** an error message is shown explaining the expected format, and the user can retry

#### Scenario: X key validation fails
- **WHEN** the `verifyCredentials()` test call fails
- **THEN** the encrypted keys are removed, an error message is shown, and the user can retry

#### Scenario: User clicks Skip on X step
- **WHEN** user clicks "Skip" on the X keys step
- **THEN** the system SHALL silently store the default identity via `storeDefaultIdentity()`, skip the identity step entirely, and advance to `onboarding_step = 'gemini_key'`

### Requirement: Step 2 — Identity analysis immediately after X connection
When X is connected, the identity analysis step SHALL be shown immediately after X success. The step SHALL display what the analysis does, list the aspects it examines (writing style, vocabulary, tone, emotional patterns, interests), and show cost transparency indicating the approximate number of tweets and AI calls used. If X was skipped, this step SHALL NOT be shown at all.

#### Scenario: Identity step shown after X connection
- **WHEN** X keys are validated and stored, and onboarding advances to `onboarding_step = 'identity'`
- **THEN** the identity step screen is displayed with analysis description, aspects list, cost transparency line, and buttons for "Analyze" and "Use default"

#### Scenario: User clicks Analyze
- **WHEN** user clicks the analyze button on the identity step
- **THEN** the system shows an "Analyzing..." message, runs `analyzeIdentity()`, and upon success displays the identity success screen with a short snippet (first ~200 chars) of the generated identity document, then advances to `onboarding_step = 'gemini_key'`

#### Scenario: Identity analysis fails
- **WHEN** `analyzeIdentity()` returns null or throws an error
- **THEN** the system stores the default identity, shows a brief failure notice, and advances to `onboarding_step = 'gemini_key'`

#### Scenario: User clicks Use Default on identity step
- **WHEN** user clicks "Use default" on the identity step
- **THEN** the system stores the default identity and advances to `onboarding_step = 'gemini_key'`

#### Scenario: Identity step skipped when X was skipped
- **WHEN** the user skipped the X step
- **THEN** the identity step is never shown; default identity was already stored during X skip, and onboarding advances directly to `onboarding_step = 'gemini_key'`

### Requirement: Step 3 — Gemini API key with feature-unlock framing
The Gemini step SHALL follow identity (or follow X-skip directly). It SHALL display feature-unlock framing showing what connecting Gemini enables (all AI content generation, smart rewriting, identity-aware drafts). The step header SHALL use a contextual label (e.g., "Power Up the AI"). The system SHALL prompt for a Google Gemini API key.

#### Scenario: User sees Gemini step with unlock framing
- **WHEN** onboarding advances to the Gemini step
- **THEN** the screen displays a contextual header, a list of features that Gemini enables, instructions to get a free key, and a paste prompt

#### Scenario: User provides valid Gemini key
- **WHEN** user sends a text message during `onboarding_step = 'gemini_key'`
- **THEN** the message is deleted from Telegram, the key is encrypted and stored in `users.gemini_key_enc`, a test API call validates the key, `has_gemini` is set to 1, and onboarding advances to `onboarding_step = 'github_token'`

#### Scenario: Gemini key validation fails
- **WHEN** the test API call with the provided Gemini key fails
- **THEN** the encrypted key is removed, an error message is shown with guidance, and the user can retry without restarting

#### Scenario: User clicks Skip on Gemini step
- **WHEN** user clicks "Skip for now" on the Gemini key step
- **THEN** onboarding advances to `onboarding_step = 'github_token'` without storing a key, `has_gemini` remains 0

### Requirement: Step 4 — GitHub token as bonus step
The GitHub step SHALL be framed as a "Bonus" step, visually distinct from the previous steps. It SHALL use a contextual label (e.g., "Bonus: Code → Content") and explain it is only needed for generating posts from code commits. The skip button SHALL read "Not now" instead of "Skip".

#### Scenario: User sees GitHub step with bonus framing
- **WHEN** onboarding advances to the GitHub step
- **THEN** the screen displays a bonus-style header, features it unlocks (auto-generate from commits, track repos), and a "Not now" skip button

#### Scenario: User provides valid GitHub token
- **WHEN** user sends a text message during `onboarding_step = 'github_token'`
- **THEN** the message is deleted, the token is encrypted and stored, a `GET /user` test call validates it, `has_github` is set to 1, and onboarding advances to completion

#### Scenario: User skips GitHub token
- **WHEN** user clicks "Not now" on the GitHub token step
- **THEN** onboarding advances to completion without storing a token, `has_github` remains 0

### Requirement: Onboarding completion
When all steps are done, the system SHALL set `status = 'active'`, clear `onboarding_step`, and display a completion summary showing which features are unlocked vs locked based on connected services.

#### Scenario: User completes all steps with all services connected
- **WHEN** the final onboarding step is completed
- **THEN** `users.status` is set to `'active'`, `onboarding_step` is set to null, and a summary screen shows all features as unlocked with "Home" and "Add More Keys" buttons and a concrete first-action CTA

#### Scenario: User completes with some services skipped
- **WHEN** onboarding completes and some services were skipped
- **THEN** the completion screen shows unlocked features for connected services and locked features for skipped services, motivating the user to connect more later

### Requirement: Onboarding resumes on return
If a user leaves mid-onboarding and returns later, the system SHALL resume from their current `onboarding_step`.

#### Scenario: User returns after leaving mid-onboarding
- **WHEN** a user with `status = 'onboarding'` sends any message
- **THEN** the bot shows the prompt for their current `onboarding_step`

### Requirement: Immediate message deletion for security
The system SHALL call Telegram's `deleteMessage` API immediately after receiving a message containing an API key, before validation.

#### Scenario: Key message deleted from chat
- **WHEN** user sends a message containing an API key during onboarding
- **THEN** the Telegram message is deleted from the chat before any validation occurs

### Requirement: Max users cap
The system SHALL check the total number of users during onboarding against `MAX_USERS` env var (default 50).

#### Scenario: User tries to register when at capacity
- **WHEN** an unregistered user sends a message and the `users` table has reached `MAX_USERS` count
- **THEN** the bot responds with "Bot is at capacity" and does not create a user row
