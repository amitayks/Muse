## Context

The current content generation pipeline (`buildContentPrompt` → Gemini → parse response) sends only commit messages and file names, with no project context. Gemini generates tweets that describe changes in isolation. The `repos` table stores watch configuration but no semantic information about what the project does, its audience, or its visual identity.

The system runs on Cloudflare Workers with D1 (SQLite) for storage and Gemini API for text/image generation. All interactions happen through a Telegram bot.

## Goals / Non-Goals

**Goals:**
- Give Gemini full project context on every content generation call
- Keep the overview accurate over time via incremental field-level patches (not full rewrites)
- Provide a bootstrap mechanism to populate overview for existing repos
- Store brand/visual identity for image prompt consistency
- Keep overview size bounded (~500-1000 words) to control token usage

**Non-Goals:**
- Automatic README parsing on every webhook (too expensive, too slow)
- Version history / rollback of overview changes (simple overwrite is sufficient for now)
- Multi-language overviews (single language matching repo config)
- Fetching actual source code for context (commit messages + overview is enough)

## Decisions

### Decision 1: Separate `repo_overviews` table vs extending `repos.config`

**Chosen: Separate table with FK to repos**

The overview is a rich document (~500-1000 words across fields) that changes frequently. Storing it in `repos.config` JSON would bloat every config read and make partial updates harder. A separate table with `repo_id` FK keeps the config lightweight and overview operations isolated.

Alternative considered: Adding fields to `repos.config` JSON — rejected because config is read on every webhook for routing decisions, and we don't want to pull ~1KB of overview text on every config check.

### Decision 2: Field-level patches vs full overview replacement

**Chosen: Gemini returns field-level patches**

Asking Gemini to return `overviewUpdates: { key_features: { add: [...], remove: [...] }, summary: null }` means small commits only touch relevant fields. Full replacement risks drift — Gemini might forget details, hallucinate, or gradually shift tone over 50+ rewrites.

The patch format is: `null` = no change, `{ add: [...], remove: [...] }` for array fields (key_features, recent_changes), or a replacement string for scalar fields (summary, tech_stack, etc.) — only returned when the field genuinely changed.

Alternative considered: Full overview rewrite on each call — rejected due to drift risk and unnecessary token usage.

### Decision 3: Bootstrap via `/overview` command

**Chosen: Manual command that fetches README + recent PRs → Gemini extraction**

The initial overview is the foundation — it should be intentionally created, not auto-generated from a random webhook. The `/overview owner/repo` command will:
1. Fetch repo README via GitHub API (`GET /repos/{owner}/{repo}/readme`)
2. Fetch last 10 merged PRs via GitHub API (`GET /repos/{owner}/{repo}/pulls?state=closed&sort=updated&per_page=10`)
3. Send README + PR titles/descriptions to Gemini with a structured extraction prompt
4. Store the extracted overview in `repo_overviews`
5. Send preview to Telegram for user review

Alternative considered: Auto-bootstrap on first webhook — rejected because the first webhook might be a trivial commit, giving Gemini too little context for a good initial overview.

### Decision 4: Overview size constraint

**Chosen: Enforce ~500-1000 word budget via system prompt instruction**

The overview is included in every content generation prompt. At ~750 words average, that's ~1000 tokens — manageable within Gemini's context. The system prompt will instruct Gemini to keep individual fields concise (summary: 2-3 sentences, tech_stack: comma-separated list, key_features: max 10 items, etc.).

No hard enforcement in code — the system prompt instruction is sufficient since we control the extraction and patch prompts.

### Decision 5: `recent_changes` as a rolling window

**Chosen: Keep last 20 entries, FIFO eviction**

The `recent_changes` array stores brief descriptions of recent updates (from patches). When it exceeds 20 entries, the oldest are dropped. This gives Gemini enough recent history for context without unbounded growth.

## Risks / Trade-offs

**[Risk: Overview drift over many patches]** → Mitigation: Field-level patches minimize drift. If quality degrades over time, user can re-run `/overview` to reset from README. Monitor in practice.

**[Risk: Token cost increase per generation]** → Mitigation: Overview adds ~1000 tokens per call. At Gemini pricing this is negligible (~$0.001 per call). Worth it for significantly better content quality.

**[Risk: Bootstrap requires README]** → Mitigation: If repo has no README, the command falls back to using just PR history and commit patterns. User can also manually fill overview fields via the settings UI.

**[Risk: Gemini returns malformed patches]** → Mitigation: Validate patch structure before applying. If invalid, skip patch silently and log warning. Overview remains unchanged.

**[Trade-off: No version history]** → Accepted: Keeping it simple. If a bad patch corrupts the overview, user can re-bootstrap. Version history adds complexity with minimal value at this stage.
