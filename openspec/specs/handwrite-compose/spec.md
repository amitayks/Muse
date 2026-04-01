## Requirements

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

### Requirement: Multi-message tweet accumulation
While in compose mode (`awaiting_input === 'handwrite'`), each text message the user sends SHALL be buffered as a separate tweet in chronological order. Photo messages SHALL be grouped by `media_group_id` — photos in the same group are appended to a single tweet.

#### Scenario: Text message becomes tweet
- **WHEN** user sends a text message while in compose mode
- **THEN** the message text SHALL be appended to `HandwriteState.tweets[]` with the Telegram `message_id` stored
- **AND** the bot's status message SHALL be edited to update the tweet count

#### Scenario: Status message counter update
- **WHEN** a new tweet is buffered
- **THEN** the bot SHALL edit its status message to show "✍️ Composing... (N tweets)" where N is the current buffer size
- **AND** if any tweet exceeds 280 characters, the status SHALL include "⚠️ Tweet K over 280 chars"

#### Scenario: Single photo message becomes tweet with media
- **WHEN** user sends a single photo message (no `media_group_id`, with optional caption) while in compose mode
- **THEN** the photo SHALL be downloaded from Telegram and stored in R2
- **AND** a tweet SHALL be buffered with the caption as text (or empty string if no caption) and the R2 key in `media[]`
- **AND** the status message counter SHALL update

#### Scenario: First photo in a media group creates new tweet
- **WHEN** a photo message arrives with `media_group_id: "X1"` and caption "Check this out"
- **THEN** a new `ComposeTweet` SHALL be created with `text: "Check this out"`, `media: [{key, type:'photo'}]`, and `mediaGroupId: "X1"`
- **AND** the photo SHALL be stored in R2

#### Scenario: Subsequent photo in same group appends to existing tweet
- **WHEN** a photo message arrives with `media_group_id: "X1"` and the last tweet in the buffer has `mediaGroupId: "X1"`
- **THEN** the photo SHALL be appended to the last tweet's `media[]` array
- **AND** no new tweet SHALL be created
- **AND** the tweet's text SHALL NOT be overwritten (caption only appears on first message)

#### Scenario: Photo in different group creates new tweet
- **WHEN** a photo message arrives with `media_group_id: "Y2"` and the last tweet has `mediaGroupId: "X1"`
- **THEN** a new tweet SHALL be created with `mediaGroupId: "Y2"`

#### Scenario: Text message after media group creates new tweet
- **WHEN** a text message (no photo) arrives after a media group
- **THEN** a new tweet SHALL be created with the text (existing behavior preserved)

#### Scenario: Media group with no caption
- **WHEN** the first photo in a media group arrives without a caption
- **THEN** the tweet's `text` SHALL be an empty string

### Requirement: Native message editing updates buffer
The system SHALL handle `edited_message` Telegram updates to update previously buffered tweets during compose mode.

#### Scenario: User edits a text message
- **WHEN** user edits a previously sent message while in compose mode
- **THEN** the bot SHALL receive an `edited_message` update
- **AND** the bot SHALL find the matching tweet by `messageId` in the buffer and replace its text
- **AND** the status message counter SHALL update (character warnings may change)

#### Scenario: User edits a photo caption
- **WHEN** user edits the caption of a photo message while in compose mode
- **THEN** the bot SHALL update the matching tweet's text in the buffer
- **AND** the media reference SHALL remain unchanged

#### Scenario: Edit outside compose mode ignored
- **WHEN** an `edited_message` update arrives and the chat is NOT in compose mode
- **THEN** the update SHALL be silently ignored

### Requirement: Compose mode toggle buttons
The compose status message SHALL include context-aware toggle buttons that adapt based on current state: whether images are attached, whether AI is enabled, and whether an instruction exists. The compose view SHALL also include a persistent extras row containing the language toggle button and any mode-specific buttons (Thread, View Existing).

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
- **THEN** `HandwriteState.imageGen` SHALL be set to `true`
- **AND** the button text SHALL change to "🎨 Image: ON"

#### Scenario: Toggle AI refine on
- **WHEN** user clicks the "✨ AI: OFF" button
- **THEN** `HandwriteState.aiRefine` SHALL be set to `true`
- **AND** the button text SHALL change to "✨ AI: ON"
- **AND** if images are attached, the "🔍 Analyze" button SHALL appear in the button row

#### Scenario: Toggle AI refine off
- **WHEN** user clicks the "✨ AI: ON" button
- **THEN** `HandwriteState.aiRefine` SHALL be set to `false`
- **AND** `HandwriteState.analyzeImages` SHALL also be set to `false`
- **AND** the analyze button SHALL disappear from the button row

