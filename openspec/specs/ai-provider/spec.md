## Purpose

This capability lets users choose between Gemini and Claude for text generation. It provides a `callLLMText` router that dispatches to the configured provider, a Claude Messages API integration (including multimodal input translation, web search tool mapping, and key validation), and the per-user `ai_provider` setting and encrypted Claude key storage on the users table.

## Requirements

### Requirement: LLM text router dispatches to provider based on user preference
The system SHALL provide a `callLLMText()` function with the same signature as `callGeminiText()` that reads `env.AI_PROVIDER` and dispatches the call to the appropriate provider-specific function (`callGeminiText` for `'gemini'`, `callClaudeText` for `'claude'`).

#### Scenario: User with Gemini provider
- **WHEN** `callLLMText` is called and `env.AI_PROVIDER` is `'gemini'` (or undefined)
- **THEN** the call SHALL be dispatched to `callGeminiText` with identical arguments
- **AND** the return value SHALL be the string returned by `callGeminiText`

#### Scenario: User with Claude provider
- **WHEN** `callLLMText` is called and `env.AI_PROVIDER` is `'claude'`
- **THEN** the call SHALL be dispatched to `callClaudeText` with the same system prompt, user prompt, and options
- **AND** the return value SHALL be the string returned by `callClaudeText`

#### Scenario: Default provider when AI_PROVIDER is not set
- **WHEN** `callLLMText` is called and `env.AI_PROVIDER` is undefined or empty
- **THEN** the call SHALL default to `callGeminiText`

#### Scenario: Claude provider but no Claude API key
- **WHEN** `callLLMText` is called with `env.AI_PROVIDER` = `'claude'` but `env.CLAUDE_API_KEY` is undefined
- **THEN** the function SHALL throw an error with a message indicating the user must add a Claude API key in Settings

### Requirement: All text generation callers use callLLMText instead of callGeminiText
All functions that currently call `callGeminiText` for text generation SHALL be updated to call `callLLMText` instead. This includes internal callers in `gemini.ts` (`generateContent`, `refineContent`, `extractRepoOverview`, `generateVideoScript`, `refineHandwrittenContent`) and external callers (`identity.ts:analyzeIdentity`, `scoring.ts:scoreTweetBatch`, `repost-generate.ts:generateRepostContent`, `persona-bootstrap.ts`).

#### Scenario: generateContent uses router
- **WHEN** `generateContent()` is called
- **THEN** it SHALL call `callLLMText` instead of `callGeminiText`
- **AND** the response parsing logic SHALL remain identical

#### Scenario: refineContent uses router
- **WHEN** `refineContent()` is called
- **THEN** it SHALL call `callLLMText` instead of `callGeminiText`

#### Scenario: External callers use router
- **WHEN** `analyzeIdentity()`, `scoreTweetBatch()`, `generateRepostContent()`, or persona bootstrap functions are called
- **THEN** they SHALL import and call `callLLMText` from `gemini.ts` instead of `callGeminiText`

#### Scenario: generateImage stays on Gemini
- **WHEN** `generateImage()` is called
- **THEN** it SHALL continue to call the Gemini image API directly using `env.GOOGLE_API_KEY`
- **AND** it SHALL NOT use `callLLMText` or be affected by the user's AI provider choice

### Requirement: Claude Messages API integration
The system SHALL provide a `callClaudeText()` function that calls the Claude Messages API with the translated input format and returns the response text.

#### Scenario: Basic text call to Claude
- **WHEN** `callClaudeText` is called with a system prompt and a string user prompt
- **THEN** it SHALL POST to `https://api.anthropic.com/v1/messages` with:
  - Header `x-api-key` set to `env.CLAUDE_API_KEY`
  - Header `anthropic-version` set to the current API version
  - Body `model` set to `claude-sonnet-4-6-20250514`
  - Body `system` set to the system prompt string
  - Body `messages` containing a single user message with the user prompt text
  - Body `max_tokens` set to 8192
- **AND** it SHALL return the text content from the first text block in the response

#### Scenario: Multimodal call to Claude with images
- **WHEN** `callClaudeText` is called with a user prompt array containing `{inline_data: {mime_type, data}}` parts (Gemini format)
- **THEN** it SHALL translate each part to Claude format:
  - `{text: "..."}` → `{type: "text", text: "..."}`
  - `{inline_data: {mime_type: "image/jpeg", data: "base64..."}}` → `{type: "image", source: {type: "base64", media_type: "image/jpeg", data: "base64..."}}`
- **AND** the translated parts SHALL be sent as the `content` array in the user message

#### Scenario: Temperature option forwarded to Claude
- **WHEN** `callClaudeText` is called with `options.temperature` set to `0.3`
- **THEN** the Claude API request body SHALL include `temperature: 0.3`

