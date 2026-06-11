## ADDED Requirements

### Requirement: X media upload authenticates via OAuth 2.0 bearer

The shared X media uploader (`uploadVideoToX`, `uploadMediaFromBuffer`) SHALL authenticate the v2 media-upload calls (initialize/append/finalize/status and the single-shot image upload) with the user's OAuth 2.0 `Authorization: Bearer` token instead of OAuth 1.0a. Because the upload and the subsequent post now share the same OAuth 2.0 user context, the resulting media id SHALL be attachable to a post.

#### Scenario: Video uploaded under OAuth 2.0 attaches to a post

- **WHEN** a video is uploaded via the v2 endpoints using the user's OAuth 2.0 bearer and then attached to a post created with the same user's bearer
- **THEN** the post SHALL be created with the video attached
- **AND** X SHALL NOT reject it with `"Your media IDs are invalid"`
