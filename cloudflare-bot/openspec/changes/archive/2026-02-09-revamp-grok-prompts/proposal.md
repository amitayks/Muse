## Why

The current Grok integration produces generic, low-engagement content. Image prompts are amateur plain-text strings ("futuristic, holographic"), tweet generation lacks creative depth, and too much raw PR data (body, stats, author) is sent to Grok while the actually meaningful data (commit messages, file names) is not. The `codeContext` and `tone` settings exist in the UI but are either unused dead code or too simplistic. We need a professional-grade prompt engineering system that produces genuinely engaging social media content and visually striking images.

## What Changes

- **BREAKING**: Lock down data sent to Grok to ONLY commit messages + file names (no more PR body, author, stats)
- **BREAKING**: Remove `codeContext` setting from `RepoConfig` and all UI surfaces (was never functional)
- **BREAKING**: Remove `tone` setting from `RepoConfig` and all UI surfaces (replaced by unified creative approach)
- Fetch actual commit messages from GitHub API for PRs (currently only SHA hashes are stored)
- Fetch changed file names from GitHub API for PRs
- Replace plain-text `imagePrompt` with structured JSON image prompt sent directly to image model
- Complete redesign of Grok system prompt using multi-perspective creative thinking (Creative Director, Tech Influencer, Copywriter, Growth Marketer, Art Director, Community Manager)
- Unified single prompt that handles both tweet creation and image prompt generation

## Capabilities

### New Capabilities
- `structured-image-prompts`: Structured JSON schema for image prompt generation, adapted for tech/code content. Sent directly to grok-2-image-1212 as JSON.
- `multi-perspective-prompts`: Multi-perspective system prompt engineering - Grok thinks from the perspectives of Creative Director, Art Director, Graphic Designer (for images) and Tech Influencer, Copywriter, Growth Marketer, Community Manager (for tweets).
- `commit-data-pipeline`: Enriched data pipeline that fetches actual commit messages and file names from GitHub API and webhook payloads, replacing the current metadata-only approach.

### Modified Capabilities

## Impact

- `cloudflare-bot/src/types.ts` — PRData, CommitData, DraftContent, RepoConfig type changes (breaking)
- `cloudflare-bot/src/services/grok.ts` — System prompt rewrite, buildContentPrompt rewrite, image prompt handling
- `cloudflare-bot/src/services/github.ts` — getPR() and getCommitData() enrichment with commit messages + file names
- `cloudflare-bot/src/handlers/github-webhook.ts` — Include commit messages and file names from webhook payload
- `cloudflare-bot/src/handlers/callback.ts` — Remove codeContext and tone toggle cases
- `cloudflare-bot/src/views/index.ts` — Remove codeContext and tone UI elements
- GitHub API usage increases slightly (fetching PR files endpoint)
