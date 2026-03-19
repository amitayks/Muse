## MODIFIED Requirements

### Requirement: Batch notification format
Each item in the batch message SHALL show: `@username (star score/10)`, tweet text as a clickable hyperlink (truncated to 80 characters), and inline action buttons. The format SHALL be HTML with proper escaping. The `relevance_reason` SHALL NOT be displayed in the notification — it is internal AI context only.

#### Scenario: Scored tweet item
- **WHEN** a tweet from @vercel scores 9/10
- **THEN** the item SHALL display: score emoji, `@vercel (⭐ 9/10)`, and the tweet text as a hyperlink to the original tweet URL
- **AND** the `relevance_reason` SHALL NOT appear in the message
- **AND** button row SHALL be: `[⚡ Fast]` `[✏️ Edit]`

#### Scenario: Auto-approved item
- **WHEN** an account has auto-approve and the tweet scores above threshold
- **THEN** the item SHALL display: `@anthropic (⭐ 9/10) ✅ Auto-approved`, tweet text as hyperlink
- **AND** the `relevance_reason` SHALL NOT appear in the message
- **AND** button row SHALL be: `[✅ Generated]` linking to the draft

#### Scenario: Thread item
- **WHEN** a scored item is a thread (multiple tweets)
- **THEN** the display SHALL indicate it: `@vercel (⭐ 8/10) 🧵 Thread (4 tweets)`, tweet text as hyperlink
- **AND** the `relevance_reason` SHALL NOT appear in the message

#### Scenario: Already drafted item
- **WHEN** a scored tweet has already been drafted (via fast generate or edit repost)
- **THEN** the button row SHALL be: `[✅ Generated]` linking to `draft:DRAFT_ID`