#### Scenario: Extras row always present with lang button
- **WHEN** the compose view is rendered in any mode (handwrite, repost, commit)
- **THEN** an extras row SHALL appear between the toggle row and the action row
- **AND** the extras row SHALL always contain the language toggle button
- **AND** mode-specific buttons (Thread toggle for repost, View Existing for duplicates) SHALL share or follow the extras row

#### Scenario: Extras row persists across message sends
- **WHEN** the user sends a text message or photo during compose mode
- **THEN** the re-rendered compose view SHALL include the full extras row with the lang button and any mode-specific buttons
- **AND** the source header (sourceTweet or sourceCommit) SHALL also persist

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

### Requirement: Slash commands exit compose mode
Recognized slash commands typed during compose mode SHALL cancel the session and execute the command.

#### Scenario: Recognized command during compose
- **WHEN** user sends `/drafts` while in compose mode
- **THEN** the compose session SHALL be cancelled (buffer discarded, state cleared)
- **AND** the `/drafts` command SHALL execute normally

#### Scenario: Unrecognized slash text treated as tweet
- **WHEN** user sends `/something` that is not a registered command while in compose mode
- **THEN** the text SHALL be buffered as a tweet (not treated as a command)

### Requirement: HandwriteState type definition
The system SHALL define `ComposeState` (renamed from `HandwriteState`) and `ComposeTweet` (renamed from `HandwriteTweet`) types for the compose buffer, including fields for mode, source tweet context, instruction, and image analysis.

#### Scenario: ComposeState stored in ChatContext
- **WHEN** compose mode is active
- **THEN** `ChatContext` SHALL contain `awaiting_input: 'handwrite'` and `compose: ComposeState`
- **AND** `ComposeState` SHALL have fields: `mode: 'handwrite' | 'repost'`, `tweets: ComposeTweet[]`, `imageGen: boolean`, `aiRefine: boolean`, `analyzeImages: boolean`, `statusMessageId: number`, optional `instruction: string`, optional `instructionMessageId: number`, optional `awaitingInstruction: boolean`, optional `sourceTweet`, optional `sourceAccountId: string`, optional `batchTweetId: string`
- **AND** `ComposeTweet` SHALL have fields: `messageId: number`, `text: string`, optional `media: TweetMedia[]`, optional `mediaGroupId: string`

### Requirement: Compose preview shows image counts and platform warnings
The compose preview SHALL display per-image indicators and platform-aware limit warnings.

#### Scenario: Tweet with multiple images shows camera emojis
- **WHEN** a tweet in the compose preview has N images (1 <= N <= 4)
- **THEN** the preview SHALL show N camera emoji characters

#### Scenario: Tweet with 5+ images shows count notation
- **WHEN** a tweet has N images where N > 4
- **THEN** the preview SHALL show a count notation

#### Scenario: X per-tweet limit warning
- **WHEN** a tweet has more than 4 images
- **THEN** the preview SHALL show a warning that only the first 4 will post to X

#### Scenario: Instagram total image limit warning
- **WHEN** the total image count across all tweets exceeds 10
- **THEN** the preview SHALL show a warning that only the first 10 will post to Instagram

#### Scenario: All images within limits
- **WHEN** all tweets have 4 or fewer images and total is 10 or fewer
- **THEN** no platform warnings SHALL be shown

### Requirement: ComposeTweet type extended with media count
The `ComposeTweet` interface SHALL replace `hasMedia?: boolean` with `mediaCount: number` to support multi-image display in the compose preview.

#### Scenario: ComposeTweet with multiple images
- **WHEN** a tweet has 3 images attached
- **THEN** `ComposeTweet.mediaCount` SHALL be `3`

#### Scenario: ComposeTweet with no images
- **WHEN** a tweet has no images
- **THEN** `ComposeTweet.mediaCount` SHALL be `0`

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

### Requirement: ComposeState mode type widened
The `ComposeState.mode` field SHALL accept `'commit'` in addition to existing `'handwrite'` and `'repost'` values.

#### Scenario: ComposeState with commit mode
- **WHEN** commit compose mode is active
- **THEN** `ComposeState.mode` SHALL be `'commit'`
- **AND** `ComposeState.sourceCommit` SHALL contain `ComposeSourceCommit` data
- **AND** all existing compose behaviors (toggle buttons, message buffering, instruction capture, cancel) SHALL work identically to handwrite and repost modes

### Requirement: renderCompose extended with commit header
The `renderCompose` function SHALL render a source commit header when `ComposeOptions.sourceCommit` is present.

