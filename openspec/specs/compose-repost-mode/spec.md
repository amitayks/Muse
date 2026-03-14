### Requirement: Repost compose mode entry
When a tweet URL is successfully fetched, the system SHALL enter compose mode with `mode: 'repost'` instead of showing a static preview. The compose session SHALL have `aiRefine: true` and `imageGen: false` as defaults for repost mode.

#### Scenario: Manual repost enters compose directly
- **WHEN** user sends a valid tweet URL via `/repost` and the tweet is fetched successfully
- **THEN** the system SHALL create a `ComposeState` with `mode: 'repost'`, `aiRefine: true`, `imageGen: false`
- **AND** `sourceTweet` SHALL be populated with the fetched tweet's `tweetId`, `username`, `displayName`, `text`, `mediaUrl`, `isThread`, `metrics`, and `tweetUrl`
- **AND** the bot SHALL send a compose message (via `sendMessage`, not edit)
- **AND** `awaiting_input` SHALL be set to `'handwrite'`

#### Scenario: Repost with duplicate detection
- **WHEN** user sends a tweet URL that already has an existing repost draft
- **THEN** the compose view SHALL display a duplicate warning banner above the source tweet
- **AND** a `[View Existing]` button SHALL be included in the button row
- **AND** the user MAY still compose and pen down to create a new draft

#### Scenario: Repost with inline URL argument
- **WHEN** user sends `/repost https://x.com/user/status/123`
- **THEN** the system SHALL parse the URL, fetch the tweet, and enter compose mode directly (same as sending the URL after the prompt)

### Requirement: Source tweet display in compose view
When `ComposeState.mode` is `'repost'` and `sourceTweet` is present, the compose view SHALL display a pinned source tweet header above the compose area.

#### Scenario: Source tweet header rendered
- **WHEN** `renderCompose` is called with `options.sourceTweet` present
- **THEN** the compose message SHALL display a header with: pinned indicator, `@username`, engagement metrics (likes, retweets formatted), and the tweet text truncated to 80 characters
- **AND** the tweet text SHALL be wrapped as a hyperlink (`<a href="tweetUrl">text</a>`) to the original tweet
- **AND** a visual separator SHALL appear between the source tweet header and the compose area

#### Scenario: Source tweet with thread indicator
- **WHEN** `sourceTweet.isThread` is `true`
- **THEN** the header SHALL include a thread indicator with tweet count

#### Scenario: Source tweet with image
- **WHEN** `sourceTweet.mediaUrl` is present
- **THEN** the header SHALL include an image indicator

#### Scenario: Compose without source tweet (handwrite mode)
- **WHEN** `renderCompose` is called without `options.sourceTweet`
- **THEN** the compose view SHALL render exactly as before (no header, existing behavior)

### Requirement: Repost-mode empty state instructions
The compose empty state (no tweets, no instruction) SHALL display mode-appropriate instructions.

#### Scenario: Repost mode empty state
- **WHEN** compose view renders with `mode: 'repost'`, zero tweets, and no instruction
- **THEN** the instructions SHALL explain: "Add your own tweets, attach images, or tap Pen Down to generate a quote tweet."

#### Scenario: Handwrite mode empty state
- **WHEN** compose view renders with `mode: 'handwrite'`, zero tweets, and no instruction
- **THEN** the existing handwrite instructions SHALL be shown (unchanged)

### Requirement: Pen down in repost mode uses quote skill
When pen down is triggered in repost mode with AI enabled, the system SHALL use the `quote` skill and pass the source tweet context to the AI.

#### Scenario: Pen down with AI on and no user tweets (default repost)
- **WHEN** user clicks Pen Down in repost mode with `aiRefine: true` and zero user tweets buffered
- **THEN** the system SHALL call `generateRepostContent` with the source tweet, account context, and no user tweets
- **AND** the AI prompt SHALL use `assembleSystemInstruction(env, chatId, 'quote', lang)` as the system prompt
- **AND** a draft SHALL be created with `source: 'repost'`, `original_tweet_id`, and `original_tweet_url`

