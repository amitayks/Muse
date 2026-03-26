## ADDED Requirements

### Requirement: Font supports Hebrew and Latin
The system SHALL use a font family (Rubik) that covers Latin, Hebrew, and Cyrillic character sets. Both regular (400) and bold (700) weights SHALL be loaded from R2 storage as TTF files. The `loadFonts()` function SHALL read from `fonts/rubik-regular.ttf` and `fonts/rubik-bold.ttf` keys.

#### Scenario: Hebrew text renders correctly
- **WHEN** a tweet card is rendered with Hebrew text (e.g., "אני מסרב להאמין")
- **THEN** all Hebrew characters SHALL render as visible glyphs (no empty boxes or missing characters)

#### Scenario: Latin text renders correctly
- **WHEN** a tweet card is rendered with English text
- **THEN** all Latin characters SHALL render using the Rubik font

#### Scenario: Mixed Hebrew and Latin text
- **WHEN** a tweet card contains both Hebrew and Latin characters
- **THEN** both scripts SHALL render correctly within the same text block

### Requirement: Card background is pure black
The card background color SHALL be `#000000` (pure black), matching the current X/Twitter dark mode. The text color SHALL remain `#E7E9EA`. The secondary color (handles, timestamps) SHALL be `#71767B`.

#### Scenario: Card rendered with correct colors
- **WHEN** any tweet card type is rendered
- **THEN** the outer background SHALL be `#000000`, primary text SHALL be `#E7E9EA`, and secondary text SHALL be `#71767B`

### Requirement: Card header shows avatar, name, verification mark, and handle on one line
The card header SHALL display in a single horizontal row: round avatar image (40px), display name (bold, white), blue verification checkmark SVG, and @username (secondary gray). All elements SHALL be vertically center-aligned.

#### Scenario: Header layout for verified user
- **WHEN** a tweet card is rendered with displayName "Amitay Keisar" and username "AmKeisar"
- **THEN** the header SHALL show `[avatar] Amitay Keisar ✓ @AmKeisar` on one line with the blue check between name and handle

#### Scenario: Header with profile image available
- **WHEN** `profileImageUrl` is provided and accessible
- **THEN** the avatar SHALL display the user's actual profile image as a 40px round circle

#### Scenario: Header with no profile image
- **WHEN** `profileImageUrl` is null or the image fetch fails
- **THEN** the avatar SHALL display a default avatar (dark gray circle with white silhouette) that is visible against the black background

### Requirement: RTL text direction for Hebrew and Arabic
The system SHALL detect Hebrew (U+0590–U+05FF) or Arabic (U+0600–U+06FF) characters in tweet text and apply RTL direction to the text container. A helper function `isRtlText(text)` SHALL return true if the text contains any characters in these ranges.

#### Scenario: Hebrew tweet text
- **WHEN** tweet text contains Hebrew characters
- **THEN** the text container SHALL have `direction: 'rtl'` and `textAlign: 'right'`

#### Scenario: English tweet text
- **WHEN** tweet text contains only Latin characters
- **THEN** the text container SHALL have default LTR direction and left alignment

#### Scenario: Mixed direction text
- **WHEN** tweet text contains both Hebrew and Latin characters
- **THEN** the text container SHALL use RTL direction (Hebrew as primary direction)

### Requirement: Timestamp displayed below tweet text
Each card SHALL display a timestamp in the format "H:MM AM/PM · Mon DD, YYYY" in secondary gray below the tweet text. The timestamp data SHALL be passed via the `TweetCardData.timestamp` field.

#### Scenario: Timestamp rendering
- **WHEN** a tweet card is rendered with timestamp data
- **THEN** a line below the text SHALL show the formatted time (e.g., "9:08 PM · Mar 26, 2026") in `#71767B`

#### Scenario: No timestamp provided
- **WHEN** `timestamp` is undefined or null
- **THEN** the timestamp line SHALL be omitted (no empty space)

### Requirement: Separator line between text and reactions
A thin horizontal line SHALL appear between the timestamp and the reaction bar. The line color SHALL be `#333639`.

