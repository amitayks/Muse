## 1. Database Schema & Types

- [x] 1.1 Create migration `008_instagram_publish.sql` with all new columns: `publish_targets`, `publish_results`, `has_video` on `drafts`; `default_publish_targets`, `own_profile_image_url`, `own_username_x`, `own_display_name_x`, `instagram_token_enc`, `instagram_account_id_enc`, `has_instagram` on `users`; `author_profile_image_url`, `author_display_name` on `twitter_tweets`; `profile_image_url` on `twitter_accounts` and `persona_cache`
- [x] 1.2 Update `schema.sql` to include all new columns and fix instagram column gap on users table
- [x] 1.3 Add new TypeScript types to `types.ts`: `PublishTargets`, `PublishResults`, `TweetMedia` interfaces. Update `Draft` interface with `publish_targets`, `publish_results`, `has_video`. Update `Tweet` interface — replace `mediaKey`/`mediaType` with `media?: TweetMedia[]`. Update `User` with `default_publish_targets`, `own_profile_image_url`, `own_username_x`, `own_display_name_x`. Update `TwitterTweet` with `author_profile_image_url`, `author_display_name`. Update `TwitterAccount` and `PersonaCache` with `profile_image_url`. Simplify `Published` interface (remove `tweet_ids`, `tweet_url`, `image_url`). Update `PublishResult` interface to `{ success: boolean, results: PublishResults }`
- [x] 1.4 Update `draft-db.ts`: modify `createDraft()` to accept and store `publish_targets` (defaulting from user's `default_publish_targets`). Add `updateDraftPublishTargets()` and `updateDraftPublishResults()` functions. Ensure `getDraft()` and all draft query functions return new columns
- [x] 1.5 Update `user-db.ts`: add functions to read/write `default_publish_targets`, `own_profile_image_url`, `own_username_x`, `own_display_name_x`. Ensure `getUser()` returns new columns
- [x] 1.6 Update `createPublished()` in `draft-db.ts` to write simplified published records (only id, chat_id, draft_id, pr_number, published_at). Remove tweet_ids/tweet_url/image_url from insert

## 2. Profile Image Storage

- [x] 2.1 Update poller (`services/poller.ts`): add `profile_image_url` to `user.fields` in X API requests. Store `author_profile_image_url` and `author_display_name` on `twitter_tweets` rows when inserting
- [x] 2.2 Update manual repost flow (`inputs/repost-url.ts`): include `author_profile_image_url` in `repost_preview` context when fetching tweet. Add `profile_image_url` to user.fields in `getTweetById()` call
- [x] 2.3 Update persona generation (`ai/repost-generate.ts` or persona flow): store `profile_image_url` on `persona_cache` when generating persona for non-followed accounts
- [x] 2.4 Update account add/bootstrap flows: store `profile_image_url` on `twitter_accounts` when adding or bootstrapping an account
- [x] 2.5 Update identity analysis (`ai/identity.ts`): when calling `/2/users/me`, store `own_profile_image_url`, `own_username_x`, `own_display_name_x` on the `users` table

## 3. Tweet Card Renderer

- [x] 3.1 Install `satori` and `@resvg/resvg-wasm` packages. Configure for Cloudflare Workers (Wasm imports)
- [x] 3.2 Upload Inter font files (regular + bold WOFF2) to R2 at `fonts/inter-regular.woff2` and `fonts/inter-bold.woff2`. Create a setup script or document the one-time upload process
- [x] 3.3 Implement Twemoji emoji replacement function `replaceEmojisWithImages(text)` in `services/tweet-card.ts`. Detect Unicode emoji codepoints, replace with `<img>` elements referencing R2-cached SVGs or jsDelivr CDN fallback
- [x] 3.4 Implement profile image caching: `getProfileImage(env, username, url)` that checks R2 at `profiles/{username}.jpg`, downloads and caches if missing, returns buffer for Satori rendering
- [x] 3.5 Implement `renderTweetCard(tweetData)` in `services/tweet-card.ts`: load fonts from R2, build JSX-like element tree (avatar circle, display name, @username, tweet text with emoji replacement), render via Satori to SVG, convert to PNG via resvg-wasm
- [x] 3.6 Implement `renderThreadCards(tweets, authorData)` that renders multiple tweet cards with vertical connecting lines between avatars. First/middle cards have line below, middle/last cards have line above
- [x] 3.7 Implement quote-tweet card variant: user's commentary text at top, embedded/bordered card below with original author's avatar, username, and tweet text
- [x] 3.8 Implement `createStoryImage(imageBuffer, width, height)` that creates a 1080×1920 image with the original centered on a blurred version of itself. Use Satori to compose the SVG with background blur and centered foreground, render to PNG via resvg
- [x] 3.9 Add R2 storage for rendered tweet cards at `tweet-cards/{draftId}/{index}.png` with check-before-render logic to reuse existing cards

## 4. Instagram Publishing Service

- [x] 4.1 Create `services/instagram-publish.ts` with `publishToInstagramPost(env, imageUrl, caption)` function: create container, poll status, publish. Include caption trimming to 2200 chars
- [x] 4.2 Implement `publishToInstagramCarousel(env, imageUrls, caption)`: create child containers for each image, create carousel container with children array, publish. Handle partial child failures (skip failed, fallback to single if <2 succeed). Cap at 10 images
- [x] 4.3 Implement `publishToInstagramStory(env, imageUrl)`: create container with `media_type: STORIES`, poll, publish. Return `{ post_id, url: null }`
- [x] 4.4 Extend `/media/{key}` route in `routes/media.ts` to serve image files (PNG, JPEG) in addition to videos, with correct Content-Type headers

## 5. Multi-Platform Publish Pipeline

- [x] 5.1 Refactor `core/publish.ts` `publishDraft()` to read `publish_targets` from draft, orchestrate per-platform publishing with independent try/catch blocks, collect `PublishResults`
- [x] 5.2 Implement X publishing branch within refactored `publishDraft()`: existing quote-tweet and thread posting logic, stores results in `results.x`
- [x] 5.3 Implement Instagram Post branch: check for existing images/media → if none, generate tweet cards → determine single vs carousel → call appropriate Instagram publish function → store results in `results.instagram_post`
- [x] 5.4 Implement Instagram Story branch: prepare 9:16 image (blurred background treatment on existing image, or first tweet card) → call story publish → store results in `results.instagram_story`
- [x] 5.5 Implement Instagram Reel branch: guard on `has_video`, call existing `publishVideoToInstagram()` → store results in `results.instagram_reel`
- [x] 5.6 Implement multi-tweet text combining for Instagram captions: join tweet texts with `\n\n`, trim to 2200 characters
- [x] 5.7 Implement status transition logic: any success → `published`, all fail → stay `approved` (or move from `scheduled` to `approved`). Store `publish_results` on draft. Create simplified published record
- [x] 5.8 Update all callers of `publishDraft()` (publish action, publish-all, cron) to handle the new `{ success: boolean, results: PublishResults }` return type

## 6. Publish Targets UI — Platform Toggle

- [x] 6.1 Create platform toggle action handler (`actions/platform-toggle.ts`): handle callbacks `plat:toggle:{platform}:{draftId}`, enforce mutual exclusivity (post ↔ reel), enforce at-least-one-target, update DB, re-render
- [x] 6.2 Create platform toggle view renderer: function that builds the toggle button rows (X ✓, Post, Story, Reel conditionally) with Done button. Accept current `PublishTargets` and `has_video` and `has_instagram` as inputs
- [x] 6.3 Update `renderDraftDetail()` in `views/drafts.ts`: add "Publish targets:" header line showing selected platforms with emoji badges. Add 🎯 Plat button to action rows for draft/approved/scheduled statuses
- [x] 6.4 Register platform toggle callbacks in the webhook router (`routes/webhook.ts`): route `plat:toggle:*` and `plat:done:*` callbacks to the platform toggle action handler
- [x] 6.5 Update `renderDraftDetail()` for published status: show per-platform results with ✅/❌ indicators, URL buttons for successful platforms, error messages for failed ones, 🔄 Repost button

## 7. Repost from Published

- [x] 7.1 Create repost action handler (`actions/repost-publish.ts`): handle `plat:repost:toggle:{platform}:{draftId}` for toggling platforms in repost mode, `plat:repost:publish:{draftId}` to execute re-publish, `plat:repost:cancel:{draftId}` to cancel
- [x] 7.2 Implement repost publish logic: read existing `publish_results`, publish to newly selected platforms, merge new results with existing, update draft's `publish_results`
- [x] 7.3 Update `renderDraftDetail()` published state: add 🔄 Repost button that shows platform picker (all unchecked initially) with Publish and Cancel buttons

## 8. Default Publish Targets in Settings

- [x] 8.1 Update `views/settings.ts`: add "🎯 Default Platforms" button showing current defaults with emoji badges. Clicking shows platform toggles (same mutual exclusivity rules). Done returns to settings
- [x] 8.2 Create settings platform toggle action handler: handle callbacks `settings:plat:toggle:{platform}`, update `users.default_publish_targets`, re-render toggle buttons with updated header
- [x] 8.3 Conditionally show Instagram options in settings toggles only when `has_instagram = 1`
- [x] 8.4 Register settings platform toggle callbacks in webhook router

## 9. Draft Quick Actions Updates

- [x] 9.1 Update draft list title buttons in `renderDraftsList()` to append platform badges (📸, 📖, 🎬) when draft targets Instagram platforms
- [x] 9.2 Ensure quick publish from list view (`action:list_publish`) calls `publishDraft()` which respects the draft's `publish_targets`

## 10. Draft Creation Updates

- [x] 10.1 Update auto-generated draft creation (webhook handler, `/generate` command) to set `publish_targets` from user's `default_publish_targets`
- [x] 10.2 Update handwritten draft creation (compose pen-down) to set `publish_targets` from user's `default_publish_targets`. Set `has_video` if any tweet has video media
- [x] 10.3 Update repost draft creation (manual and auto-approve flows) to set `publish_targets` from user's `default_publish_targets`
- [x] 10.4 Update all code that reads `Tweet.mediaKey`/`Tweet.mediaType` to use the new `Tweet.media[]` array format. Update handwrite compose flow to write `media` array instead of `mediaKey`/`mediaType`

## 11. i18n Strings

- [x] 11.1 Add English string keys to `ui/strings/en.ts` for: platform names (X, Instagram Post, Instagram Story, Instagram Reel), toggle labels, publish target header format, published result format (success/fail per platform), error messages, "Platforms" button label, "Repost" button label, "Default Platforms" settings label, at-least-one-target warning
- [x] 11.2 Add Hebrew translations to `ui/strings/he.ts` for all new string keys

## 12. Cron & Scheduled Publishing Updates

- [x] 12.1 Update cron handler (`handlers/cron.ts`) `publishUserDrafts()`: after calling `publishDraft()`, format notification message to show per-platform results (which succeeded, which failed, URLs). On all-fail, move draft to `approved` and notify user with error details
- [x] 12.2 Update cron notification message format: instead of just tweet URL, show a summary like "Published to: 🐦 X ✅ • 📸 Post ✅" with links