#### Scenario: Pen down with AI on and user tweets (initial thoughts)
- **WHEN** user clicks Pen Down in repost mode with `aiRefine: true` and user tweets buffered
- **THEN** `buildRepostUserPrompt` SHALL be called with `userTweets` containing the user's tweet texts
- **AND** the user's tweets SHALL appear in the prompt under "MY INITIAL THOUGHTS"
- **AND** the AI SHALL use them as a starting point, not a template to copy

#### Scenario: Pen down with AI on and instruction
- **WHEN** user clicks Pen Down in repost mode with `aiRefine: true` and an instruction set
- **THEN** `buildRepostUserPrompt` SHALL be called with `instruction` containing the instruction text
- **AND** the instruction SHALL appear in the prompt under "WHAT I'M GOING FOR"

#### Scenario: Pen down with AI on, user tweets, and instruction
- **WHEN** user clicks Pen Down in repost mode with AI on, user tweets, and an instruction
- **THEN** both "MY INITIAL THOUGHTS" and "WHAT I'M GOING FOR" sections SHALL be included in the prompt

#### Scenario: Pen down with AI off in repost mode
- **WHEN** user clicks Pen Down in repost mode with `aiRefine: false` and user tweets buffered
- **THEN** a draft SHALL be created directly from the user's tweets without AI processing
- **AND** the draft SHALL have `source: 'repost'`, `original_tweet_id`, and `original_tweet_url`

#### Scenario: Pen down with AI off and no user tweets in repost mode
- **WHEN** user clicks Pen Down in repost mode with `aiRefine: false` and zero user tweets
- **THEN** the bot SHALL remain in compose mode and re-render the compose view (nothing to save)

#### Scenario: Pen down in handwrite mode uses refine skill
- **WHEN** user clicks Pen Down in handwrite mode with `aiRefine: true`
- **THEN** the system SHALL use the `refine` skill (existing behavior, unchanged)

### Requirement: Source tweet image always analyzed in repost mode
When generating a repost with AI, the source tweet's image (if present) SHALL always be sent to Gemini as multimodal context, regardless of the `analyzeImages` toggle. The `analyzeImages` toggle only controls user-attached images.

#### Scenario: Source tweet has image and AI is on
- **WHEN** pen down is triggered in repost mode with `aiRefine: true` and `sourceTweet.mediaUrl` is set
- **THEN** the source tweet's image SHALL be fetched, base64-encoded, and included as an `inline_data` part in the Gemini call
- **AND** this behavior SHALL NOT be affected by the `analyzeImages` toggle state

#### Scenario: Source tweet has image but AI is off
- **WHEN** pen down is triggered in repost mode with `aiRefine: false`
- **THEN** the source tweet's image SHALL NOT be sent to Gemini (no AI call at all)

#### Scenario: User images and source image both present
- **WHEN** pen down is triggered in repost mode with `sourceTweet.mediaUrl` set AND user has attached images AND `analyzeImages: true`
- **THEN** BOTH the source tweet image AND the user's images SHALL be sent to Gemini as multimodal parts
- **AND** the prompt SHALL distinguish which images are from the source tweet and which are the user's

### Requirement: Repost user prompt extended with initial thoughts and instruction
The `buildRepostUserPrompt` function SHALL accept optional `userTweets` and `instruction` parameters and include them as self-directed sections in the prompt.

#### Scenario: Prompt with user tweets
- **WHEN** `buildRepostUserPrompt` is called with `userTweets: ["My take on this...", "Also worth noting..."]`
- **THEN** the prompt SHALL include a "MY INITIAL THOUGHTS" section listing the user's tweets numbered

#### Scenario: Prompt with instruction
- **WHEN** `buildRepostUserPrompt` is called with `instruction: "Focus on the technical angle"`
- **THEN** the prompt SHALL include a "WHAT I'M GOING FOR" section with the instruction text