#### Scenario: Claude API error handling
- **WHEN** the Claude API returns a non-OK response
- **THEN** `callClaudeText` SHALL log the error status and truncated error body
- **AND** it SHALL throw an Error with message `'Content generation failed. Please try again.'` (same message as Gemini errors)

#### Scenario: Claude returns no text content
- **WHEN** the Claude API response contains no text content blocks
- **THEN** `callClaudeText` SHALL throw an Error with message `'No content generated'`

### Requirement: Web search tool mapping between providers
The `callLLMText` router SHALL translate tool specifications between provider formats before dispatching.

#### Scenario: Google Search tool mapped to Claude web search
- **WHEN** `callLLMText` dispatches to Claude and the `options.tools` array contains `{googleSearch: {}}`
- **THEN** it SHALL replace that entry with `{type: 'web_search_20250305', name: 'web_search'}` in the options passed to `callClaudeText`

#### Scenario: Google Search tool passed through to Gemini
- **WHEN** `callLLMText` dispatches to Gemini and `options.tools` contains `{googleSearch: {}}`
- **THEN** the tools array SHALL be passed through unchanged

#### Scenario: No tools specified
- **WHEN** `callLLMText` is called without `options.tools`
- **THEN** no tools SHALL be added to the provider call

### Requirement: Claude web search tool handling in API call
When `callClaudeText` receives translated tool specifications, it SHALL include them in the Claude API request.

#### Scenario: Web search tool included in Claude request
- **WHEN** `callClaudeText` is called with `options.tools` containing `{type: 'web_search_20250305', name: 'web_search'}`
- **THEN** the Claude API request body SHALL include a `tools` array with that tool specification

#### Scenario: Claude response with web search results
- **WHEN** Claude performs a web search and the response contains both `web_search_tool_result` blocks and `text` blocks
- **THEN** `callClaudeText` SHALL extract and return only the text content, ignoring tool result blocks

### Requirement: JSON mode handling for Claude
When `callLLMText` dispatches to Claude with `jsonMode: true`, it SHALL NOT add any special JSON mode parameter to the Claude API request. The system prompts already instruct JSON output, and the existing regex-based response parsing handles varied formatting.

#### Scenario: JSON mode with Claude provider
- **WHEN** `callLLMText` is called with `options.jsonMode: true` and provider is Claude
- **THEN** no `response_format` or similar parameter SHALL be added to the Claude API request
- **AND** the response text SHALL be returned as-is for the caller to parse via regex

### Requirement: Claude API key validation
The system SHALL provide a `validateClaudeKey(key)` function that verifies a Claude API key is valid by making a lightweight test call.

#### Scenario: Valid Claude key
- **WHEN** `validateClaudeKey` is called with a valid API key
- **THEN** it SHALL make a minimal Messages API call (e.g., `"Say hello in one word"` with `max_tokens: 10`)
- **AND** it SHALL return `true`

#### Scenario: Invalid Claude key
- **WHEN** `validateClaudeKey` is called with an invalid or expired API key
- **THEN** the Claude API SHALL return a 401 or 403 status
- **AND** `validateClaudeKey` SHALL return `false`

### Requirement: AI provider column on users table
The `users` table SHALL have an `ai_provider` column of type `TEXT` with default value `'gemini'`. Valid values are `'gemini'` and `'claude'`.

#### Scenario: New user default provider
- **WHEN** a new user completes onboarding
- **THEN** their `ai_provider` SHALL be `'gemini'`

#### Scenario: Existing users after migration
- **WHEN** the migration runs on existing data
- **THEN** all existing users SHALL have `ai_provider` = `'gemini'`

### Requirement: Claude encrypted key column on users table
The `users` table SHALL have a `claude_key_enc` column of type `TEXT` (nullable) for storing the user's encrypted Claude API key, and a `has_claude` column of type `INTEGER` with default `0`.

#### Scenario: User with Claude key stored
- **WHEN** a user provides a Claude API key
- **THEN** it SHALL be encrypted with AES-256-GCM and stored in `claude_key_enc`
- **AND** `has_claude` SHALL be set to `1`

#### Scenario: User without Claude key
- **WHEN** a user has not provided a Claude API key
- **THEN** `claude_key_enc` SHALL be `NULL` and `has_claude` SHALL be `0`

### Requirement: AI provider getter and setter
The system SHALL provide `getAiProvider(env, chatId)` and `setAiProvider(env, chatId, provider)` functions following the same pattern as other user settings.

#### Scenario: Get default provider
- **WHEN** `getAiProvider` is called for a user who has never changed their provider
- **THEN** it SHALL return `'gemini'`

#### Scenario: Set provider to Claude
- **WHEN** `setAiProvider(env, chatId, 'claude')` is called
- **THEN** the `ai_provider` column SHALL be updated to `'claude'` in the users table

#### Scenario: Set provider to Gemini
- **WHEN** `setAiProvider(env, chatId, 'gemini')` is called
- **THEN** the `ai_provider` column SHALL be updated to `'gemini'` in the users table
