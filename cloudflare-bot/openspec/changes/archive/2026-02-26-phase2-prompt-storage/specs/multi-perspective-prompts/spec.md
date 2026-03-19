## MODIFIED Requirements

### Requirement: Content generation uses DB-backed system prompt
The `generateContent()` function SHALL resolve the system prompt from the database via `getPrompt(env, chatId, 'content', lang)` instead of using the hardcoded `CONTENT_SYSTEM_PROMPT` constant. The function SHALL accept `chatId` and `lang` parameters for prompt resolution.

#### Scenario: User with custom content prompt
- **WHEN** `generateContent()` is called for a user who has customized their content prompt
- **THEN** the custom prompt SHALL be used as the system instruction for Gemini

#### Scenario: User without custom prompt
- **WHEN** `generateContent()` is called for a user without a custom content prompt
- **THEN** the global default content prompt SHALL be used (identical to current hardcoded behavior)

### Requirement: Edit refinement uses DB-backed system prompt
The `refineHandwrittenContent()` function SHALL resolve the system prompt from the database via `getPrompt(env, chatId, 'edit', lang)` instead of using the hardcoded `EDIT_SYSTEM_PROMPT` constant.

#### Scenario: Custom edit prompt
- **WHEN** a user with a custom edit prompt refines a draft
- **THEN** the custom edit prompt SHALL be used for Gemini