#### Scenario: Prompt without user tweets or instruction
- **WHEN** `buildRepostUserPrompt` is called without `userTweets` and without `instruction`
- **THEN** the prompt SHALL render exactly as before (no new sections)

### Requirement: Quote skill updated with initial thoughts awareness
The `quote` skill text SHALL include a paragraph about sometimes having initial thoughts as a starting point, written in self-directed voice.

#### Scenario: Quote skill EN updated
- **WHEN** the `quote` skill EN text is resolved
- **THEN** it SHALL include a paragraph acknowledging that the AI may have rough initial thoughts to use as raw material, not a template to copy verbatim

#### Scenario: Quote skill HE updated
- **WHEN** the `quote` skill HE text is resolved
- **THEN** it SHALL include the Hebrew equivalent of the initial thoughts paragraph

### Requirement: Full thread context for repost
When the source tweet is part of a thread, the system SHALL fetch and pass the full thread context to the AI.

#### Scenario: Manual repost of thread tweet
- **WHEN** user submits a URL for a tweet that is part of a thread (self-reply chain)
- **THEN** the system SHALL fetch sibling tweets in the thread via the X API (up to 10 tweets)
- **AND** store the concatenated thread text in `ComposeState.sourceTweet.threadText`
- **AND** the thread text SHALL be passed to `buildRepostUserPrompt` as `threadText`

#### Scenario: Batch edit repost of thread tweet
- **WHEN** user clicks "Edit Repost" on a batch tweet that has `is_thread: 1`
- **THEN** the system SHALL query `twitter_tweets` for sibling tweets in the same `conversation_id`
- **AND** concatenate them in `thread_position` order as `threadText`

#### Scenario: Thread fetch fails gracefully
- **WHEN** the thread fetch fails (API error or timeout)
- **THEN** the system SHALL proceed with only the single tweet text (graceful fallback)
- **AND** the thread indicator SHALL still be shown in the compose header

### Requirement: Shared compose initialization function
The system SHALL provide an `enterComposeMode` function that initializes a compose session from any entry point (handwrite command, repost URL input, batch edit repost).

#### Scenario: Enter compose from handwrite command
- **WHEN** `enterComposeMode` is called with `mode: 'handwrite'`
- **THEN** a `ComposeState` SHALL be created with `mode: 'handwrite'`, `aiRefine: false`, `imageGen: false`, empty `tweets[]`
- **AND** a compose message SHALL be sent and its ID stored in `statusMessageId`
- **AND** chat state SHALL be updated with `awaiting_input: 'handwrite'`

#### Scenario: Enter compose from repost URL
- **WHEN** `enterComposeMode` is called with `mode: 'repost'` and `sourceTweet` data
- **THEN** a `ComposeState` SHALL be created with `mode: 'repost'`, `aiRefine: true`, `imageGen: false`, `sourceTweet` set
- **AND** the compose message SHALL include the source tweet header

#### Scenario: Enter compose from batch edit
- **WHEN** `enterComposeMode` is called with `mode: 'repost'`, `sourceTweet` from DB, and `batchTweetId`
- **THEN** a `ComposeState` SHALL be created with `batchTweetId` set
- **AND** a NEW compose message SHALL be sent (batch message untouched)

### Requirement: Repost draft links to source tweet
When a draft is created from a repost compose session, the draft SHALL store the original tweet reference.

#### Scenario: Draft created from repost pen down
- **WHEN** pen down creates a draft in repost mode
- **THEN** `draft.original_tweet_id` SHALL be set to `sourceTweet.tweetId`
- **AND** `draft.original_tweet_url` SHALL be set to `sourceTweet.tweetUrl`
- **AND** `draft.source` SHALL be `'repost'`

#### Scenario: Draft created from repost with batch tweet
- **WHEN** pen down creates a draft in repost mode with `batchTweetId` set
- **THEN** the `twitter_tweets` row matching `batchTweetId` SHALL have `status` updated to `'drafted'` and `draft_id` set
