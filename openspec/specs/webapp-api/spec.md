### Requirement: Admin prompt read API
The system SHALL handle `GET /api/admin/prompt?type=<type>&lang=<lang>` to return any prompt type for the authenticated admin user. This endpoint SHALL accept all 7 prompt types (not just the 3 user-editable ones).

#### Scenario: Admin reads persona prompt
- **WHEN** `GET /api/admin/prompt?type=persona&lang=en` is called by an admin
- **THEN** the response SHALL return the admin's custom persona prompt, or the global default if no custom exists

#### Scenario: Non-admin attempts admin read
- **WHEN** `GET /api/admin/prompt?type=persona&lang=en` is called by a non-admin user
- **THEN** the response SHALL be HTTP 403 with `{ error: 'Admin access required' }`

### Requirement: Admin prompt save API
The system SHALL handle `POST /api/admin/prompt` with JSON body `{ type, lang, content }` to save a custom prompt for the admin user. All 7 prompt types SHALL be accepted.

#### Scenario: Admin saves video prompt personally
- **WHEN** `POST /api/admin/prompt { type: 'video', lang: 'he', content: '...' }` is called by admin
- **THEN** the prompt SHALL be saved to `user_prompts` for the admin's chat_id only

### Requirement: Admin push default API
The system SHALL handle `POST /api/admin/prompt/push` with JSON body `{ type, lang, content }` to update the global default prompt and bump its version.

#### Scenario: Successful push
- **WHEN** `POST /api/admin/prompt/push { type: 'content', lang: 'en', content: '...' }` is called by admin
- **THEN** `default_prompts` SHALL be updated with new content and `version` incremented by 1
- **AND** the admin's `user_prompts` SHALL also be updated with the same content
- **AND** the response SHALL include `{ success: true, newVersion: N }`

#### Scenario: Non-admin attempts push
- **WHEN** `POST /api/admin/prompt/push` is called by a non-admin user
- **THEN** the response SHALL be HTTP 403 with `{ error: 'Admin access required' }`

### Requirement: Admin check on all /api/admin/* routes
All routes under `/api/admin/*` SHALL validate that the authenticated user is an admin via `isAdmin(chatId, env)`. Non-admin requests SHALL receive HTTP 403.

#### Scenario: Admin passes check
- **WHEN** an admin user makes a request to `/api/admin/prompt`
- **THEN** the request SHALL proceed normally

#### Scenario: Regular user fails check
- **WHEN** a non-admin user makes a request to `/api/admin/prompt`
- **THEN** the request SHALL be rejected with HTTP 403
