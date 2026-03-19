## Context

The bot is a Telegram-based social media publishing tool running on Cloudflare Workers. Currently, all regular drafts (auto-generated from GitHub PRs, handwritten, and reposts/quote-tweets) publish exclusively to Twitter/X. Instagram integration exists only for video Reels in the separate Video Studio feature.

The existing publish pipeline (`core/publish.ts`) follows a linear flow: parse content → get/generate image → upload media to X → post tweet/thread → update DB. This needs to become a multi-target pipeline that publishes to each selected platform independently with isolated error handling.

Instagram's Graph API requires images for all post types (feed posts, stories, carousels). The bot generates AI images for most drafts, but not all drafts have images — particularly handwritten text-only posts and some reposts. For these cases, we need a tweet card renderer that creates styled images from tweet content.

Key constraints:
- Cloudflare Workers runtime (no Node.js native modules, no browser, Wasm supported)
- Telegram Bot API for all UI (inline keyboards, message editing)
- Instagram Graph API requires publicly accessible URLs for media ingestion
- Multi-tenant: all operations scoped per `chat_id`

## Goals / Non-Goals

**Goals:**
- Enable cross-posting any draft to X, Instagram Post, Instagram Story, and Instagram Reel
- Per-draft platform selection with sensible defaults from settings
- Non-blocking error handling: each platform publishes independently
- Generate tweet card images for Instagram when no image exists
- Allow re-publishing from the published state to any platform
- Clean DB schema supporting per-platform results

**Non-Goals:**
- AI-adapted captions for Instagram (same text for now, optimization later)
- Instagram hashtag generation (future feature)
- Story link stickers (API may require specific account types)
- Real tweet screenshots (we render synthetic cards instead)
- Video generation from static images for Reels (Reels require actual video)
- Instagram API token refresh automation (manual update in Settings)

## Decisions

### 1. Publish targets stored on the draft row (not a separate table)

**Decision**: Add `publish_targets TEXT` and `publish_results TEXT` as JSON columns on the `drafts` table.

**Rationale**: Targets are a property of the draft itself — they travel with the draft through its lifecycle (draft → approved → scheduled → published). A separate junction table would add query complexity for every draft read with no real benefit. JSON columns are the established pattern in this codebase (see `content`, `config` columns on other tables).

**Alternative considered**: Separate `draft_targets` table with one row per platform per draft. Rejected because it adds JOIN complexity and this data is always read/written together with the draft.

### 2. Published table simplified, results on draft

**Decision**: Keep the `published` table but remove `tweet_ids`, `tweet_url`, `image_url` columns. These are now in `draft.publish_results`. The `published` table becomes a lightweight archive log: `id, chat_id, draft_id, pr_number, published_at`.

**Rationale**: With multi-platform publishing, per-platform results don't fit cleanly into the old `published` columns (which were X-specific). Putting results on the draft avoids data duplication and makes the "repost from published" feature trivial — just re-read `publish_results` from the draft.

**Alternative considered**: Expanding `published` with `platform` column and one row per platform. Rejected because existing queries assume one published row per draft, and the draft already needs the results for UI rendering.

### 3. Satori + resvg-wasm for tweet card rendering

**Decision**: Use Satori (JSX structure → SVG) and @resvg/resvg-wasm (SVG → PNG) for rendering tweet cards on Cloudflare Workers.

**Rationale**: Both libraries are designed for edge runtimes and are proven in production (powers @vercel/og). Satori accepts a React-like element tree and produces SVG, which resvg converts to PNG. This runs entirely in-Worker with no external API calls.

**Alternative considered**: External screenshot API (screenshotone.com, urlbox). Rejected because it adds latency, cost, and an external dependency for what should be a deterministic rendering task.

**Alternative considered**: Canvas-based rendering (node-canvas, skia-canvas). Rejected because these require native binaries incompatible with CF Workers.

### 4. Twemoji image replacement for emoji rendering

**Decision**: Before passing text to Satori, replace Unicode emoji characters with `<img>` elements referencing Twemoji SVG files stored in R2.

**Rationale**: Satori doesn't support color emoji fonts (CBDT/CBLC format). Noto Color Emoji is ~24MB and too large for Worker memory. Twemoji SVGs are 1-5KB each. Pre-caching the ~200 most common emojis in R2 (~200KB total) gives reliable, pixel-perfect emoji rendering with negligible overhead.

**Alternative considered**: Loading Noto Color Emoji from R2 per request. Rejected due to 24MB parse overhead and Satori's lack of color bitmap font support.

### 5. Blurred background for story 9:16 treatment

