## Context

The bot publishes tweets via X API v2. Quote tweets use the `quote_tweet_id` parameter, which returns 403 when the posting user isn't mentioned in or part of the conversation thread — an API restriction not enforced by the app UI. Additionally, the entire codebase assumes a 280-char tweet limit (AI prompts, parsing truncation, UI counters, video captions), but the current user has X Premium which allows longer tweets. These limits constrain content quality unnecessarily.

## Goals / Non-Goals

**Goals:**
- Quote tweet publishing succeeds even when `quote_tweet_id` is blocked by the API
- Remove all hardcoded 280-char enforcement so AI can generate richer content
- Keep changes minimal — just remove limits, don't add new configuration

**Non-Goals:**
- Adding user-configurable character limits (planned for future onboarding flow)
- Changing thread splitting logic or tweet count limits
- Supporting X's 25,000-char long-form posts (just removing the 280 floor)

## Decisions

### 1. Quote tweet fallback via URL embed

**Choice**: Catch 403 in `postQuoteTweet`, retry as a regular tweet with the original tweet URL appended to the text. Pass `originalTweetUrl` as an optional parameter.

**Why**: X auto-renders embedded tweet URLs as quote-tweet cards, producing the same visual result. The fallback is invisible to the user. Keeping it inside `postQuoteTweet` means the caller (`publish.ts`) only needs to pass the URL — no control flow changes.

**Alternative**: Always use URL-embed instead of `quote_tweet_id`. Rejected because `quote_tweet_id` produces a cleaner result when it works (proper API-level linkage, analytics tracking).

### 2. Remove 280-char limits entirely (no replacement constant)

**Choice**: Delete all `280` references — prompt constraints, `.substring(0, 280)` truncations, UI warning logic, video caption truncation. Don't replace with a higher number or configurable constant.

**Why**: The user has X Premium. Adding a configurable limit now would be premature — the plan is to add this during onboarding flow later. Simplest change is just removal.

**Affected locations** (20 references across 11 files):
- AI prompts: `gemini.ts` (3 prompt rules + 3 truncations), `quote.ts` (2 prompt constraints), `video.ts` (2 caption format hints)
- UI: `home.ts` (char counter display), `drafts.ts` (char counter), `compose.ts` (warning logic), `handwrite.ts` (warning logic)
- Publishing: `video-publish.ts` (caption truncation)
- Strings: `en.ts`, `he.ts` (exceeds280 message)
- Types: `types.ts` (comment only)

### 3. Keep AI response parsing flexible

**Choice**: Remove `.substring(0, 280)` from Gemini response parsing fallbacks but don't add a new limit. The AI will naturally produce reasonable-length tweets without the constraint. If a tweet is excessively long, X API will reject it at publish time (informing the user), which is the correct behavior.

## Risks / Trade-offs

- **AI may generate very long tweets**: Without the 280 constraint, Gemini might produce tweets that are too long even for Premium. Mitigation: X Premium supports ~4,000 chars for tweets, and the AI prompts still guide toward concise social media content by nature of the task. X API will reject anything over the actual limit.
- **URL-embed fallback adds ~23 chars**: The t.co-shortened URL takes space from the tweet text. Mitigation: with no 280-char limit, this is negligible.
