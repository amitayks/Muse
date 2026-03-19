## Why

Two issues: (1) X API returns 403 on `quote_tweet_id` for posts where the user isn't mentioned/in the thread, even though the app UI allows quoting freely — this blocks repost publishing. (2) The 280-char tweet limit is hardcoded everywhere (AI prompts, validation, truncation, UI), but it only applies to non-paying X users. The current user has X Premium, so these limits are unnecessary and constrain content quality.

## What Changes

- Add URL-embed fallback in `postQuoteTweet`: on 403, retry as a regular tweet with the original tweet URL appended (X renders it as a quote card automatically)
- Remove all 280-char enforcement: AI prompt instructions, text truncation in parsing, character warnings in compose UI, display counters, video caption truncation
- Keep the infrastructure flexible for re-adding configurable limits later (just remove the hardcoded values, don't add new config yet)

## Capabilities

### New Capabilities

_(none — this modifies existing capabilities)_

### Modified Capabilities

- `publish-pipeline`: Quote tweet publishing falls back to URL-embed when API returns 403
- `skill-prompt-architecture`: Remove 280-char constraints from all AI prompts (content generation, refinement, quote skill, video script)
- `compose-instruction`: Remove 280-char warnings from compose preview UI
- `video-publish-pipeline`: Remove 280-char truncation from video tweet captions

## Impact

- **Files**: `integrations/x.ts`, `core/publish.ts`, `ai/gemini.ts`, `skills/quote.ts`, `skills/video.ts`, `views/home.ts`, `views/drafts.ts`, `inputs/handwrite.ts`, `actions/compose.ts`, `services/video-publish.ts`, `ui/strings/en.ts`, `ui/strings/he.ts`, `types.ts`
- **No DB changes**
- **No breaking changes** — content may now be longer than 280 chars, which X Premium supports
