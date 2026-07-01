# draft-media-ownership Specification

## Purpose
TBD - created by archiving change server-authoritative-media. Update Purpose after archive.
## Requirements
### Requirement: Tweets carry a stable identity
Each tweet in a draft's content SHALL carry a stable opaque `id` that is independent of its position in the thread. Media SHALL be reasoned about as belonging to a tweet `id`, not a tweet index. New tweets SHALL receive a fresh `id` at creation. Drafts created before this capability (tweets without `id`) SHALL be tolerated and assigned ids lazily and idempotently when the draft is read for editing or next saved; read-only paths (publish, bot render) SHALL function whether or not ids are present.

#### Scenario: New draft tweets have ids
- **WHEN** a draft is created (handwrite, commit, repost, or generated)
- **THEN** every tweet in its content SHALL have a non-empty stable `id`

#### Scenario: Legacy draft gets ids on first edit
- **WHEN** a draft whose tweets have no `id` is read for editing or saved
- **THEN** each tweet missing an `id` SHALL be assigned one and the ids SHALL persist
- **AND** the assignment SHALL be idempotent (re-reading does not change existing ids)

#### Scenario: Read-only paths tolerate missing ids
- **WHEN** a publish or bot-render path reads a draft whose tweets lack ids
- **THEN** it SHALL operate normally without requiring ids

### Requirement: The content save is media-non-destructive
The draft content/structure save SHALL carry text and thread structure keyed by tweet `id` and SHALL NOT carry media. The server SHALL reconcile the incoming tweets against the stored content by `id`: each surviving tweet keeps its **stored** media unchanged, new tweets start with no media, and tweets whose `id` is absent from the incoming list are removed (their media removed with them). A content save SHALL never add, remove, reorder-within-a-tweet, or otherwise alter a surviving tweet's media.

#### Scenario: Text save preserves media
- **WHEN** a content save is issued whose payload contains no media (or stale/empty media) for a tweet that has stored media
- **THEN** the stored tweet SHALL keep its existing media unchanged after the save

#### Scenario: Lost-response append survives the next save
- **WHEN** media was appended to a tweet server-side but the client never learned of it, and the client then issues a content save without that media
- **THEN** the appended media SHALL remain on the tweet after the save (no clobber)

#### Scenario: Reorder moves media with the tweet
- **WHEN** a content save reorders tweets (the same ids in a different order)
- **THEN** each tweet's media SHALL remain attached to its own tweet `id` in the new order

#### Scenario: Deleting a tweet removes its media
- **WHEN** a content save omits a previously-present tweet `id` (the user deleted that tweet)
- **THEN** that tweet and its media SHALL be removed from the stored content

#### Scenario: New tweet starts empty
- **WHEN** a content save includes a tweet `id` not present in the stored content
- **THEN** the new tweet SHALL be stored with the given text and no media

### Requirement: Media is mutated only through dedicated atomic operations
All additions, removals, and retargeting of media SHALL occur through dedicated server operations keyed by `(draftId, tweetId, mediaKey)`, each performed as a single atomic in-place content update so concurrent media operations cannot clobber one another. Media removal SHALL be expressed explicitly through the remove operation, never by omission from a content save.

#### Scenario: Attach appends atomically
- **WHEN** an uploaded or generated media item is attached to a tweet
- **THEN** it SHALL be appended to that tweet's media via a single atomic statement that reads-and-writes together, leaving any existing media intact

#### Scenario: Remove targets a specific media key
- **WHEN** a media item is removed from a tweet
- **THEN** only the item with that key SHALL be removed, the R2 object SHALL NOT be deleted (only unlinked), and other media on the tweet SHALL be unaffected

#### Scenario: Retarget sets per-item targeting
- **WHEN** a media item's platform targeting is changed
- **THEN** only that item's `targets` SHALL be updated, leaving its key/type and other items unchanged

#### Scenario: Concurrent media operations all survive
- **WHEN** two media operations on the same draft overlap in time
- **THEN** after both complete the stored draft SHALL reflect both operations (neither is lost to a stale read)

#### Scenario: Every media operation reconciles pre-warmed uploads
- **WHEN** any media operation (attach, remove, retarget, generate) changes a draft's media
- **THEN** the media-prewarm reconcile SHALL run for the new media set, exactly as the content path does today

