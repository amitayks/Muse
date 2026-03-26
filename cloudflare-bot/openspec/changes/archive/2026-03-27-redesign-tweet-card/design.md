## Context

The tweet card renderer (`cloudflare-bot/src/services/tweet-card.ts`) generates PNG images that look like tweets for Instagram publishing. It runs in Cloudflare Workers using Satori (JSX object tree → SVG) and resvg-wasm (SVG → PNG). The current implementation is visually far from a real X/Twitter dark-mode tweet: wrong background color, no Hebrew/RTL support, missing tweet elements (verification mark, timestamp, reaction bar), and broken profile images.

The card renderer is called from `cloudflare-bot/src/core/publish.ts` → `generateTweetCardImages()` whenever a draft has no attached media and Instagram Post is a publish target. Cards are cached in R2 at `tweet-cards/{draftId}/{index}.png`.

Current data flow:
```
publishToIGPost → generateTweetCardImages → renderTweetCard/renderThreadCards/renderQuoteTweetCard
                                           → satori(element, {width, fonts})
                                           → new Resvg(svg).render().asPng()
                                           → storeTweetCard (R2)
                                           → return public URL
```

Three card types exist:
1. **Single tweet** — `buildTweetCardElement` → `renderTweetCard`
2. **Thread** (carousel) — `buildThreadCardElement` × N → `renderThreadCards`
3. **Quote tweet** — inline in `renderQuoteTweetCard`

All three share the same constants (`BG_COLOR`, `TEXT_COLOR`, etc.) and font loading.

## Goals / Non-Goals

**Goals:**
- Cards look like authentic X/Twitter dark-mode tweets at a glance
- Hebrew and Arabic text renders correctly with proper RTL direction
- All cards meet Instagram's aspect ratio requirements (between 4:5 and 1.91:1)
- Tweet content is vertically centered for consistent visual weight
- Profile images render reliably with a visible fallback

**Non-Goals:**
- Pixel-perfect Twitter replica (we're going for "looks like a tweet", not exact clone)
- Supporting all Unicode scripts (Hebrew + Arabic + Latin covers the user's needs)
- Dynamic reaction counts (the reaction bar is decorative — shows icons only, no numbers)
- Changing the Instagram publish pipeline, media serving, or R2 caching patterns
- Modifying the story image generator (`createStoryImage`) beyond inherited color changes

## Decisions

### 1. Font: Rubik (regular + bold)

**Decision**: Use Rubik font family, which covers Latin, Hebrew, and Cyrillic in a single font file.

**Alternatives considered**:
- *Noto Sans + Noto Sans Hebrew* — Two separate font files, more complex loading, larger total size
- *Heebo* — Hebrew-focused but weaker Latin glyphs
- *Inter + Hebrew fallback* — Requires font fallback logic in satori, adds complexity

**Rationale**: Rubik is a Google Font designed by Hubert & Fischer with native Hebrew support. Both weights (regular 400, bold 700) are ~150KB TTF each. Satori accepts multiple fonts but using one family simplifies everything. Rubik's geometric style is visually similar to Twitter's Chirp font.

**R2 key mapping**: Replace existing keys to avoid changing `loadFonts()` key logic:
- `fonts/inter-regular.woff2` → upload Rubik-Regular.ttf (key stays the same, content changes)
- `fonts/inter-bold.woff2` → upload Rubik-Bold.ttf (key stays the same, content changes)

Alternatively, rename keys to `fonts/rubik-regular.ttf` and `fonts/rubik-bold.ttf` and update `loadFonts()`. Cleaner, small code change.

### 2. Card layout structure

**Decision**: Restructure all card element builders to match this visual hierarchy:

```
┌─────────────────────────────────────────────────┐
│ (vertical centering wrapper)                     │
│                                                  │
│  ┌──────────────────────────────────────────┐    │
│  │ [avatar 40px]  Name ✓  @handle           │    │
│  │                                          │    │
│  │  Tweet text here, RTL if needed ←        │    │
│  │  wraps naturally with line breaks        │    │
│  │                                          │    │
│  │  9:08 PM · Mar 26, 2026                  │    │
│  │  ────────────────────────────────────    │    │
│  │  💬      🔁      ❤️      🔖      📤    │    │
│  └──────────────────────────────────────────┘    │
│                                                  │
└─────────────────────────────────────────────────┘
```

Outer container: `display: flex`, `flexDirection: column`, `justifyContent: center`, `alignItems: center`, background black, `minHeight: 600`, `maxHeight: 750`.

Inner card: `display: flex`, `flexDirection: column`, holds all tweet elements with padding.

### 3. RTL detection

**Decision**: Simple regex check — if text contains characters in Hebrew range (U+0590–U+05FF) or Arabic range (U+0600–U+06FF), set `direction: 'rtl'` and `textAlign: 'right'` on the text container.

**Implementation**: A helper function `isRtlText(text: string): boolean` using `/[\u0590-\u05FF\u0600-\u06FF]/`. Applied to each text div in all three card types.

### 4. Verification mark

**Decision**: Render the X/Twitter blue check as an inline SVG data URI (small blue circle with white checkmark). Placed after the display name in the header row.

Not fetched from Twitter API — it's a static decorative element. All cards get the mark since these are the user's own tweets being converted.

### 5. Reaction bar

**Decision**: Use simple SVG icons for the 5 reaction types (comment, retweet, heart, bookmark, share). Icons are decorative only — no counts. Rendered as data URI `img` elements in a flex row with `justifyContent: space-between`.

The SVG paths are small string constants defined inline. Colors match X's secondary gray (`#71767B`).

### 6. Timestamp

**Decision**: Add `timestamp` field to `TweetCardData` interface. `generateTweetCardImages` passes `draft.created_at` (or current time). Format: "H:MM AM/PM · Mon DD, YYYY" matching Twitter's format. Rendered in secondary gray below the tweet text.

### 7. Aspect ratio enforcement

**Decision**: Outer container has `minHeight: 600` and `maxHeight: 750` with `justifyContent: center`. This ensures:
- Short tweets get padded to 1:1 (600×600) — valid for Instagram
- Long tweets cap at 4:5 (600×750) — valid for Instagram
- Content is always vertically centered

For very long text that exceeds 750px, satori will still render but the content gets clipped visually by the max height. This is acceptable — very long tweets are rare and the card still looks clean.

### 8. Profile image fallback

**Decision**: Keep the existing `getProfileImageDataUri` fetch chain but improve the default avatar to be visible on black background (current gray circle is nearly invisible on dark backgrounds). New default: a dark gray circle with a white silhouette icon, similar to Twitter's default avatar.

## Risks / Trade-offs

- **[Risk] Rubik font rendering differences** — Rubik is not identical to Inter or Twitter's Chirp. Text may look slightly different. → Acceptable trade-off for Hebrew support.
- **[Risk] maxHeight clipping very long tweets** — Content beyond 750px height is clipped. → Rare case. Could truncate text with "..." in future if needed.
- **[Risk] Cached old cards in R2** — Previously rendered cards won't get the new design. → Cards are only generated once per draft. New drafts get new cards. Old ones can be manually purged if needed.
- **[Risk] Profile image URLs expire** — Twitter profile image URLs may become unreachable over time. → The R2 cache layer mitigates this. Once fetched, the image is stored permanently. The improved default avatar handles the fallback case gracefully.
- **[Risk] Satori `display: flex` requirement** — Satori v0.25+ requires explicit `display` on divs with multiple children. → Already fixed in prior session. All new elements must include `display: 'flex'`.
