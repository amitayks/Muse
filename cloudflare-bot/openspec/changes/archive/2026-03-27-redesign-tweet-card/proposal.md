## Why

The tweet card renderer (`tweet-card.ts`) produces images for Instagram posts when drafts have no media, but the current output looks nothing like a real tweet. Hebrew text doesn't render at all (Inter font has no Hebrew glyphs), the background color is wrong, profile images aren't showing, and critical tweet elements are missing (verification mark, timestamp, reaction bar, RTL layout). These cards represent the brand on Instagram — they need to look authentic.

## What Changes

- **Replace font family**: Swap Inter (Latin-only) for Rubik (covers Latin + Hebrew + Arabic in one family). Upload regular + bold TTF weights to R2, update `loadFonts()`.
- **Fix background color**: Change `BG_COLOR` from `#15202B` (old Twitter blue-dark) to `#000000` (current X dark mode black). Update `SECONDARY_COLOR` to `#71767B` (actual X gray).
- **Redesign card layout to match real tweets**: Single header row with avatar + name + blue verification mark + @handle. Tweet text with RTL detection. Timestamp line. Separator. Reaction bar with 5 icons.
- **Add RTL support**: Detect Hebrew/Arabic characters in text and set `direction: 'rtl'` on text containers.
- **Enforce Instagram aspect ratio**: Set `minHeight: 600px` (1:1) and `maxHeight: 750px` (4:5) on card container. Vertically center tweet content within the card for consistent appearance.
- **Fix profile image rendering**: Ensure `getProfileImageDataUri` works end-to-end. Improve default avatar to be visible on black background.
- **Pass timestamp data to renderer**: `generateTweetCardImages` in `publish.ts` needs to pass the current time (or draft creation time) to the card renderer so it can display "HH:MM AM/PM · Mon DD, YYYY".
- **Apply redesign to all card types**: Single tweet, thread cards, and quote-tweet cards all get the same visual treatment (font, colors, RTL, aspect ratio, centered layout).

## Capabilities

### New Capabilities
- `tweet-card-rendering`: Covers the full tweet card visual design — layout structure, font loading, RTL detection, aspect ratio enforcement, color scheme, and all three card types (single, thread, quote-tweet).

### Modified Capabilities
<!-- No existing specs to modify — this is the first spec -->

## Impact

- **Files modified**:
  - `cloudflare-bot/src/services/tweet-card.ts` — Complete visual redesign of all card builder functions, constants, font loading, RTL detection
  - `cloudflare-bot/src/core/publish.ts` — Pass timestamp data to `TweetCardData` when calling render functions
- **R2 assets**: Replace `fonts/inter-regular.woff2` and `fonts/inter-bold.woff2` with Rubik TTF files (or rekey to `fonts/rubik-regular.ttf` / `fonts/rubik-bold.ttf`)
- **Cached images**: Existing tweet cards in R2 (`tweet-cards/{draftId}/`) were rendered with old design — will be served from cache until manually purged or draft is re-created
- **No API changes**: No changes to Instagram publish service, media routes, publish orchestration, or database schema
- **Dependencies**: No new npm packages — Rubik font is a TTF file loaded at runtime, same as Inter was