**Decision**: For stories, render the image on a 1080×1920 canvas with the original image scaled and heavily blurred as background, and the original image centered at native aspect ratio on top.

**Implementation**: Use Satori to compose an SVG with:
1. Background: the image stretched to fill 1080×1920 with CSS `filter: blur(20px)`
2. Foreground: the original image centered with `object-fit: contain`
Then render to PNG via resvg-wasm.

**Rationale**: This preserves the original image without cropping while filling the 9:16 story format. It's the same technique Instagram's own app uses when posting non-9:16 content to stories.

**Alternative considered**: Cloudflare Image Transformations. Would require a paid plan and doesn't handle compositing (overlay + background) in a single operation.

### 6. Platform toggle UI as button row replacement

**Decision**: The "Platforms" button sits alongside existing action buttons. Clicking it replaces ONLY the button rows (not the message text) with platform toggle buttons. The message header text updates to reflect the current selection. Clicking "Done" restores the action buttons.

**Rationale**: Telegram's `editMessageReplyMarkup` API allows replacing just the keyboard without resending the message. This makes the toggle feel snappy. The header text updates via `editMessageText` to show current targets.

**Implementation detail**: Each toggle button callback encodes the platform and current state: `plat:toggle:x`, `plat:toggle:ig_post`, etc. The action handler reads the draft's current `publish_targets`, toggles the clicked platform, enforces mutual exclusivity (post ↔ reel), updates the DB, and re-renders with updated buttons and header text.

### 7. Default targets from user settings

**Decision**: Add `default_publish_targets TEXT` column to `users` table. When a new draft is created (any source), it inherits these defaults. The defaults UI lives in Settings as a platform toggle section (same mutual exclusivity rules).

**Rationale**: Users who always cross-post shouldn't have to configure every draft. The per-draft override ensures flexibility.

**Default value**: `{"x": true, "instagram_post": false, "instagram_story": false, "instagram_reel": false}` — X-only by default for backward compatibility.

### 8. has_video flag on drafts

**Decision**: Add `has_video INTEGER DEFAULT 0` column to `drafts`. Set to 1 when video media is attached to the draft.

**Rationale**: The Reel toggle should only appear when the draft actually has video. Checking R2 or parsing JSON content on every view render is wasteful. A simple flag lets the view layer conditionally show/hide the Reel button instantly.

### 9. Multi-media per tweet evolution

**Decision**: Evolve `Tweet.mediaKey?: string` to `Tweet.media?: TweetMedia[]` where `TweetMedia = { key: string, type: 'photo' | 'video', width?: number, height?: number }`.

**Rationale**: Instagram carousels can have up to 10 items. Supporting multiple images per tweet enables richer carousel posts. Width/height metadata enables aspect ratio decisions for story rendering. The old `mediaKey`/`mediaType` fields are dropped (green field, no backward compatibility needed).

### 10. Profile image storage strategy

**Decision**: Store profile image URLs on the source records at fetch time:
- `twitter_tweets.author_profile_image_url` — set during polling
- `twitter_accounts.profile_image_url` — set during account add/bootstrap
- `persona_cache.profile_image_url` — set during persona generation
- `users.own_profile_image_url` — set during identity analysis

At tweet card render time, download the profile image, resize to 48×48, and cache in R2 at `profiles/{username}.jpg`. Subsequent renders reuse the cached version.

**Rationale**: Twitter profile image URLs are CDN-based and may expire. Storing the URL at fetch time captures it while it's valid. Caching the downloaded image in R2 ensures availability for rendering.

### 11. Instagram API flow for different post types

**Feed Post (single image)**:
```
POST /{account}/media { image_url, caption, access_token }
  → container_id
Poll until FINISHED
POST /{account}/media_publish { creation_id }
  → { id } → URL: /p/{id}
```

**Feed Post (carousel)**:
```
For each image:
  POST /{account}/media { image_url, is_carousel_item: true, access_token }
    → child_container_id
POST /{account}/media { media_type: CAROUSEL, children: [...ids], caption, access_token }
  → carousel_container_id
POST /{account}/media_publish { creation_id }
  → { id }
```

**Story**:
```
POST /{account}/media { image_url, media_type: STORIES, access_token }
  → container_id
Poll until FINISHED
POST /{account}/media_publish { creation_id }
  → { id }
```

**Reel** (existing code in video-publish.ts, reused):
```
POST /{account}/media { video_url, caption, media_type: REELS, access_token }
  → container_id
Poll until FINISHED
POST /{account}/media_publish { creation_id }
  → { id }
```

### 12. Multi-platform publish orchestration

**Decision**: Publish to each platform sequentially (not in parallel). If one fails, continue to the next.

