# per-media-targeting Specification

## Purpose
TBD - created by archiving change per-media-platform-targeting. Update Purpose after archive.
## Requirements
### Requirement: Per-media platform targeting model
Each `TweetMedia` SHALL carry an optional `targets` set with a boolean per platform — `x`, `instagram_post`, `instagram_story`, `instagram_reel`, `linkedin` — mirroring the `PublishTargets` keys. A single resolver `isMediaTargeted(media, platform)` SHALL return `media.targets?.[platform] ?? true`, so an absent `targets` object or an absent field means the media is targeted to that platform. This keeps existing drafts, bot/auto-generated drafts, and freshly generated images (which carry no `targets`) behaving exactly as before — every media goes to every platform — with no data migration.

#### Scenario: Absent targets means all platforms
- **WHEN** a media item has no `targets` (or a `targets` missing a given platform key)
- **THEN** `isMediaTargeted(media, platform)` SHALL return `true` for that platform

#### Scenario: Explicit false excludes a platform
- **WHEN** a media item has `targets.linkedin = false`
- **THEN** `isMediaTargeted(media, 'linkedin')` SHALL return `false`, and `isMediaTargeted` for every other platform SHALL still default to `true` unless also set false

#### Scenario: Targeting persists in draft content
- **WHEN** a draft is saved (compose, content edit, or per-media toggle) with media carrying `targets`
- **THEN** the `targets` SHALL be persisted inside `content.tweets[].media[]` and survive reload, with no separate column or migration

### Requirement: X attaches only X-targeted media
When preparing X media, each tweet SHALL attach only the items of its `media[]` for which `isMediaTargeted(m, 'x')` is true, then apply the existing per-tweet rule (a video wins over photos; otherwise up to 4 photos). A tweet whose media are all X-deselected SHALL post as text-only on X.

#### Scenario: Image deselected for X
- **WHEN** a tweet has one photo with `targets.x = false`
- **THEN** that tweet SHALL be posted on X with no media attached

#### Scenario: Mixed targeting across the thread
- **WHEN** tweet 1 has a video targeted to X and tweet 2 has a photo NOT targeted to X
- **THEN** tweet 1 SHALL attach its video and tweet 2 SHALL attach no media on X

### Requirement: Instagram Post carries a mixed carousel of targeted media
The Instagram-Post branch SHALL collect, in thread order, every media item with `isMediaTargeted(m, 'instagram_post')` true — photos AND videos — and publish them: zero items falls back to the existing tweet-card generation; one item publishes as a single image post or a single video feed post; two or more publish as one carousel mixing photos and videos (capped at Instagram's 10-item maximum, extra items skipped with a log).

#### Scenario: Video + image both targeted to Instagram Post
- **WHEN** a thread has a video and an image both targeted to `instagram_post`
- **THEN** Instagram SHALL publish a carousel containing BOTH the video and the image (not the image alone)

#### Scenario: Single targeted video
- **WHEN** exactly one media item is targeted to `instagram_post` and it is a video
- **THEN** Instagram SHALL publish it as a single video feed post (not a tweet card, not an image)

#### Scenario: Untargeted media excluded from the carousel
- **WHEN** a thread has three photos but one has `targets.instagram_post = false`
- **THEN** the Instagram carousel SHALL contain only the two targeted photos

### Requirement: Instagram Story and Reel use targeted media
The Instagram-Story branch SHALL choose its single media from items targeted to `instagram_story`, and the Instagram-Reel branch SHALL choose its video from items targeted to `instagram_reel`. Story selection SHALL follow the single-media conflict rule (a targeted video becomes a video story; otherwise the first targeted image; otherwise the existing card/draft-image fallback). Reel selection SHALL use the first targeted video.

#### Scenario: Story prefers a targeted video
- **WHEN** the Story target is enabled and a video is targeted to `instagram_story`
- **THEN** the story SHALL be published from that video

#### Scenario: Reel uses the targeted video
- **WHEN** the Reel target is enabled and a specific video is targeted to `instagram_reel`
- **THEN** that video SHALL be the reel

### Requirement: LinkedIn attaches only LinkedIn-targeted media
The LinkedIn branch SHALL restrict its media candidates to items with `isMediaTargeted(m, 'linkedin')` true, then apply LinkedIn's images-OR-one-video exclusivity over only those candidates. It SHALL NOT consider media that is not targeted to LinkedIn.

#### Scenario: Images targeted to LinkedIn while a video is not
- **WHEN** a thread has a video (not targeted to LinkedIn) and two photos (targeted to LinkedIn)
- **THEN** LinkedIn SHALL publish the two photos as an image post and SHALL NOT publish the video

#### Scenario: Nothing targeted to LinkedIn
- **WHEN** no media is targeted to LinkedIn but the LinkedIn target is enabled
- **THEN** LinkedIn SHALL fall back to the draft-level image if present, else a text-only post

### Requirement: Video-wins conflict resolution for single-media destinations
For destinations that carry only one media kind in a single post — LinkedIn, a single X tweet, Instagram Story, and Instagram Reel — when both a video and one or more images are targeted to that destination, the video SHALL win: the video is attached and the images are skipped. Each skipped-image situation SHALL be logged (count and destination) so the publish trail records the drop. Instagram Post is exempt — it carries the mixed carousel.

#### Scenario: LinkedIn with a video and images both targeted
- **WHEN** both a video and images are targeted to LinkedIn
- **THEN** LinkedIn SHALL publish the video, skip the images, and log the number of skipped images

#### Scenario: Instagram Post is not subject to video-wins
- **WHEN** both a video and images are targeted to `instagram_post`
- **THEN** Instagram Post SHALL include both in a carousel rather than dropping the images

