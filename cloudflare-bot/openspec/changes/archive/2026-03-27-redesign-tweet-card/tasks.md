## 1. Font Replacement

- [x] 1.1 Download Rubik-Regular.ttf and Rubik-Bold.ttf from Google Fonts GitHub releases
- [x] 1.2 Upload Rubik-Regular.ttf to R2 at key `fonts/rubik-regular.ttf` (remote) and Rubik-Bold.ttf at `fonts/rubik-bold.ttf` (remote)
- [x] 1.3 Update `loadFonts()` in `tweet-card.ts` to read from `fonts/rubik-regular.ttf` and `fonts/rubik-bold.ttf` keys. Update font name in satori config from `'Inter'` to `'Rubik'`

## 2. Color & Constants Update

- [x] 2.1 Change `BG_COLOR` from `'#15202B'` to `'#000000'` in `tweet-card.ts`
- [x] 2.2 Change `SECONDARY_COLOR` from `'#8B98A5'` to `'#71767B'`
- [x] 2.3 Change `BORDER_COLOR` from `'#38444D'` to `'#333639'`
- [x] 2.4 Update `AVATAR_SIZE` from `48` to `40`, update `CARD_PADDING` to `16`, set `CARD_MAX_HEIGHT = 750`
- [x] 2.5 Remove `borderRadius: '16px'` and `border` from outer card container (real tweets don't have rounded card borders — the card IS the background)

## 3. RTL Detection

- [x] 3.1 Add `isRtlText(text: string): boolean` helper function that checks for Hebrew (U+0590–U+05FF) or Arabic (U+0600–U+06FF) characters
- [x] 3.2 Apply RTL direction: in all text containers where tweet text is rendered, conditionally set `direction: 'rtl'` and `textAlign: 'right'` based on `isRtlText()`

## 4. Verification Mark & Header Redesign

- [x] 4.1 Add a `VERIFIED_BADGE_SVG` constant: inline SVG data URI of the X/Twitter blue checkmark (small blue circle with white check path)
- [x] 4.2 Redesign header in `buildTweetCardElement`: single row with avatar (40px round) + display name (bold, white) + verified badge `img` (18px) + @username (secondary gray) — all on one line with `display: 'flex'`, `alignItems: 'center'`
- [x] 4.3 Apply same header redesign to `buildThreadCardElement` (first card in thread shows full header)
- [x] 4.4 Apply same header redesign to `renderQuoteTweetCard` (comment header + embedded original header)

## 5. Timestamp

- [x] 5.1 Add `timestamp` as a required field on `TweetCardData` interface (string, formatted)
- [x] 5.2 Add timestamp rendering element below tweet text in `buildTweetCardElement`: secondary gray text, fontSize 14px
- [x] 5.3 Add timestamp to `buildThreadCardElement` (on each card)
- [x] 5.4 Add timestamp to `renderQuoteTweetCard` (on the commenter's section)
- [x] 5.5 Update `generateTweetCardImages` in `publish.ts` to format and pass `timestamp` to all card render calls. Use `draft.created_at` or `new Date().toISOString()`, formatted as "H:MM AM/PM · Mon DD, YYYY"

## 6. Separator & Reaction Bar

- [x] 6.1 Add separator element: a `div` with `height: '1px'`, `backgroundColor: '#333639'`, `width: '100%'`, `marginTop: '12px'`, `marginBottom: '12px'` — placed below timestamp
- [x] 6.2 Create reaction bar SVG constants: 5 small SVG data URIs for comment, retweet, heart, bookmark, share icons (all in `#71767B`)
- [x] 6.3 Add reaction bar element: `display: 'flex'`, `justifyContent: 'space-between'`, 5 `img` elements (20px each) — placed below separator
- [x] 6.4 Apply separator + reaction bar to `buildThreadCardElement` and `renderQuoteTweetCard`

## 7. Aspect Ratio & Centering

- [x] 7.1 Update outer card container in `buildTweetCardElement`: set `minHeight: CARD_MIN_HEIGHT` (600), `maxHeight: CARD_MAX_HEIGHT` (750), `justifyContent: 'center'`, `alignItems: 'center'`
- [x] 7.2 Wrap tweet content (header + text + timestamp + separator + reactions) in an inner `div` with padding, so the outer container handles centering and the inner div holds the layout
- [x] 7.3 Apply same outer/inner structure to thread card wrapper in `renderThreadCards`
- [x] 7.4 Apply same outer/inner structure to quote tweet card in `renderQuoteTweetCard`

## 8. Profile Image Fix

- [x] 8.1 Update `getDefaultAvatarDataUri()` to return a visible default avatar SVG (dark gray circle `#2F3336` with white silhouette) instead of the current `#657786` circle that is invisible on black
- [x] 8.2 Verify `getProfileImageDataUri` fetch chain works: check that the Twitter profile image URL from `user.own_profile_image_url` is reachable, R2 cache works, and base64 encoding is correct for satori `img` elements

## 9. Story Image Update

- [x] 9.1 Update `createStoryImage` overlay color from `'rgba(10, 22, 40, 0.85)'` to `'rgba(0, 0, 0, 0.85)'` to match the new black theme

## 10. Cleanup & Deploy

- [x] 10.1 Remove old Inter font references from any comments or documentation in tweet-card.ts
- [x] 10.2 Delete stale tweet card images from R2 for any test drafts used during development (the old-format cached PNGs)
- [x] 10.3 Deploy with `wrangler deploy` and test end-to-end: create a new handwritten draft with Hebrew text, approve, publish to Instagram Post, verify the card image looks correct
