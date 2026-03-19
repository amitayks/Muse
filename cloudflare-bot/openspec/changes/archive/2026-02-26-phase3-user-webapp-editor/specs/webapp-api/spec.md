## ADDED Requirements

### Requirement: initData authentication for API routes
All `/api/*` routes SHALL validate the Telegram WebApp `initData` signature to authenticate the user. The `initData` string SHALL be passed in the `Authorization` header with prefix `tma `.

#### Scenario: Valid initData
- **WHEN** a request to `/api/prompt` includes a valid `Authorization: tma <initData>` header
- **THEN** the server SHALL validate the HMAC-SHA256 signature using the bot token
- **AND** extract the `user.id` as the authenticated `chatId`
- **AND** proceed with the request

#### Scenario: Missing or invalid initData
- **WHEN** a request to `/api/prompt` has no Authorization header or an invalid signature
- **THEN** the server SHALL return HTTP 401 with `{ error: 'Unauthorized' }`

#### Scenario: Expired initData
- **WHEN** the `auth_date` in initData is older than a reasonable window (e.g., 1 hour)
- **THEN** the server SHALL return HTTP 401 with `{ error: 'Session expired' }`

### Requirement: GET /api/prompt — read prompt
The system SHALL handle `GET /api/prompt?type=<type>&lang=<lang>` to return the current prompt content for the authenticated user.

#### Scenario: User has custom prompt
- **WHEN** `GET /api/prompt?type=content&lang=en` is called for a user with a custom prompt
- **THEN** the response SHALL be `{ content: "<custom text>", isCustom: true, isStale: false, defaultVersion: N }`

#### Scenario: User has no custom prompt
- **WHEN** `GET /api/prompt?type=content&lang=en` is called for a user without a custom prompt
- **THEN** the response SHALL be `{ content: "<default text>", isCustom: false, isStale: false, defaultVersion: N }`

#### Scenario: Invalid prompt type
- **WHEN** `GET /api/prompt?type=persona&lang=en` is called (not a user-editable type)
- **THEN** the response SHALL be HTTP 400 with `{ error: 'Invalid prompt type' }`

### Requirement: POST /api/prompt — save prompt
The system SHALL handle `POST /api/prompt` with JSON body `{ type, lang, content }` to save a custom prompt for the authenticated user.

#### Scenario: Successful save
- **WHEN** `POST /api/prompt` is called with valid body
- **THEN** the prompt SHALL be saved via `saveUserPrompt()`
- **AND** the response SHALL be `{ success: true }`

#### Scenario: Empty content rejected
- **WHEN** `POST /api/prompt` is called with empty content
- **THEN** the response SHALL be HTTP 400 with `{ error: 'Content cannot be empty' }`

#### Scenario: Non-user-editable type rejected
- **WHEN** `POST /api/prompt` is called with `type: 'scoring'`
- **THEN** the response SHALL be HTTP 403 with `{ error: 'This prompt type is not user-editable' }`

### Requirement: DELETE /api/prompt — reset to default
The system SHALL handle `DELETE /api/prompt?type=<type>&lang=<lang>` to delete the user's custom prompt and return the global default content.

#### Scenario: Successful reset
- **WHEN** `DELETE /api/prompt?type=content&lang=en` is called
- **THEN** the user's custom prompt SHALL be deleted via `deleteUserPrompt()`
- **AND** the response SHALL include the default prompt text: `{ success: true, content: "<default text>" }`

#### Scenario: Reset when no custom exists
- **WHEN** `DELETE /api/prompt` is called but the user has no custom prompt
- **THEN** the response SHALL still succeed and return the default text (no-op on the database)
