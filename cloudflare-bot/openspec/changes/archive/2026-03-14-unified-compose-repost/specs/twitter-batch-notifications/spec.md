## MODIFIED Requirements

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

### Requirement: Edit Repost opens compose session
When the user clicks [✏️ Edit] on a batch item, the system SHALL open a full compose session for that tweet using data already stored in `twitter_tweets`.

#### Scenario: Edit Repost callback format
- **WHEN** an Edit Repost button is rendered
- **THEN** its `callback_data` SHALL be `action:edit_rp:TWEET_ID`

#### Scenario: Edit Repost opens new message
- **WHEN** user clicks [✏️ Edit] for a tweet
- **THEN** a NEW compose message SHALL be sent (the batch message SHALL NOT be modified)
- **AND** the user SHALL enter compose mode with `mode: 'repost'` and the tweet data loaded from DB

## REMOVED Requirements

### Requirement: Open Tweet button
**Reason**: Replaced by embedding the tweet text as a clickable hyperlink in the batch notification message text. The separate `[🔗 Open]` URL button is no longer needed.
**Migration**: Remove the URL button from `buildBatchPage`. The tweet text hyperlink provides the same functionality inline.
