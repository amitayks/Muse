### Requirement: Single batch notification per poll cycle
After scoring, the poller SHALL send ONE Telegram message per poll cycle listing all scored tweets (above threshold) and auto-approved drafts. If no tweets pass scoring, no message SHALL be sent.

#### Scenario: Multiple scored tweets
- **WHEN** 5 tweets score above threshold across 3 accounts
- **THEN** ONE Telegram message SHALL be sent listing all 5

#### Scenario: No tweets above threshold
- **WHEN** all tweets score below their account thresholds
- **THEN** no notification SHALL be sent

### Requirement: Batch notification format
Each item in the batch message SHALL show: `@username (star score/10)`, tweet text as a clickable hyperlink (truncated to 80 characters), and inline action buttons. The format SHALL be HTML with proper escaping.

#### Scenario: Scored tweet item
- **WHEN** a tweet from @vercel scores 9/10
- **THEN** the item SHALL display: score emoji, `@vercel (⭐ 9/10)`, relevance reason in italic, and the tweet text as a hyperlink to the original tweet URL
- **AND** button row SHALL be: `[⚡ Fast]` `[✏️ Edit]`

#### Scenario: Auto-approved item
- **WHEN** an account has auto-approve and the tweet scores above threshold
- **THEN** the item SHALL display: `@anthropic (⭐ 9/10) ✅ Auto-approved`, tweet text as hyperlink
- **AND** button row SHALL be: `[✅ Generated]` linking to the draft

#### Scenario: Thread item
- **WHEN** a scored item is a thread (multiple tweets)
- **THEN** the display SHALL indicate it: `@vercel (⭐ 8/10) 🧵 Thread (4 tweets)`, tweet text as hyperlink

#### Scenario: Already drafted item
- **WHEN** a scored tweet has already been drafted (via fast generate or edit repost)
- **THEN** the button row SHALL be: `[✅ Generated]` linking to `draft:DRAFT_ID`

### Requirement: Generate button creates draft and edits message
When the user clicks [⚡ Fast] on a batch item, the system SHALL: generate the repost draft via AI with default settings, create the draft in the DB, update the `twitter_tweets` row, and edit the batch Telegram message in-place to replace the buttons with [✅ Generated].

#### Scenario: Fast Generate clicked
- **WHEN** user clicks [⚡ Fast] for tweet "123" in batch message
- **THEN** the system SHALL generate a draft using default repost settings, store it, update the tweet row, and edit the batch message to show the updated state

#### Scenario: Fast Generate callback format
- **WHEN** a Fast Generate button is rendered
- **THEN** its `callback_data` SHALL be `action:fast_gen:TWEET_ID`

### Requirement: Batch message ID tracking
Each `twitter_tweets` row that appears in a batch notification SHALL store the Telegram `batch_message_id` (the message_id returned from `sendMessage`). This enables the action handler to reconstruct and edit the correct message.

#### Scenario: Message ID stored
- **WHEN** a batch notification is sent and returns message_id 5432
- **THEN** all tweet rows in that batch SHALL have `batch_message_id=5432`

> **Note:** The separate [Open Tweet] URL button has been removed. Tweet text is now rendered as a clickable hyperlink in the batch notification message text, providing the same functionality inline.

### Requirement: Edit Repost opens compose session
When the user clicks [✏️ Edit] on a batch item, the system SHALL open a full compose session for that tweet using data already stored in `twitter_tweets`.

#### Scenario: Edit Repost callback format
- **WHEN** an Edit Repost button is rendered
- **THEN** its `callback_data` SHALL be `action:edit_rp:TWEET_ID`

#### Scenario: Edit Repost opens new message
- **WHEN** user clicks [✏️ Edit] for a tweet
- **THEN** a NEW compose message SHALL be sent (the batch message SHALL NOT be modified)
- **AND** the user SHALL enter compose mode with `mode: 'repost'` and the tweet data loaded from DB

### Requirement: Batch notification sent via poller worker
The batch notification SHALL be sent from the twitter-poller worker using the Telegram Bot API directly (`sendMessage` with `parse_mode: 'HTML'` and `inline_keyboard`). The poller SHALL use `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` from its env.

#### Scenario: Poller sends notification
- **WHEN** the polling cycle completes with scored tweets
- **THEN** the twitter-poller worker SHALL call the Telegram sendMessage API directly

### Requirement: Generate action handled by content-bot
The [⚡ Fast] and [✏️ Edit] button callbacks SHALL be handled by the existing content-bot worker (via Telegram webhook). The content-bot SHALL route `action:fast_gen:TWEET_ID` to the fast generate handler and `action:edit_rp:TWEET_ID` to the edit repost handler.

#### Scenario: Fast Generate action routing
- **WHEN** user clicks [⚡ Fast] and the Telegram webhook fires
- **THEN** the content-bot router SHALL dispatch `action:fast_gen:TWEET_ID` to the fast generate handler

#### Scenario: Edit Repost action routing
- **WHEN** user clicks [✏️ Edit] and the Telegram webhook fires
- **THEN** the content-bot router SHALL dispatch `action:edit_rp:TWEET_ID` to the edit repost handler
