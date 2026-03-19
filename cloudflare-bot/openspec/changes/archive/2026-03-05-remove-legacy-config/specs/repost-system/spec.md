## REMOVED Requirements

### Requirement: Tone selection in preview
**Reason**: Tone is now controlled by skills/identity system, not per-account config
**Migration**: Remove tone selector from repost preview UI; remove tone param from repost prompt builder

### Requirement: Sarcastic tone option
**Reason**: All tone options removed — identity system controls tone
**Migration**: Remove tone cycling from account config

### Requirement: Sarcastic tone prompt guidelines
**Reason**: Tone prompt guidelines now live in skills/identity
**Migration**: No migration needed — skills handle tone

### Requirement: Tone label display
**Reason**: No per-account tone setting to display
**Migration**: Remove tone display from account detail view

### Requirement: Image generation for repost drafts
**Reason**: Per-account image config (`alwaysGenerateImage`, `singleImageProbability`) removed. Image generation still happens in publish pipeline unconditionally.
**Migration**: Remove image config fields from TwitterAccountConfig; publish pipeline continues to generate images as before

## MODIFIED Requirements

### Requirement: Dedicated repost content generation prompt
The system SHALL have a dedicated generation prompt in its own file (`ai/repost-prompt.ts`), separate from the existing content generation prompt. It SHALL instruct Gemini to create a quote-tweet response that adds genuine commentary, insight, or value to the original tweet. The prompt SHALL receive: the original tweet text, the account persona overview (if available), and language setting. Tone and hashtag preferences are no longer passed — they are controlled by the skills/identity system.

#### Scenario: Generate with full context
- **WHEN** generation is triggered for a tweet from @vercel
- **THEN** the prompt SHALL include the original tweet, @vercel's persona overview, and language setting

#### Scenario: Generate without persona
- **WHEN** generation is triggered and no persona overview exists for the account
- **THEN** the prompt SHALL still generate content using only the tweet text

### Requirement: Account config analyzeMedia toggle
The `TwitterAccountConfig` SHALL include an `analyzeMedia: boolean` field (default `true`) that controls whether media is sent to the AI during repost generation for that account's tweets. The config SHALL also retain `relevanceThreshold`, `autoApprove`, and `batchPageSize`. Fields `includeHashtags`, `alwaysGenerateImage`, `singleImageProbability`, and `tone` are removed.

#### Scenario: Toggle in account settings
- **WHEN** a user views account configuration for a followed account
- **THEN** an "Analyze Media" toggle button is visible alongside remaining toggles (auto-approve, threshold, batch size)
