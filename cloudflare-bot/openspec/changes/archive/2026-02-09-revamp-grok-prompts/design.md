## Context

The bot generates Twitter/X content from GitHub events (PR merges, pushes). Currently:
- `buildContentPrompt()` sends PR title, author, stats, and body to Grok — but NOT the actual commit messages or file names
- `PRData.commits` stores only SHA hashes, not messages
- Image prompts are plain text strings with generic aesthetic instructions
- `codeContext` config exists in UI but `getEnhancedCodeContext()` is never called (dead code)
- `tone` cycles between professional/casual/technical but the system prompt barely uses it
- System prompt is a flat "You are a developer advocate" instruction

## Goals / Non-Goals

**Goals:**
- Lock data sent to Grok to commit messages + file names only (no body, no author, no stats)
- Fetch actual commit messages from GitHub API for PRs (replace SHA-only storage)
- Structured JSON image prompts sent directly to image model
- Multi-perspective system prompt that produces genuinely engaging content
- Remove dead code (`codeContext`, `tone` settings and all UI)

**Non-Goals:**
- Changing the image model (stays grok-2-image-1212)
- Changing the text model (stays grok-3-fast)
- Modifying the edit flow (editContent stays similar, just updated prompt style)
- Changing draft storage schema in D1
- Modifying the X/Twitter publishing flow

## Decisions

### 1. Data pipeline: Fetch commit messages + file names at source

**Decision**: Enrich `PRData` and `CommitData` with `commitMessages: string[]` and `fileNames: string[]`. Fetch these at the point of data creation (webhook handler + getContentSource).

**Why not fetch lazily in buildContentPrompt**: The prompt builder should be a pure formatter, not make API calls. Data fetching belongs in the GitHub service layer.

**For PR webhooks**: The webhook payload only has `head.sha` — we need to call `GET /repos/{owner}/{repo}/pulls/{number}/commits` for messages and `GET /repos/{owner}/{repo}/pulls/{number}/files` for file names. This adds 2 API calls per PR webhook but the data is essential.

**For push webhooks**: The payload already includes `commits[].message` and `commits[].added/modified/removed` — extract directly, no extra API calls needed.

**For manual SHA flow** (`getContentSource`): Already calls `getPR()` which fetches commits. Extend to also fetch messages and file names.

### 2. Image prompt: Structured JSON sent directly to image model

**Decision**: `DraftContent.imagePrompt` changes from `string | undefined` to `ImagePromptData | undefined` (a structured object). When generating the image, `JSON.stringify(imagePrompt)` is sent directly to grok-2-image-1212.

**JSON schema for tech content** (adapted from AI-Prompt-Builder):
```typescript
interface ImagePromptData {
  concept: {
    main_subject: string;      // Core visual representation of the code change
    symbolic_elements: string;  // Visual metaphors
    mood: string;               // Energy/feeling
  };
  composition: {
    style: string;              // e.g., isometric, 3D render, flat design
    perspective: string;        // e.g., bird's eye, close-up
    focal_point: string;        // What draws the eye
  };
  environment: {
    setting: string;            // Abstract/digital/physical space
    lighting: string;           // e.g., neon glow, ambient
    color_palette: string;      // Dominant colors
  };
  technical: {
    medium: string;             // Digital art / 3D render / illustration
    quality: string;            // Resolution feel: polished/gritty
    negative: string;           // What to exclude (text, faces, etc.)
  };
}
```

**Why JSON directly**: The user explicitly wants to try this approach first. Structured prompts often produce more consistent results with image models because each parameter is clearly delineated. Can always add a consolidation step later if needed.

**Fallback**: If Grok fails to produce valid JSON for imagePrompt, use a hardcoded default `ImagePromptData` based on the tweet text.

### 3. System prompt: Multi-perspective creative thinking

**Decision**: Replace the flat "You are X" prompt with a perspective-based approach. The prompt instructs Grok to think from multiple expert perspectives before generating output.

**Perspectives for tweets:**
- **Tech Influencer**: What hook would make developers stop scrolling?
- **Copywriter**: Maximum impact within 280 characters
- **Growth Marketer**: What makes this shareable? Viral potential
- **Community Manager**: What resonates authentically with dev community?

**Perspectives for images:**
- **Creative Director**: What's the core visual story of this change?
- **Art Director**: Emotional impact through visuals, aesthetic coherence
- **Brand Designer**: Consistent, recognizable visual identity

**Why "think from the perspective of" instead of "you are"**: Role-play ("you are a designer") limits the model to one viewpoint. Perspective-taking ("what would a designer prioritize here?") allows synthesizing multiple viewpoints into richer output. This is a known prompt engineering pattern for getting more nuanced responses.

### 4. Remove tone and codeContext settings

**Decision**: Remove both from RepoConfig, DB handling, callback handler, and views.

**Why remove tone**: The new multi-perspective prompt subsumes tone. Content will always be engaging/professional through the synthesized perspectives. Having a "casual" mode undermines the quality goal.

**Why remove codeContext**: It was never functional (getEnhancedCodeContext never called). The new approach hardcodes the data pipeline to commit messages + file names — no user-configurable levels.

**Migration**: Existing configs in D1 will have these fields in their JSON. `parseRepoConfig()` already merges with defaults, so missing fields are handled. Old fields in stored JSON are harmless — they'll be ignored.

### 5. PR file names: Use the pulls/files endpoint

**Decision**: For PRs, call `GET /repos/{owner}/{repo}/pulls/{number}/files` which returns all changed files with their filenames. This is more accurate than trying to derive file names from individual commits (which may have overlapping changes).

**Rate limiting**: One extra API call per PR. GitHub's rate limit is 5000/hour for authenticated requests. This is negligible given the bot's traffic pattern (triggered by PR merges).

## Risks / Trade-offs

- **[JSON image prompts may produce worse results]** → Mitigation: User explicitly wants to try this first; can revert to text consolidation. The fallback `buildImagePrompt()` will produce a valid `ImagePromptData` object, not a string.
- **[Extra GitHub API calls for PR webhooks]** → Mitigation: Only 2 extra calls per PR merge event. Well within rate limits.
- **[Breaking RepoConfig changes]** → Mitigation: `parseRepoConfig()` uses spread with defaults, so old stored configs gracefully degrade. Removed fields are simply ignored.
- **[Multi-perspective prompt may be longer/slower]** → Mitigation: The prompt size increase is modest (~200 extra tokens). grok-3-fast handles this easily.
- **[Existing drafts have string imagePrompt]** → Mitigation: `generateImage()` should handle both string and object imagePrompt for backwards compatibility with existing drafts in the database.
