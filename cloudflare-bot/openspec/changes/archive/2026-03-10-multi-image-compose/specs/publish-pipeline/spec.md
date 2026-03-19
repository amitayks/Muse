## MODIFIED Requirements

### Requirement: Per-tweet media in publish flow
The `publishDraft()` function SHALL support multiple media attachments per tweet via the `Tweet.media[]` field, uploading each tweet's media individually to X with a maximum of 4 images per tweet.

#### Scenario: Publish thread with multiple images per tweet
- **WHEN** `publishDraft()` processes a thread where a tweet has `media: [{key:'a'}, {key:'b'}, {key:'c'}]`
- **THEN** all 3 media items SHALL be read from R2 and uploaded to X via `uploadMediaFromBuffer`
- **AND** all 3 media IDs SHALL be passed to `postTweet` as `mediaIds: ["id_a", "id_b", "id_c"]`

#### Scenario: Tweet with more than 4 images truncates for X
- **WHEN** a tweet has 6 images in `media[]`
- **THEN** only the first 4 SHALL be uploaded and attached for X publishing
- **AND** the remaining 2 SHALL be silently skipped (no error thrown)

#### Scenario: Thread with mixed media counts
- **WHEN** a thread has tweet 1 with 3 images, tweet 2 with no images, tweet 3 with 1 image
- **THEN** tweet 1 SHALL have 3 media IDs attached, tweet 2 SHALL have none, tweet 3 SHALL have 1

#### Scenario: Fallback to draft-level image for auto drafts
- **WHEN** `publishDraft()` processes a draft with no per-tweet media but with a draft-level `image_url`
- **THEN** the existing behavior SHALL apply: the draft-level image is attached to the first tweet only

#### Scenario: Instagram collects all images across tweets
- **WHEN** `publishToIGPost()` processes a thread with multi-image tweets
- **THEN** ALL images across all tweets SHALL be collected for the carousel (up to Instagram's 10-image limit)

### Requirement: postThread accepts multi-media per tweet
The `postThread()` function in `x.ts` SHALL accept `perTweetMediaIds` as `(string[] | null)[]` — an array of media ID arrays per tweet — instead of the current `(string | null)[]`.

#### Scenario: Post tweet with multiple media IDs
- **WHEN** `postThread()` is called with `perTweetMediaIds[0] = ["id1", "id2", "id3"]`
- **THEN** the first tweet SHALL be posted with `media: { media_ids: ["id1", "id2", "id3"] }`

#### Scenario: Post tweet with null media entry
- **WHEN** `postThread()` is called with `perTweetMediaIds[1] = null`
- **THEN** the second tweet SHALL be posted without media

#### Scenario: Backward compatibility with single legacy mediaId
- **WHEN** `postThread()` is called with a single `mediaId` (for auto-generated drafts)
- **THEN** the first tweet SHALL have `media: { media_ids: [mediaId] }` (existing behavior preserved)
