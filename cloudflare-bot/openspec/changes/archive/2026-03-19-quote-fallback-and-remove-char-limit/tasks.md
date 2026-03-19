## 1. Quote Tweet Fallback

- [x] 1.1 Update `integrations/x.ts:postQuoteTweet` — add `originalTweetUrl` to options, catch 403, retry as regular tweet with URL appended to text
- [x] 1.2 Update `core/publish.ts` — pass `draft.original_tweet_url` to `postQuoteTweet`

## 2. Remove 280-char from AI Prompts (gemini.ts inline instructions)

- [x] 2.1 Remove RULES block appended in `refineContent` (lines 334-341): 280 char rule, imagePrompt rule, valid JSON
- [x] 2.2 Remove `langInstruction` from `refineContent` (line 327) and its usage in user prompts (lines 346-350)
- [x] 2.3 Remove `buildHandwriteRules` function entirely (lines 575-621) and its usage in `refineHandwrittenContent` (line 558)
- [x] 2.4 Remove `**Language:**` instruction from `buildContentPrompt` (line 678)
- [x] 2.5 Remove `Remember:` closing with 280 chars/JSON/imagePrompt from `buildContentPrompt` (line 680)
- [x] 2.6 Remove `'Respond with valid JSON only.'` from `generateVideoScript` (line 772)
- [x] 2.7 Remove `- Language:` setting from `repost-prompt.ts` (line 39)

## 3. Remove 280-char from Skill Prompts

- [x] 3.1 Update `skills/quote.ts` — remove "<=280 characters" from English (line 64) and Hebrew (line 133)
- [x] 3.2 Update `skills/video.ts` — remove "max 280 chars" from English twitterCaption format (line 105) and Hebrew (line 222)

## 4. Remove 280-char Truncation in Parsing

- [x] 4.1 Remove `.substring(0, 280)` from `parseContentResponse` fallback (line 257)
- [x] 4.2 Remove `.substring(0, 280)` from parsed tweet mapping (line 273)
- [x] 4.3 Remove `.substring(0, 280)` from JSON parse error fallback (line 299)
- [x] 4.4 Remove 280-char truncation from video `twitterCaption` (line 843)

## 5. Remove 280-char UI Warnings

- [x] 5.1 Update `views/home.ts` — remove `len/280` counter and `over` warning from compose preview (lines 241-270)
- [x] 5.2 Update `views/drafts.ts` — remove `(N/280)` counter from tweet display (line 238)
- [x] 5.3 Update `actions/compose.ts` — remove 280-char warning logic from `charWarnings` (line 590)
- [x] 5.4 Update `inputs/handwrite.ts` — remove 280-char warning logic from `charWarnings` (line 97)
- [x] 5.5 Remove `exceeds280` string from `ui/strings/en.ts` and `ui/strings/he.ts`

## 6. Remove 280-char from Publishing

- [x] 6.1 Update `services/video-publish.ts` — remove `.substring(0, 280)` from tweet caption (line 159)
- [x] 6.2 Update `types.ts` — remove "max 280 chars" comment from `twitterCaption` field (line 368)

## 7. Fix generateContent image-gen attachment

- [x] 7.1 Update `ai/gemini.ts:generateContent` — pass `attachImageGen` to `assembleSystemInstruction` when image generation is requested

## 8. Deploy & Verify

- [ ] 8.1 Deploy to Cloudflare Workers
- [ ] 8.2 Test repost publish on a post that previously returned 403
- [ ] 8.3 Verify AI generates content without 280-char truncation
