## Why

The bot currently publishes all regular drafts (auto-generated, handwritten, reposts) exclusively to Twitter/X. Instagram integration exists only for video Reels in the Video Studio. Users want to cross-post the same content to Instagram (as feed posts, stories, or reels) alongside X, maximizing reach without manually re-creating content. This also makes the bot a true multi-platform publishing tool rather than a Twitter-only client with a video side-feature.

## What Changes

- **Per-draft publish targets**: Every draft gains a `publish_targets` JSON field allowing users to select which platforms to publish to (X, Instagram Post, Instagram Story, Instagram Reel). Targets are configurable from draft state onward (draft, approved, scheduled, published).
- **Default publish targets in settings**: Users configure their default platform selection in Settings. New drafts inherit these defaults. Instagram options only appear when Instagram tokens are configured.
- **Multi-platform publish pipeline**: `publishDraft()` is extended to publish to each selected platform independently. Partial failures are non-blocking — if X succeeds but Instagram fails, the draft still moves to published and the error is reported.
- **Per-platform publish results**: Draft stores structured `publish_results` tracking success/failure per platform, replacing the separate `published` table for result storage.
- **Tweet card rendering (Satori)**: For Instagram posts when no image exists, the system renders tweet content as styled card images using Satori (JSX→SVG) + resvg-wasm (SVG→PNG). Thread tweets render with connecting lines. Repost cards include the original author's profile image and quoted tweet.
- **Instagram feed post support**: Single images publish as photo posts; multiple images (thread with per-tweet media or multiple tweet cards) publish as carousels via the multi-step carousel API.
- **Instagram story support**: First image gets a blurred-background 9:16 treatment (original centered on a blurred, scaled-up version filling the canvas).
- **Instagram reel conditional**: Reel option only available when the draft has video media attached (`has_video` flag).
- **Repost from published**: Published drafts gain a "Repost" button allowing re-publishing to any platform selection (retry failed platforms or post to new ones).
- **Profile image caching**: Author profile images are stored in R2 at tweet-fetch time for tweet card rendering. User's own profile image cached on the user record.
- **Multi-media per tweet**: `Tweet` type evolves from single `mediaKey` to `media: TweetMedia[]` array supporting multiple images/videos per tweet.
- **Published table simplification**: The `published` table is simplified since `publish_results` on the draft itself tracks per-platform outcomes.
- **Caption trimming**: Instagram captions are trimmed to 2200 characters when combining multi-tweet text.
- **Post/Reel mutual exclusivity**: Instagram Post and Instagram Reel are mutually exclusive toggles; Story and X can combine with either.

## Capabilities

### New Capabilities
- `instagram-publish`: Instagram Content Publishing API integration for feed posts (single/carousel), stories (with blurred 9:16 background), and reels. Covers container creation, polling, publishing, and error handling.
- `tweet-card-renderer`: Satori-based tweet card image generation for Instagram posts when no image exists. Renders single tweets, threads with connecting lines, and quote-tweet cards with author profile images. Includes Twemoji emoji replacement.
- `publish-targets`: Per-draft platform selection system with toggle UI, default targets from settings, mutual exclusivity rules (post vs reel), conditional reel availability (video-only), and the "Repost from published" re-publish flow.

### Modified Capabilities
- `publish-pipeline`: Extended to support multi-platform publishing with per-platform error isolation, structured `publish_results`, and partial-success status transitions.
- `user-settings`: New "Default Publish Targets" section with platform toggles (same mutual exclusivity rules). Instagram toggles shown only when tokens are configured.
- `draft-quick-actions`: Quick actions in list views updated to reflect multi-platform state in title badges.
- `view-system`: Draft detail views updated with Platforms button, platform toggle replacement row, and publish target display in header. Published detail gains Repost button with platform picker.
- `repost-system`: Author profile image URL stored at fetch time in `twitter_tweets`, `persona_cache`, and `twitter_accounts`. Used for tweet card rendering.
- `image-generation`: `ensureImage()` extended to generate tweet card images for Instagram-bound drafts that lack images. Tweet card generation path runs alongside existing AI image generation.
- `db-domain-split`: New columns on `drafts` (publish_targets, publish_results, has_video), `users` (default_publish_targets, own_profile_image_url, own_username_x, own_display_name_x), `twitter_tweets` (author_profile_image_url, author_display_name), `persona_cache` (profile_image_url), `twitter_accounts` (profile_image_url). Schema.sql updated with missing instagram columns. `published` table simplified.

## Impact

- **Database**: Migration adding new columns to `drafts`, `users`, `twitter_tweets`, `persona_cache`, `twitter_accounts`. Schema.sql updated with missing instagram fields. `published` table schema simplified.
- **Types**: `Draft`, `User`, `Tweet`, `TwitterTweet`, `PersonaCache`, `TwitterAccount`, `Published` interfaces updated. New types: `PublishTargets`, `PublishResults`, `TweetMedia`.
- **Core publish pipeline**: `core/publish.ts` significantly expanded to orchestrate multi-platform publishing.
- **New service**: `services/instagram-publish.ts` for Instagram feed posts, stories, and carousel API flows (extending patterns from existing `video-publish.ts`).
- **New service**: `services/tweet-card.ts` for Satori-based tweet card rendering.
- **Views**: `views/drafts.ts` updated for platform toggle UI and published repost flow. `views/settings.ts` updated for default targets.
- **i18n**: New string keys for platform names, toggle labels, error messages, and publish result summaries.
- **R2 storage**: New key namespaces for tweet cards, profile images, and fonts/emoji assets.
- **Dependencies**: `satori` and `@resvg/resvg-wasm` packages added for edge-compatible image rendering.
- **Public media route**: `/media/` route extended to serve images (currently serves videos only for Instagram ingestion).
