## ADDED Requirements

### Requirement: Home button component
The `ui/components.ts` module SHALL export a `homeButton()` function that returns a single `InlineButton` with text `🏠 Home` and callback_data `view:home`.

#### Scenario: Home button used in any view
- **WHEN** a view needs a Home navigation button
- **THEN** it SHALL call `homeButton()` and receive `{ text: '🏠 Home', callback_data: 'view:home' }`

### Requirement: Back button component
The `ui/components.ts` module SHALL export a `backButton(view: string)` function that returns a single `InlineButton` with text `◀️ Back` and callback_data set to the provided view string.

#### Scenario: Back button to repos list
- **WHEN** `backButton('view:repos')` is called
- **THEN** it SHALL return `{ text: '◀️ Back', callback_data: 'view:repos' }`

#### Scenario: Back button to settings
- **WHEN** `backButton('view:settings')` is called
- **THEN** it SHALL return `{ text: '◀️ Back', callback_data: 'view:settings' }`

### Requirement: Back-Home row component
The `ui/components.ts` module SHALL export a `backHomeRow(backView: string)` function that returns a single row (`InlineButton[]`) containing a Back button and a Home button.

#### Scenario: Back-Home row in draft list
- **WHEN** `backHomeRow('view:drafts')` is called
- **THEN** it SHALL return `[{ text: '◀️ Back', callback_data: 'view:drafts' }, { text: '🏠 Home', callback_data: 'view:home' }]`

### Requirement: Pagination rows component
The `ui/components.ts` module SHALL export a `paginationRows(type: string, page: number, hasMore: boolean)` function that returns `InlineButton[][]` containing 0 or 1 rows of navigation buttons.

#### Scenario: First page with more pages
- **WHEN** `paginationRows('repos', 0, true)` is called
- **THEN** it SHALL return `[[{ text: 'Next ➡️', callback_data: 'page:repos:1' }]]`

#### Scenario: Middle page
- **WHEN** `paginationRows('repos', 2, true)` is called
- **THEN** it SHALL return `[[{ text: '⬅️ Prev', callback_data: 'page:repos:1' }, { text: 'Next ➡️', callback_data: 'page:repos:3' }]]`

#### Scenario: Last page
- **WHEN** `paginationRows('repos', 3, false)` is called
- **THEN** it SHALL return `[[{ text: '⬅️ Prev', callback_data: 'page:repos:2' }]]`

#### Scenario: Single page (no pagination needed)
- **WHEN** `paginationRows('repos', 0, false)` is called
- **THEN** it SHALL return `[]` (empty array, no rows)

### Requirement: Toggle button component
The `ui/components.ts` module SHALL export a `toggleButton(label: string, isOn: boolean, callback: string)` function that returns a single `InlineButton` with On/Off text and success/danger style.

#### Scenario: Toggle is on
- **WHEN** `toggleButton('Tags', true, 'config:hashtags:123')` is called
- **THEN** it SHALL return `{ text: 'Tags: On', callback_data: 'config:hashtags:123', style: 'success' }`

#### Scenario: Toggle is off
- **WHEN** `toggleButton('Tags', false, 'config:hashtags:123')` is called
- **THEN** it SHALL return `{ text: 'Tags: Off', callback_data: 'config:hashtags:123', style: 'danger' }`

### Requirement: Add button row component
The `ui/components.ts` module SHALL export an `addButtonRow(label: string, callback: string)` function that returns a single row (`InlineButton[]`) with a primary-styled add button.

#### Scenario: Add repo button
- **WHEN** `addButtonRow('➕ Add repo', 'action:add_repo')` is called
- **THEN** it SHALL return `[{ text: '➕ Add repo', callback_data: 'action:add_repo', style: 'primary' }]`

### Requirement: Cancel row component
The `ui/components.ts` module SHALL export a `cancelRow(cancelView: string)` function that returns a single row with a Cancel button.

#### Scenario: Cancel returns to accounts list
- **WHEN** `cancelRow('view:accounts')` is called
- **THEN** it SHALL return `[{ text: '❌ Cancel', callback_data: 'view:accounts' }]`

### Requirement: Confirm delete view component
The `ui/components.ts` module SHALL export a `confirmDeleteView(title: string, message: string, confirmCb: string, cancelCb: string)` function that returns a complete `ViewResult` with a confirmation layout.

#### Scenario: Delete repo confirmation
- **WHEN** `confirmDeleteView('🗑️ Delete Repository?', 'Are you sure you want to delete owner/repo?', 'action:confirm_delete_repo:123', 'repo:123')` is called
- **THEN** it SHALL return a ViewResult with text containing the title and message
- **AND** keyboard SHALL have one row with a danger-styled confirm button and a cancel button

