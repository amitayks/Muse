## Why

The current content generation pipeline sends only commit messages and file names to Gemini, with zero context about what the project actually is, who it's for, or what it does. This means generated tweets describe changes in isolation ("Added auth module") rather than in context ("Our dev automation bot now supports passwordless auth — no more token management for your CI pipeline"). Adding a persistent, auto-updating repo overview gives Gemini the full picture, producing more accurate tweets, better image prompts, and — critically — lays the foundation for the upcoming video script generation feature.

## What Changes

- Add a `repo_overviews` table in D1 storing structured project context per repo (summary, tech stack, key features, target audience, brand voice, visual theme, recent changes)
- Add a `/overview owner/repo` command to bootstrap the initial overview by fetching the repo README + recent PRs via GitHub API and sending to Gemini for structured extraction
- Modify the content generation pipeline to include the repo overview as context when calling Gemini for tweet and image prompt generation
- Modify the Gemini response format to include `overviewUpdates` — field-level patches (add/remove per field) rather than full rewrites, keeping the overview accurate over time without drift
- Apply returned overview patches to D1 after each content generation call
- Add brand/visual theme fields to the overview, so image generation produces visually consistent results across a repo's posts
- Add overview display and manual edit capability in the repo settings view

## Capabilities

### New Capabilities
- `repo-overview`: Persistent per-repo project context storage, bootstrap via GitHub API + Gemini extraction, auto-update via field-level patches on each content generation cycle, manual editing via Telegram UI

### Modified Capabilities
- `commit-data-pipeline`: Content generation prompt now includes repo overview context alongside commit messages and file names
- `multi-perspective-prompts`: System prompt updated to leverage repo overview for better contextual tweets and image prompts; Gemini response format extended with `overviewUpdates` field
- `image-generation`: Image prompt generation now uses repo visual theme and brand identity from overview for visual consistency
- `structured-image-prompts`: Image prompt structure may reference repo brand colors and visual identity from overview

## Impact

- **Database**: New `repo_overviews` table with FK to `repos`
- **Gemini service**: Modified system prompt, extended response parsing, new overview extraction function
- **GitHub service**: New function to fetch README content and recent PR summaries for bootstrap
- **Telegram UI**: New `/overview` command, overview section in repo settings view
- **Types**: New `RepoOverview` type, extended `ContentResponse` type with `overviewUpdates`
- **Content flow**: Every `generateContent()` call now reads overview from D1, passes to prompt, and applies returned patches
