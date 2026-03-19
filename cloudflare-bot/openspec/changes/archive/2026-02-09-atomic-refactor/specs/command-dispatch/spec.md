## ADDED Requirements

### Requirement: Router dispatches Telegram commands via lookup table
The system SHALL route incoming slash commands (e.g., `/start`, `/generate`, `/help`) through a `commandHandlers` dispatch table (`Record<string, CommandHandler>`) instead of a switch statement. Unknown commands SHALL fall back to the home view.

#### Scenario: Known command dispatched
- **WHEN** a user sends `/drafts`
- **THEN** the router looks up `drafts` in `commandHandlers` and invokes the corresponding handler function

#### Scenario: Unknown command shows home
- **WHEN** a user sends `/unknown`
- **THEN** the router finds no match in `commandHandlers` and responds with `renderHome()`

### Requirement: Router dispatches callback actions via lookup table
The system SHALL route callback queries (button clicks) through dispatch tables based on the callback data prefix (`view:`, `action:`, `draft:`, `page:`, `repo:`, `config:`). Each prefix SHALL map to a handler function.

#### Scenario: View callback dispatched
- **WHEN** user clicks a button with `callback_data: "view:drafts"`
- **THEN** the router parses prefix `view` and value `drafts`, then invokes the view-change handler

#### Scenario: Action callback dispatched with entity ID
- **WHEN** user clicks a button with `callback_data: "action:publish:abc123"`
- **THEN** the router parses prefix `action`, action `publish`, and entity ID `abc123`, then invokes the publish action handler

### Requirement: Router dispatches awaiting-input state via lookup table
The system SHALL route text messages when `context.awaiting_input` is set through an `inputHandlers` dispatch table (`Record<string, InputHandler>`). Each awaiting-input type (e.g., `commit_sha`, `schedule`, `add_repo`, `edit_draft`) SHALL have its own handler.

#### Scenario: Awaiting commit SHA input dispatched
- **WHEN** a user sends text while `context.awaiting_input === "commit_sha"`
- **THEN** the router looks up `commit_sha` in `inputHandlers` and invokes the generate input handler

### Requirement: Handler context object reduces parameter passing
Each handler function SHALL receive a `HandlerContext` object containing `{ env, chatId }` and optionally `{ messageId, args }`. Handlers SHALL NOT receive these as separate positional parameters.

#### Scenario: Command handler receives context
- **WHEN** the router invokes a command handler
- **THEN** the handler receives a single `HandlerContext` with `env`, `chatId`, and `args` (the text after the command)

#### Scenario: Action handler receives context with IDs
- **WHEN** the router invokes an action handler
- **THEN** the handler receives `HandlerContext` with `env`, `chatId`, `messageId`, and parsed callback parts (`value`, `extra`)

### Requirement: respond utility combines message send and state update
The system SHALL provide a `respond(env, chatId, view, opts?)` function that sends/edits a Telegram message AND updates chat state in a single call. This SHALL replace all instances of manual `sendMessage + updateChatState` patterns.

#### Scenario: Respond sends new message with state
- **WHEN** `respond()` is called with a view and `{ viewName: "drafts", context: { page: 0 } }`
- **THEN** it calls `sendMessage(env, chatId, view.text, view.keyboard)` and then `updateChatState(env, chatId, { message_id, current_view: "drafts", context: { page: 0 } })`

#### Scenario: Respond edits existing message
- **WHEN** `respond()` is called with `{ edit: true, messageId: 123 }`
- **THEN** it calls `editMessage(env, chatId, 123, view.text, view.keyboard)` instead of `sendMessage`

### Requirement: Router handles photo-to-text message transition
The callback router SHALL detect when the current Telegram message is a photo message. When the response is text-only, it SHALL delete the photo message and send a new text message. Individual action handlers SHALL NOT handle this transition.

#### Scenario: Text response after photo message
- **WHEN** an action returns a text view and the current callback message contains `photo`
- **THEN** the router deletes the photo message and sends a new text message with the view content

#### Scenario: Text response after text message
- **WHEN** an action returns a text view and the current callback message is a regular text message
- **THEN** the router edits the existing message in place

### Requirement: One file per command handler
Each Telegram slash command SHALL have its own file in `commands/` directory. Each file SHALL export a single handler function matching the `CommandHandler` type signature.

#### Scenario: /generate command file
- **WHEN** the `/generate` command is invoked
- **THEN** the handler in `commands/generate.ts` is called, which either prompts for SHA or runs generation directly if args provided

### Requirement: One file per action handler
Each callback action type SHALL have its own file in `actions/` directory. Related actions (e.g., all repo management actions) MAY share a file.

#### Scenario: Publish action file
- **WHEN** the `action:publish:{id}` callback is triggered
- **THEN** the handler in `actions/publish.ts` is called

### Requirement: One file per input handler
Each `awaiting_input` type SHALL have its own file in `inputs/` directory.

#### Scenario: Edit draft input file
- **WHEN** user sends text while `awaiting_input === "edit_draft"`
- **THEN** the handler in `inputs/edit-draft.ts` is called
