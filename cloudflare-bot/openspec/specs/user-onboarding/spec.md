## MODIFIED Requirements

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
- **THEN** the system SHALL skip the identity step entirely and advance to `onboarding_step = 'instagram'`. The system SHALL NOT store any identity data — the user will use the skeleton default via `getPrompt` fallback to `default_prompts('identity', lang)`.

### Requirement: Step 2 — Identity analysis immediately after X connection
When X is connected, the identity analysis step SHALL be shown immediately after X success. The step SHALL display what the analysis does, list the aspects it examines (writing style, vocabulary, tone, emotional patterns, interests), and show cost transparency indicating the approximate number of tweets and AI calls used. If X was skipped, this step SHALL NOT be shown at all.

#### Scenario: Identity step shown after X connection
- **WHEN** X keys are validated and stored, and onboarding advances to `onboarding_step = 'identity'`
- **THEN** the identity step screen is displayed with analysis description, aspects list, cost transparency line, and buttons for "Analyze" and "Use default"

#### Scenario: User clicks Analyze
- **WHEN** user clicks the analyze button on the identity step
- **THEN** the system shows an "Analyzing..." message, runs `analyzeIdentity()`, stores the result as `user_prompts(chatId, 'identity', currentLang)` and upon success displays the identity success screen with a short snippet (first ~200 chars) of the generated identity document, then advances to `onboarding_step = 'gemini_key'`

#### Scenario: Identity analysis fails
- **WHEN** `analyzeIdentity()` returns null or throws an error
- **THEN** the system SHALL NOT store any identity data (user falls through to skeleton default), show a brief failure notice, and advance to `onboarding_step = 'gemini_key'`

#### Scenario: User clicks Use Default on identity step
- **WHEN** user clicks "Use default" on the identity step
- **THEN** the system SHALL NOT store any identity data in `user_prompts` — the user will use the skeleton default via `getPrompt` fallback to `default_prompts('identity', lang)`. Onboarding advances to `onboarding_step = 'gemini_key'`.

#### Scenario: Identity step skipped when X was skipped
- **WHEN** the user skipped the X step
- **THEN** the identity step is never shown and no identity data is stored; the user uses skeleton defaults via fallback

### Requirement: GitHub token storage captures username
When a user provides their GitHub token during onboarding or via settings, the system SHALL extract the `login` field from the `GET /user` validation response and store it as `github_username` on the user record.

#### Scenario: GitHub token set during onboarding
- **WHEN** user provides a valid GitHub token in the onboarding flow
- **THEN** the system stores `github_token_enc`, sets `has_github=1`, AND stores `github_username` from the API response

#### Scenario: GitHub token updated via settings
- **WHEN** user updates their GitHub token via Settings > API Keys
- **THEN** the system stores the new `github_token_enc`, sets `has_github=1`, AND updates `github_username` from the API response