**Rationale**: Instagram API calls involve polling (10s intervals, up to 5 minutes). Running platforms in parallel with `Promise.allSettled` would work but adds complexity around the Cloudflare Workers execution time limit (30s for free, 15min for paid). Sequential execution with early media preparation keeps the flow simpler and easier to debug. If X fails fast (network error), Instagram still runs.

**Status transition logic**:
- Any platform succeeds → `status = 'published'`
- All platforms fail → `status = 'approved'` (for manual publish) or back to `approved` from `scheduled` (with user notification at failure time)
- Partial success → `status = 'published'` with `errors` in `publish_results`

### 13. Public media route for Instagram image ingestion

**Decision**: Extend the existing `/media/{key}` public route (currently serves videos for Instagram Reels) to also serve images. Instagram's API fetches media via URL, so images must be publicly accessible.

**Rationale**: The route already exists and is public (no auth). Adding image support is a matter of accepting image MIME types alongside video.

## Risks / Trade-offs

**[Instagram API rate limits]** → Instagram allows ~25 content publishes per day per account. Batch-publishing many drafts could hit this limit. → *Mitigation*: Track daily Instagram publishes per user. Warn when approaching limit. Do not block — just warn.

**[Worker execution time with Instagram polling]** → Instagram container processing can take up to 5 minutes of polling. CF Workers have execution time limits. → *Mitigation*: For paid plans (15min limit), this is fine. For free plans (30s), Instagram publishing may timeout. Document this as a requirement for the paid plan, or implement a deferred publish via scheduled handler.

**[Tweet card rendering quality]** → Satori's rendering fidelity may not perfectly match Twitter's visual style. → *Mitigation*: This is acceptable — the cards are "inspired by" Twitter's style, not exact replicas. Users understand these are cross-posted content, not screenshots.

**[Emoji coverage]** → Pre-caching only ~200 common emojis may miss some. → *Mitigation*: Fall back to a placeholder or the raw character (Satori renders it as a system font glyph). Can expand the cached set as needed.

**[Instagram token expiry]** → Long-lived tokens expire after 60 days. → *Mitigation*: Existing onboarding/settings flow allows updating tokens. Future work: add a cron check that warns users when tokens are approaching expiry.

**[Carousel API complexity]** → Carousel posts require N+2 API calls (N children + 1 carousel container + 1 publish). → *Mitigation*: Implement with clear error handling at each step. If a child container fails, skip that image and continue with remaining images.

**[Multi-tweet text combining]** → Simple concatenation of tweet texts for Instagram captions may read awkwardly. → *Mitigation*: Join with double newlines and separator markers for now. Future: AI-adapted captions.

## Migration Plan

1. **Schema migration** (`008_instagram_publish.sql`):
   - Add `publish_targets`, `publish_results`, `has_video` to `drafts`
   - Add `default_publish_targets`, `own_profile_image_url`, `own_username_x`, `own_display_name_x` to `users`
   - Add `instagram_token_enc`, `instagram_account_id_enc`, `has_instagram` to `users` (fixing schema gap)
   - Add `author_profile_image_url`, `author_display_name` to `twitter_tweets`
   - Add `profile_image_url` to `twitter_accounts` and `persona_cache`
   - Simplify `published` table (remove `tweet_ids`, `tweet_url`, `image_url`)
   - Add `media_url` to `twitter_tweets` if not exists (migration 003 already did this)

2. **Existing drafts**: All existing drafts default to `publish_targets = '{"x":true}'` and `publish_results = '{}'`. No data loss.

3. **Existing published records**: Old published records with `tweet_ids`/`tweet_url` remain readable. New publishes write results to `draft.publish_results` instead. The simplified `published` table schema only affects new rows.

4. **Dependencies**: Install `satori`, `@resvg/resvg-wasm`. Store Inter font files and Twemoji SVGs in R2 (one-time setup).

5. **Rollback**: If issues arise, the `publish_targets` default of X-only means the old behavior is preserved. The new Instagram code paths only execute when Instagram targets are explicitly selected.

## Open Questions

1. **Instagram API Reel from image**: The proposal mentions Reels for images, but the Graph API only supports video for Reels (`media_type: REELS` requires `video_url`). Decision: Reel button conditionally shown only when `has_video = true`. Revisit if Instagram adds image-Reel API support.

2. **Story caption**: Should Instagram stories include the tweet text as a caption (displayed as overlay), or publish image-only? Decision for implementation: include caption for now, can be toggled off later.

3. **CF Workers plan requirement**: Instagram polling may exceed free-plan execution limits. Should we gate Instagram publishing behind a "paid plan detected" check, or let it fail gracefully? Decision: Let it fail gracefully with a clear error message.
