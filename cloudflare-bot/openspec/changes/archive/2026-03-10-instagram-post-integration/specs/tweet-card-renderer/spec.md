## ADDED Requirements

### Requirement: Tweet card image rendering
The system SHALL provide a function `renderTweetCard(tweetData)` in `services/tweet-card.ts` that renders a single tweet as a styled PNG image using Satori (JSX→SVG) and resvg-wasm (SVG→PNG).

#### Scenario: Render single tweet card
- **WHEN** `renderTweetCard()` is called with tweet text, author username, display name, and profile image
- **THEN** it SHALL produce a PNG image (1080px wide) styled to resemble a tweet card
- **AND** the image SHALL include: profile avatar (48×48 circle), display name (bold), @username (gray), tweet text (wrapped, multi-line), and a subtle card background

#### Scenario: Render tweet card without profile image
- **WHEN** `renderTweetCard()` is called and no profile image is available
- **THEN** it SHALL render a placeholder avatar (colored circle with first letter of display name)

#### Scenario: Tweet text with emoji
- **WHEN** the tweet text contains Unicode emoji characters
- **THEN** the system SHALL replace each emoji with a Twemoji SVG `<img>` element before passing to Satori
- **AND** the rendered emoji SHALL be visually correct and consistent

### Requirement: Thread card rendering with connecting line
The system SHALL provide a function `renderThreadCards(tweets, authorData)` that renders multiple tweets as individual card images with visual connecting lines between avatars.

#### Scenario: Render 3-tweet thread
- **WHEN** `renderThreadCards()` is called with 3 tweets from the same author
- **THEN** it SHALL produce 3 PNG images
- **AND** the first and middle tweet cards SHALL include a vertical connecting line extending below the avatar
- **AND** the last tweet card SHALL NOT have a connecting line below the avatar
- **AND** the second and third cards SHALL have a connecting line extending above the avatar to connect with the previous card

#### Scenario: Single tweet passed as thread
- **WHEN** `renderThreadCards()` is called with 1 tweet
- **THEN** it SHALL produce 1 PNG image without connecting lines (same as `renderTweetCard()`)

### Requirement: Quote-tweet card rendering
The system SHALL render quote-tweet (repost) cards that include the user's commentary text above an embedded card showing the original tweet.

#### Scenario: Render repost card
- **WHEN** `renderTweetCard()` is called for a repost draft with `original_tweet_url` and original author data
- **THEN** the image SHALL show: the user's tweet text at top, followed by an embedded/indented card containing the original author's avatar, username, and tweet text
- **AND** the embedded card SHALL have a visible border or background to distinguish it

#### Scenario: Repost card with original author profile image
- **WHEN** the original author's profile image URL is available (from `twitter_tweets.author_profile_image_url` or `persona_cache.profile_image_url`)
- **THEN** the embedded card SHALL display the original author's profile image as a circle avatar

### Requirement: Font loading for Satori
The system SHALL load font files from R2 for Satori text rendering. At minimum, Inter Regular and Inter Bold in WOFF2 format.

#### Scenario: Font files loaded from R2
- **WHEN** `renderTweetCard()` is called
- **THEN** it SHALL load font files from R2 keys `fonts/inter-regular.woff2` and `fonts/inter-bold.woff2`
- **AND** pass them to Satori as `ArrayBuffer` font data

#### Scenario: Font file not found in R2
- **WHEN** a font file is not found in R2
- **THEN** the system SHALL throw an error indicating fonts need to be uploaded to R2

### Requirement: Twemoji replacement
The system SHALL provide a function `replaceEmojisWithImages(text)` that replaces Unicode emoji characters with Twemoji SVG image references.

#### Scenario: Replace common emoji
- **WHEN** text contains "Great work 🔥👀"
- **THEN** the function SHALL return the text with `🔥` and `👀` replaced by `<img>` elements referencing their Twemoji SVG codepoints

#### Scenario: Text without emoji
- **WHEN** text contains no emoji characters
- **THEN** the function SHALL return the text unchanged

#### Scenario: Emoji SVG source
- **WHEN** an emoji is replaced
- **THEN** the `<img>` src SHALL reference R2-cached Twemoji SVGs at `emoji/{codepoint}.svg`, falling back to jsDelivr CDN if not cached

### Requirement: Tweet card storage in R2
Rendered tweet card images SHALL be stored in R2 for reuse (e.g., re-publish from published state).

#### Scenario: Store rendered cards
- **WHEN** tweet cards are rendered for a draft
- **THEN** they SHALL be stored in R2 at `tweet-cards/{draftId}/{tweetIndex}.png`

#### Scenario: Reuse existing cards
- **WHEN** tweet cards for a draft already exist in R2
- **THEN** the system SHALL use the existing images instead of re-rendering

### Requirement: Story image with blurred background
The system SHALL provide a function `createStoryImage(imageBuffer, width, height)` that creates a 1080×1920 (9:16) image with the original image centered on a blurred version of itself.

#### Scenario: Landscape image converted to story format
- **WHEN** `createStoryImage()` is called with a 1200×800 landscape image
- **THEN** it SHALL produce a 1080×1920 PNG
- **AND** the background SHALL be the original image scaled to fill 1080×1920 with a heavy blur effect
- **AND** the original image SHALL be centered at its native aspect ratio on top of the blurred background

#### Scenario: Square image converted to story format
- **WHEN** `createStoryImage()` is called with a 1080×1080 square image
- **THEN** the original SHALL be centered vertically with blurred bars above and below

#### Scenario: Already 9:16 image
- **WHEN** `createStoryImage()` is called with an image that is already approximately 9:16
- **THEN** it SHALL still apply the treatment (no skip logic needed — the result is visually identical)

### Requirement: Profile image caching in R2
The system SHALL download and cache author profile images in R2 for tweet card rendering.

#### Scenario: Cache profile image on first use
- **WHEN** a tweet card needs a profile image and it's not cached in R2
- **THEN** the system SHALL download the image from the stored URL, resize to 96×96, and store in R2 at `profiles/{username}.jpg`

#### Scenario: Use cached profile image
- **WHEN** a tweet card needs a profile image and `profiles/{username}.jpg` exists in R2
- **THEN** the system SHALL use the cached version without re-downloading

#### Scenario: Profile image URL is invalid or expired
- **WHEN** the profile image URL cannot be fetched (404, expired CDN link)
- **THEN** the system SHALL fall back to the placeholder avatar