#### Scenario: Delete draft confirmation
- **WHEN** `confirmDeleteView(...)` is called for a draft
- **THEN** the confirm button SHALL have `style: 'danger'`
- **AND** the cancel button SHALL have no style (default)

### Requirement: Empty list view component
The `ui/components.ts` module SHALL export an `emptyListView(title: string, message: string, addLabel: string, addCb: string, backView: string)` function that returns a ViewResult for zero-item states.

#### Scenario: No repos yet
- **WHEN** `emptyListView('📦 Repositories', 'No repositories yet. Add one to start generating content!', '➕ Add repo', 'action:add_repo', 'view:home')` is called
- **THEN** it SHALL return a ViewResult with the title and message in text
- **AND** keyboard SHALL have an add button row (primary) and a Home button row

### Requirement: Input prompt view component
The `ui/components.ts` module SHALL export an `inputPromptView(title: string, instructions: string, example: string | null, cancelCb: string)` function that returns a ViewResult for awaiting-input screens.

#### Scenario: Add repo prompt
- **WHEN** `inputPromptView('➕ Add Repository', 'Send me the repository in owner/repo format.', 'octocat/hello-world', 'view:repos')` is called
- **THEN** it SHALL return a ViewResult with title, instructions, and example formatted in `<code>` tags
- **AND** keyboard SHALL have a single cancel row

#### Scenario: Prompt without example
- **WHEN** `inputPromptView('Title', 'Instructions', null, 'view:home')` is called
- **THEN** the example line SHALL be omitted from the text

### Requirement: Selected item label helper
The `ui/components.ts` module SHALL export a `selectedItemLabel(label: string, isSelected: boolean)` function that returns a string with a checkmark prefix when selected.

#### Scenario: Selected item
- **WHEN** `selectedItemLabel('16:9', true)` is called
- **THEN** it SHALL return `'✅ 16:9'`

#### Scenario: Unselected item
- **WHEN** `selectedItemLabel('16:9', false)` is called
- **THEN** it SHALL return `'16:9'`

### Requirement: Error with back navigation component
The `ui/components.ts` module SHALL export an `errorWithBackView(message: string, backView: string)` function that returns a ViewResult with an error message and a back button.

#### Scenario: Video settings error
- **WHEN** `errorWithBackView('Failed to save character', 'view:video_settings')` is called
- **THEN** it SHALL return a ViewResult with text `❌ <b>Error</b>\n\n{message}` and a keyboard with a back button

### Requirement: Shared escapeHtml utility
The `ui/utils.ts` module SHALL export a single canonical `escapeHtml(text: string)` function that escapes `<`, `>`, `&` characters for safe use in Telegram HTML messages.

#### Scenario: Text with special characters
- **WHEN** `escapeHtml('<script>alert("xss")</script>')` is called
- **THEN** it SHALL return `'&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'`

#### Scenario: Text without special characters
- **WHEN** `escapeHtml('hello world')` is called
- **THEN** it SHALL return `'hello world'` unchanged

### Requirement: Shared truncateHtml utility
The `ui/utils.ts` module SHALL export a single canonical `truncateHtml(html: string, maxLength: number)` function that truncates HTML text while preserving tag balance.

#### Scenario: Text within limit
- **WHEN** `truncateHtml('<b>short</b>', 100)` is called
- **THEN** it SHALL return `'<b>short</b>'` unchanged

#### Scenario: Text exceeding limit
- **WHEN** `truncateHtml(longText, 50)` is called where longText exceeds 50 characters
- **THEN** it SHALL return truncated text with `...` appended and HTML tags properly closed

### Requirement: All existing views use shared components
After refactoring, all view files SHALL import button/row/view builders from `ui/components.ts` and utilities from `ui/utils.ts` instead of defining them inline. No view file SHALL contain a local copy of `escapeHtml()`, `truncateHtml()`, or any pattern covered by the component library.

#### Scenario: Home button consistency
- **WHEN** any view includes a Home navigation button
- **THEN** it SHALL use the imported `homeButton()` function, not an inline button object

#### Scenario: No local escapeHtml copies
- **WHEN** a view file needs to escape HTML
- **THEN** it SHALL import `escapeHtml` from `ui/utils`, not define its own copy

#### Scenario: Telegram service uses shared truncateHtml
- **WHEN** `services/telegram.ts` needs to truncate HTML for photo captions
- **THEN** it SHALL import `truncateHtml` from `ui/utils`, not use its local `truncateHtmlCaption` copy
