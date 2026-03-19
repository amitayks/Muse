## MODIFIED Requirements

### Requirement: HandwriteState type definition
The system SHALL define `ComposeState` (renamed from `HandwriteState`) and `ComposeTweet` (renamed from `HandwriteTweet`) types for the compose buffer, including fields for mode, source tweet context, instruction, and image analysis.

#### Scenario: ComposeState stored in ChatContext
- **WHEN** compose mode is active
- **THEN** `ChatContext` SHALL contain `awaiting_input: 'handwrite'` and `compose: ComposeState`
- **AND** `ComposeState` SHALL have fields: `mode: 'handwrite' | 'repost'`, `tweets: ComposeTweet[]`, `imageGen: boolean`, `aiRefine: boolean`, `analyzeImages: boolean`, `statusMessageId: number`, optional `instruction: string`, optional `instructionMessageId: number`, optional `awaitingInstruction: boolean`, optional `sourceTweet`, optional `sourceAccountId: string`, optional `batchTweetId: string`
- **AND** `ComposeTweet` SHALL have fields: `messageId: number`, `text: string`, optional `media: TweetMedia[]`, optional `mediaGroupId: string`

### Requirement: Handwrite compose mode lifecycle
The system SHALL provide a compose mode where users write their own tweets via sequential Telegram messages. The mode is entered via `/handwrite` command or dashboard button, accumulates messages as tweets, and exits on "Pen Down" or cancel.

#### Scenario: Enter compose via slash command
- **WHEN** user sends `/handwrite`
- **THEN** the bot SHALL call `enterComposeMode` with `mode: 'handwrite'`
- **AND** the compose message SHALL show handwrite-specific instructions with Pen Down, Image Gen toggle, AI Refine toggle, Instruct button, and Cancel buttons
- **AND** `awaiting_input` SHALL be set to `'handwrite'`
- **AND** the status message ID SHALL be stored in `ComposeState.statusMessageId`

#### Scenario: Enter compose via dashboard button
- **WHEN** user clicks the "Handwrite" button on the dashboard
- **THEN** the dashboard message SHALL be edited to show the compose prompt with the same buttons
- **AND** `awaiting_input` SHALL be set to `'handwrite'`

### Requirement: Compose mode toggle buttons
The compose status message SHALL include context-aware toggle buttons that adapt based on current state: whether images are attached, whether AI is enabled, and whether an instruction exists.

#### Scenario: No images — show image gen, AI, and instruct buttons
- **WHEN** no tweets have media attached
- **THEN** the button row SHALL show: `[🎨 Image: ON/OFF]` `[✨ AI: ON/OFF]` `[📝 Instruct]`

#### Scenario: Images attached, AI off — show AI and instruct buttons
- **WHEN** at least one tweet has media AND `aiRefine` is `false`
- **THEN** the button row SHALL show: `[✨ AI: OFF]` `[📝 Instruct]`

#### Scenario: Images attached, AI on — show analyze, AI, and instruct buttons
- **WHEN** at least one tweet has media AND `aiRefine` is `true`
- **THEN** the button row SHALL show: `[🔍 Analyze: ON/OFF]` `[✨ AI: ON]` `[📝 Instruct]`

#### Scenario: Toggle image generation on (no images)
- **WHEN** user clicks the "🎨 Image: OFF" button and no images are attached
- **THEN** `ComposeState.imageGen` SHALL be set to `true`
- **AND** the button text SHALL change to "🎨 Image: ON"

#### Scenario: Toggle AI refine on
- **WHEN** user clicks the "✨ AI: OFF" button
- **THEN** `ComposeState.aiRefine` SHALL be set to `true`
- **AND** the button text SHALL change to "✨ AI: ON"
- **AND** if images are attached, the "🔍 Analyze" button SHALL appear in the button row

#### Scenario: Toggle AI refine off
- **WHEN** user clicks the "✨ AI: ON" button
- **THEN** `ComposeState.aiRefine` SHALL be set to `false`
- **AND** `ComposeState.analyzeImages` SHALL also be set to `false`
- **AND** the analyze button SHALL disappear from the button row