#### Scenario: Separator renders
- **WHEN** a tweet card is rendered
- **THEN** a 1px horizontal line in `#333639` SHALL appear below the timestamp, spanning the full content width

### Requirement: Reaction bar with 5 icons
The card SHALL display a reaction bar at the bottom with 5 evenly spaced icons: comment (💬), retweet (🔁), heart (❤️), bookmark (🔖), and share (📤). Icons SHALL be rendered as SVG data URIs in secondary gray (`#71767B`). The bar is decorative only — no counts are displayed.

#### Scenario: Reaction bar layout
- **WHEN** a tweet card is rendered
- **THEN** 5 reaction icons SHALL appear in a horizontal row with equal spacing, all in `#71767B` gray

### Requirement: Card aspect ratio within Instagram limits
The outer card container SHALL have `minHeight: 600px` (1:1 with CARD_WIDTH) and `maxHeight: 750px` (4:5 ratio). Tweet content SHALL be vertically centered within the container using `justifyContent: 'center'`.

#### Scenario: Short tweet card
- **WHEN** tweet text is short (renders less than 600px natural height)
- **THEN** the card SHALL be 600px tall with the tweet content vertically centered

#### Scenario: Long tweet card
- **WHEN** tweet text is long (would render more than 750px natural height)
- **THEN** the card SHALL cap at 750px tall with content starting from the top

#### Scenario: Medium tweet card
- **WHEN** tweet text renders between 600px and 750px natural height
- **THEN** the card SHALL render at its natural height with content vertically centered

### Requirement: Thread cards share the same visual redesign
Thread cards (for multi-tweet drafts rendered as carousel items) SHALL use the same visual design: black background, Rubik font, RTL detection, header layout, timestamp, separator, reaction bar, and aspect ratio enforcement. Thread cards SHALL retain their connecting-line indicator between avatar positions to show thread continuity.

#### Scenario: Thread card visual consistency
- **WHEN** a thread of 3 tweets is rendered
- **THEN** each card SHALL have the redesigned layout (header, text, timestamp, separator, reactions) with connecting lines between avatars on non-first/non-last cards

### Requirement: Quote tweet cards share the same visual redesign
Quote tweet cards SHALL use the same visual design for the outer tweet (commenter's tweet). The embedded original tweet box SHALL retain its bordered appearance but adopt the updated colors (black background, `#333639` border, same text colors).

#### Scenario: Quote tweet card visual consistency
- **WHEN** a quote tweet card is rendered
- **THEN** the commenter section SHALL have the full redesigned layout and the embedded original tweet SHALL use updated colors with a `#333639` border

### Requirement: Emoji rendering preserved
The existing emoji rendering system (Twemoji CDN → SVG → inline images) SHALL continue to work. The `textWithEmojis()` function and `resolveEmojiUrls()` function SHALL remain unchanged. All text containers with emoji children SHALL have `display: 'flex'` and `flexWrap: 'wrap'` for satori compatibility.

#### Scenario: Tweet with emojis
- **WHEN** tweet text contains emoji characters
- **THEN** emojis SHALL render as Twemoji SVG images inline with text, properly aligned

### Requirement: Publish pipeline passes timestamp to renderer
The `generateTweetCardImages` function in `publish.ts` SHALL pass timestamp data to `TweetCardData` when calling `renderTweetCard`, `renderThreadCards`, and `renderQuoteTweetCard`. The timestamp SHALL be derived from `draft.created_at` or the current time if unavailable.

#### Scenario: Timestamp passed for single tweet
- **WHEN** `generateTweetCardImages` renders a single tweet card
- **THEN** the `TweetCardData` object SHALL include a `timestamp` string formatted as "H:MM AM/PM · Mon DD, YYYY"

#### Scenario: Timestamp passed for thread
- **WHEN** `generateTweetCardImages` renders thread cards
- **THEN** each `TweetCardData` in the thread array SHALL include a `timestamp` string