#### Scenario: Compose view with source commit
- **WHEN** `ComposeOptions.sourceCommit` is provided
- **THEN** the compose message SHALL display a pinned header with repo name, title, commit count, file count, and optional additions/deletions
- **AND** a separator SHALL appear between the header and the tweet buffer area

### Requirement: enterComposeMode supports commit mode
The `enterComposeMode` function SHALL accept `mode: 'commit'` with `sourceCommit` context.

#### Scenario: Enter compose for commit
- **WHEN** `enterComposeMode` is called with `mode: 'commit'`
- **THEN** `ComposeState.aiRefine` SHALL default to `true`
- **AND** `ComposeState.imageGen` SHALL default to `true`
- **AND** `ComposeState.sourceCommit` SHALL be set from options
- **AND** `renderCompose` SHALL be called with `sourceCommit` in options

### Requirement: Pen down handler branches for commit mode
The `handlePenDown` function SHALL branch on `compose.mode === 'commit'` for commit-specific generation logic.

#### Scenario: Pen down dispatches to commit handler
- **WHEN** pen down is triggered and `compose.mode === 'commit'`
- **THEN** the handler SHALL call `handleCommitPenDown` which uses the `work-progress` skill for AI generation
- **AND** draft creation SHALL use `source: 'commit'` with commit metadata (`pr_number`, `pr_title`, `commit_sha`)

### Requirement: ComposeOptions extended with sourceCommit
The `ComposeOptions` interface SHALL include an optional `sourceCommit` field for passing commit context to `renderCompose`.

#### Scenario: ComposeOptions type
- **WHEN** building compose view for commit mode
- **THEN** `ComposeOptions` SHALL accept `sourceCommit?: ComposeSourceCommit`
- **AND** the field SHALL be passed through from `buildComposeView` helper

### Requirement: Handwrite input re-render passes all ComposeOptions
When the `handwriteInput` handler re-renders the compose view after buffering a user message, it SHALL pass ALL relevant fields from `ComposeState` to the `renderCompose` options, ensuring no buttons or headers are lost.

#### Scenario: Re-render in repost mode preserves Thread button
- **WHEN** a user sends a text message in repost compose mode with `fetchThread` set
- **THEN** the re-rendered compose view SHALL include the `[Thread: ON/OFF]` button
- **AND** the source tweet header SHALL be visible

#### Scenario: Re-render in commit mode preserves source header
- **WHEN** a user sends a text message in commit compose mode
- **THEN** the re-rendered compose view SHALL include the source commit header with repo name, title, and stats

#### Scenario: Re-render preserves View Existing button
- **WHEN** a user sends a text message in repost compose mode with `existingDraftId` set
- **THEN** the re-rendered compose view SHALL include the `[View Existing]` button

#### Scenario: Re-render preserves lang override button state
- **WHEN** a user has toggled lang to Hebrew and then sends a text message
- **THEN** the re-rendered compose view SHALL show the lang button as "English" (reflecting the active override)

#### Scenario: Re-render passes all options fields
- **WHEN** `handwriteInput` calls `renderCompose` to update the status message
- **THEN** the options object SHALL include: `instruction`, `awaitingInstruction`, `analyzeImages`, `fetchThread`, `sourceTweet`, `sourceCommit`, `existingDraftId`, `langOverride`, and `globalLang`

### Requirement: ComposeState type extended with langOverride
The `ComposeState` interface SHALL include `langOverride?: 'en' | 'he'` for carrying the per-session language preference.

#### Scenario: ComposeState stored in ChatContext
- **WHEN** compose mode is active
- **THEN** `ChatContext` SHALL contain `awaiting_input: 'handwrite'` and `compose: ComposeState`
- **AND** `ComposeState` SHALL have fields: `mode: 'handwrite' | 'repost' | 'commit'`, `tweets: ComposeTweet[]`, `imageGen: boolean`, `aiRefine: boolean`, `analyzeImages: boolean`, `statusMessageId: number`, optional `instruction: string`, optional `instructionMessageId: number`, optional `awaitingInstruction: boolean`, optional `sourceTweet`, optional `sourceAccountId: string`, optional `batchTweetId: string`, optional `fetchThread: boolean`, optional `sourceCommit`, optional `eventId: string`, optional `langOverride: 'en' | 'he'`

### Requirement: Compose action handles lang toggle callback
The compose action handler SHALL route the `compose:toggle_lang` callback value to toggle `ComposeState.langOverride`.

#### Scenario: Toggle lang callback
- **WHEN** callback data is `compose:toggle_lang`
- **THEN** the handler SHALL toggle `ComposeState.langOverride` between `undefined` (global) and the opposite of the global language
- **AND** the compose preview SHALL re-render with the updated lang button label
- **AND** the chat state SHALL be updated with the new compose state