### Requirement: Pen Down finalizes compose and creates draft
When the user clicks "Pen Down", the compose session SHALL end and a draft SHALL be created from the buffered tweets. The behavior depends on the compose mode.

#### Scenario: Pen down in handwrite mode with tweets and no AI
- **WHEN** user clicks "Pen Down" in handwrite mode with tweets buffered and both toggles OFF
- **THEN** a draft SHALL be created with `source: 'handwrite'`, `pr_number: 0`, `pr_title` as the first tweet text (truncated to 100 chars), and `DraftContent` with the buffered tweets
- **AND** `format` SHALL be `'single'` if 1 tweet, `'thread'` if 2+ tweets
- **AND** `awaiting_input` SHALL be cleared
- **AND** the user SHALL see `renderDraftDetail()` for the new draft

#### Scenario: Pen down in handwrite mode with AI refine enabled
- **WHEN** user clicks "Pen Down" in handwrite mode with `aiRefine: true`
- **THEN** the bot SHALL send the tweets to Gemini for refinement via the refine skill and identity
- **AND** the AI MAY adjust tweet count based on skill guidance (no hardcoded tweet count constraint)
- **AND** the refined tweets SHALL be used in the draft content

#### Scenario: Pen down in handwrite mode with instruction and no tweets
- **WHEN** user clicks "Pen Down" in handwrite mode with `instruction` set, `aiRefine: true`, and zero tweets buffered
- **THEN** the AI SHALL generate content from scratch based on the instruction, skill, and identity
- **AND** a draft SHALL be created from the AI-generated content

#### Scenario: Pen down with image generation enabled
- **WHEN** user clicks "Pen Down" with `imageGen: true`
- **THEN** the bot SHALL send the tweets to Gemini to generate an `imagePrompt`
- **AND** the `imagePrompt` SHALL be stored in the `DraftContent`
- **AND** image generation from the prompt happens on-demand when viewing the draft (existing flow)

#### Scenario: Pen down with no tweets and no instruction and no AI
- **WHEN** user clicks "Pen Down" with zero tweets buffered, no instruction, and AI off
- **THEN** the bot SHALL remain in compose mode and show the compose view as a new message

### Requirement: Cancel discards compose session
The cancel button SHALL discard the buffer and return to the dashboard.

#### Scenario: Cancel compose
- **WHEN** user clicks "❌ Cancel" on the compose status message
- **THEN** `awaiting_input` SHALL be cleared
- **AND** `ComposeState` SHALL be cleared from context
- **AND** the user SHALL see the dashboard (`renderHome()`)
- **AND** any R2 media stored during the session SHALL remain (orphan cleanup is deferred)

### Requirement: Compose action handles new toggle callbacks
The compose action handler SHALL route callback values for all toggles including analyze and instruct.

#### Scenario: Toggle analyze callback
- **WHEN** callback data is `compose:toggle_analyze`
- **THEN** `ComposeState.analyzeImages` SHALL be toggled
- **AND** the compose preview SHALL re-render with updated buttons

#### Scenario: Toggle instruct callback
- **WHEN** callback data is `compose:toggle_instruct`
- **THEN** `ComposeState.awaitingInstruction` SHALL be set to `true`
- **AND** `ComposeState.aiRefine` SHALL be auto-enabled
- **AND** the callback SHALL be answered with toast text "Type your instruction next"
- **AND** the compose preview SHALL update to show the awaiting instruction cue

### Requirement: Compose preview truncation for message length safety
The compose view SHALL truncate content to stay within Telegram's 4096 character message limit.

#### Scenario: Many user tweets in buffer
- **WHEN** the compose buffer has more than 5 tweets
- **THEN** the compose preview SHALL show the first 5 tweets with individual previews
- **AND** a "...and N more" indicator SHALL be shown for remaining tweets

#### Scenario: Long tweet text truncation
- **WHEN** a tweet in the buffer exceeds 60 characters
- **THEN** the compose preview SHALL truncate it to 60 characters with "..."
