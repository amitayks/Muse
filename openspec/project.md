# Project Context

## Purpose
Automate the creation and publishing of social media content (X/Twitter, Instagram) based on GitHub commits/PRs, followed Twitter accounts, and user-composed posts. The system monitors activity, generates engaging content using AI, creates avatar videos, and provides a Telegram bot interface for approval, scheduling, and management. Supports multiple users with per-user API keys and identity-aware content generation.

## Tech Stack
- **Runtime**: Cloudflare Workers (edge compute)
- **Database**: Cloudflare D1 (SQLite)
- **Storage**: Cloudflare R2 (images, videos, assets)
- **Language**: TypeScript
- **AI**: Google Gemini API (text generation, image analysis, scoring), Grok API (image generation)
- **Video**: HeyGen Avatar IV API (talking-head video generation)
- **Platforms**: X (Twitter) API v2, Instagram Graph API, Telegram Bot API, GitHub API

## Project Conventions

### Code Style
- TypeScript strict mode
- Biome for linting/formatting
- Functional approach where possible
- Explicit error handling with try/catch

### Architecture Patterns
- Edge-first: All processing happens on Cloudflare Workers
- Single-message UI: Telegram bot updates one message instead of spamming
- API-driven: All external interactions via REST APIs
- Multi-user: Per-user encrypted API keys, chat_id-scoped data isolation
- Identity-aware: User Identity Documents injected into AI prompts for personalized output
- Skill-based prompts: AI prompts organized as skills (work-progress, refine, quote, video, etc.) with DB-backed 3-level resolution (user custom → admin default → code fallback)

### Directory Structure
- `src/ai/` — Gemini API interactions, prompts, scoring, identity analysis
- `src/integrations/` — External API clients (X, GitHub, HeyGen, Telegram, webhook)
- `src/data/` — Database and storage (domain-split: draft-db, user-db, twitter-db, etc.)
- `src/infra/` — Cross-cutting utilities (security, crypto, timezone)
- `src/services/` — Feature orchestrators (auto-approve, batch-notification, instagram-publish, tweet-card, video-publish, poller)
- `src/skills/` — Skill prompt definitions (10 skills × 2 languages)
- `src/commands/` — Telegram slash command handlers
- `src/actions/` — Telegram callback action handlers
- `src/inputs/` — Telegram text/photo input handlers
- `src/views/` — Telegram message rendering (home, drafts, repos, accounts, settings, video)
- `src/routes/` — HTTP route handlers
- `src/handlers/` — Top-level event handlers (message, callback, cron, github-webhook)
- `src/core/` — Core orchestration (router, respond, publish)
- `src/ui/` — Shared UI components and i18n strings (en, he)

### Testing Strategy
- Manual testing via Telegram bot interactions
- Wrangler tail for real-time log monitoring

### Git Workflow
- Feature branches merged via PR
- Conventional commits preferred

## Domain Context
- **Draft**: Generated content waiting for approval (sources: auto, handwrite, repost, commit)
- **Commit Event**: A GitHub commit/PR event tracked for content generation
- **Compose Mode**: Interactive multi-message content authoring (handwrite, repost, commit modes)
- **Identity Document**: AI-generated first-person analysis of user's writing style, stored per-user
- **Persona**: AI-generated profile of a followed Twitter account
- **Skill**: A named prompt type (work-progress, refine, quote, video, etc.) that guides AI generation
- **Publish Targets**: Per-draft platform selection (X, Instagram Post, Instagram Story, Instagram Reel)
- **Thread**: Multi-tweet post on X
- **Tweet Card**: Rendered PNG image of a tweet for Instagram publishing
- **Video Draft**: HeyGen avatar video with multi-scene script, queued generation, and webhook completion

## Important Constraints
- Cloudflare Workers free tier: 10ms CPU time (API waits don't count)
- Telegram messages have 4096 char limit
- Instagram captions max 2200 chars
- Instagram carousel max 10 images
- X tweets max 4 images per tweet
- HeyGen Avatar IV: ~1 premium credit per 3 seconds of video
- Per-user API key encryption with AES-256-GCM

## External Dependencies
- Google Gemini API: Text generation, image analysis, identity analysis, tweet scoring
- Grok API: Image generation
- HeyGen API: Avatar IV video generation, photo avatar management
- X API v2: Posting tweets/threads/quote tweets, fetching user tweets
- Instagram Graph API: Publishing posts, carousels, stories, reels
- Telegram Bot API: Webhook-based interactions, inline keyboards
- GitHub API: Fetching commit/PR data, webhook verification

## Specifications
66 verified specs in `openspec/specs/`, organized by feature domain. All specs verified against actual implementation as of March 2026.
