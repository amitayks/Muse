## Context

The bot has three content creation flows that produce tweet drafts:

1. **Handwrite compose** (`/handwrite`): User writes tweets in compose mode with full control — AI refine, image gen, instruction, analyze toggles. Uses `refine` skill. State: `ComposeState` with `mode: 'handwrite'`.

2. **Repost compose** (`/repost` and batch notifications): Recently unified via `unified-compose-repost`. User enters compose mode with source tweet displayed, full control surface. Uses `quote` skill. Batch offers `[⚡ Fast]` / `[✏️ Edit]`. State: `ComposeState` with `mode: 'repost'`.

3. **Generate from commits** (`/generate` and GitHub webhooks): User provides SHA → bot immediately auto-generates via `work-progress` skill → creates draft → shows result. **No compose mode, no user control, no instruction, no initial thoughts.** Webhooks auto-generate and send notification with `[Approve] [View] [Edit] [Delete]`.

Key existing patterns from the unified-compose-repost change:
- `ComposeState` in `types.ts` supports `mode: 'handwrite' | 'repost'` with mode-specific source context
- `enterComposeMode` in `actions/compose-init.ts` handles shared compose initialization
- `handlePenDown` in `actions/compose.ts` branches on mode for skill selection
- `finalizeDraft` in `actions/compose.ts` handles image gen, display, and state update
- `buildRepostUserPrompt` was extended with `userTweets`, `instruction`, `threadText` sections
- Batch notifications offer `[⚡ Fast]` / `[✏️ Edit]` with `fastGenerateAction` and `editRepostAction`
- Image generation in handwrite mode uses `refineHandwrittenContent` which combines identity + skill + content → imagePrompt in a single AI call

Key existing patterns from the commit flow:
- `getContentSource` in `integrations/github.ts` fetches PR/commit data from GitHub API
- `generateContent` in `ai/gemini.ts` calls `buildContentPrompt` → `assembleSystemInstruction('work-progress')` → `callGeminiText`
- `buildContentPrompt` constructs a user prompt with commits, files, overview context
- `commitShaInput` in `inputs/commit-sha.ts` orchestrates the full flow inline (fetch → generate → draft → image → display)
- `handleGitHubWebhook` in `handlers/github-webhook.ts` auto-generates content, creates draft, sends notification
- `sendNotification` sends the notification with `[Approve] [View] [Edit] [Delete]` buttons

## Goals / Non-Goals

**Goals:**
- Extend `ComposeState` with `mode: 'commit'` and `sourceCommit` context field
- `/generate` enters compose mode with source commit displayed — not immediate auto-generation
- All compose controls (image, AI, instruction, message buffering) work in commit mode
- Pen down selects `work-progress` skill for commit mode, passes user tweets as "initial thoughts" and instruction
- Image generation follows handwrite pattern — imagePrompt generated as part of the AI call (identity + skill + content) using `refineHandwrittenContent` when user has tweets, or combining imagePrompt with `generateContent` response when generating from scratch
- GitHub webhook notifications offer `[⚡ Fast]` (preserve current auto-gen as one-click) and `[✏️ Edit]` (open compose)
- Webhook handler stores content source data for deferred generation instead of auto-generating
- Shared utilities extracted for patterns repeated across repost and commit flows
- `work-progress` skill gains "initial thoughts" paragraph (same pattern as `quote` skill)
- `buildContentPrompt` extended with `userTweets` and `instruction` sections

**Non-Goals:**
- Changing the `work-progress` or `refine` skill prompts structurally (only adding "initial thoughts" paragraph to `work-progress`)
- Modifying the publish pipeline (commits still create drafts with `source: 'auto'` or `source: 'commit'`)
- Per-repo generation settings (start with per-user, iterate later)
- Merging `/handwrite`, `/repost`, and `/generate` into one command (separate entry points)
- Changing GitHub webhook verification or event handling logic
- Auto-approve flow changes
- Video compose integration

## Decisions

### 1. `ComposeState` gains `mode: 'commit'` and `sourceCommit` field

Extend the `mode` union and add a new interface:

```typescript
interface ComposeSourceCommit {
    type: 'pr' | 'commit';
    repo: string;            // "owner/repo"
    repoShort: string;       // "repo" (display)
    repoId?: string;         // DB repo ID for overview context
    title: string;           // PR title or commit message first line
    prNumber?: number;       // PR number if from PR
    commitSha: string;       // head commit SHA
    commitMessages: string[]; // sanitized commit messages
    fileNames: string[];     // changed file paths
    filesChanged: number;
    additions: number;
    deletions: number;
    author: string;
}

interface ComposeState {
    mode: 'handwrite' | 'repost' | 'commit';
    // ... existing fields ...
    sourceTweet?: ComposeSourceTweet;   // repost mode
    sourceCommit?: ComposeSourceCommit; // commit mode
    sourceAccountId?: string;           // repost mode
    batchTweetId?: string;              // repost mode
}
```

**Rationale**: Same pattern as `sourceTweet` for repost. The `sourceCommit` carries all data needed for AI generation and display, avoiding re-fetching from GitHub.

### 2. `/generate` enters compose mode — no immediate auto-generation

Current flow:
```
/generate → SHA → fetch PR/commit → generateContent → draft → image → display
```

New flow:
```
/generate → SHA → fetch PR/commit → renderCompose (with sourceCommit) → compose session → [Pen Down] → AI → draft
```

The `commitShaInput` handler is refactored to:
1. Parse SHA, fetch content source (same as today via `getContentSource`)
2. Check for duplicate draft by commit SHA (same as today)
3. Build `ComposeSourceCommit` from fetched data
4. Call `enterComposeMode` with `mode: 'commit'`, `sourceCommit` from fetched data, `aiRefine: true` (default ON), `imageGen: true` (default ON — commits benefit from images)
5. Set `awaiting_input: 'handwrite'` and store `ComposeState` in context

If a duplicate exists, show warning in compose view with `[View Existing]` button (same pattern as repost duplicate detection).

**Rationale**: Consistent with repost compose. Users who want the "old" immediate behavior can simply hit Pen Down right away. Those who want control get it.

### 3. `renderCompose` extended with commit header section

When `sourceCommit` is present, the compose view renders a header:

```
📌 repo | PR Title
  3 commits · 8 files · +142 / -37
────────────────────
(compose controls + tweet buffer below)
```

For push events (no PR number):
```
📌 repo | First commit message
  3 commits · 8 files
────────────────────
```

The commit title is NOT hyperlinked (unlike repost where tweet URL is clickable) because there's no single canonical URL for a content source (PRs have URLs, direct pushes less so). If `prNumber` is present, the title could link to the PR on GitHub — but this is optional polish.

The `ComposeOptions` interface gains `sourceCommit`:
```typescript
interface ComposeOptions {
    instruction?: string;
    awaitingInstruction?: boolean;
    analyzeImages?: boolean;
    sourceTweet?: ComposeSourceTweet;
    sourceCommit?: ComposeSourceCommit;
    existingDraftId?: string;
}
```

Empty state instructions for commit mode: "Add your own tweets, attach images, or tap Pen Down to generate from this change."

**Rationale**: Extending `ComposeOptions` keeps backward-compatible. The commit header is visually similar to the repost header but shows different metadata.

### 4. Pen down branches for commit mode with `work-progress` skill

Updated `handlePenDown` logic:

```
if mode === 'commit':
    if aiRefine:
        if hasTweets (user wrote initial thoughts):
            // Hybrid: user has ideas + commit context → use work-progress for fresh generation
            // then refine user tweets with the generated angle
            skill = 'work-progress'
            prompt = buildContentPrompt(sourceCommit, overview, {
                userTweets, instruction, language
            })
            systemPrompt = assembleSystemInstruction(env, chatId, 'work-progress', lang)
        else:
            // Pure generation from commit (same as current auto-gen path)
            skill = 'work-progress'
            prompt = buildContentPrompt(sourceCommit, overview, {
                instruction, language
            })
            systemPrompt = assembleSystemInstruction(env, chatId, 'work-progress', lang)

        // Image prompt handling:
        if imageGen:
            // Image prompt is part of work-progress response (already returns imagePrompt)
            // No separate image-gen call needed — work-progress skill already includes imagePrompt in JSON

        // If user has tweets AND AI on, use refineHandwrittenContent for the final output
        // with the commit context as instruction context
    else:
        // No AI — save user's tweets as-is as a draft with source: 'commit'
        // Attach commit metadata (pr_number, pr_title, commit_sha) to draft

if mode === 'handwrite':
    // Existing logic unchanged

if mode === 'repost':
    // Existing logic unchanged
```

For commit mode with AI on and NO user tweets: call `generateContent` directly (same function as today's auto-gen). It already returns `imagePrompt` in the response.

For commit mode with AI on and user tweets: call `refineHandwrittenContent` with the user tweets, using the commit context as supplementary instruction. The `instruction` parameter combines the commit data summary with the user's instruction.

For commit mode with AI off: save user tweets directly as draft with `source: 'commit'` and commit metadata.

**Rationale**: Two distinct paths for "generate from scratch" vs "refine user's initial thoughts" keeps the AI prompts clean. The work-progress skill already handles imagePrompt generation.

### 5. `work-progress` skill gains "initial thoughts" paragraph

Add to `WORK_PROGRESS_EN` and `WORK_PROGRESS_HE`:

```
Sometimes I already have rough thoughts forming — a half-drafted angle, an opening line, a vibe I want to hit. When that happens, those initial thoughts are my jumping-off point. I don't copy them word for word — I use them as raw material and reshape them through my voice. They show the direction I'm leaning, not where I must land.
```

**Rationale**: Same pattern as quote skill. Maintains self-directed perspective. The AI reads it as internal creative process.

### 6. `buildContentPrompt` extended with user context sections

Current signature builds prompt from `ContentSource` and `RepoOverview`. Extended:

```typescript
function buildContentPrompt(
    source: ContentSource,
    overview?: RepoOverview | null,
    language?: string,
    options?: {
        userTweets?: string[];
        instruction?: string;
    }
): string
```

New sections appended when present:

```
MY INITIAL THOUGHTS:
1. First tweet text
2. Second tweet text

WHAT I'M GOING FOR:
Instruction text here
```

**Rationale**: Same pattern as `buildRepostUserPrompt` extension. Optional sections that are only included when data exists.

### 7. `generateContent` extended with user context

```typescript
export async function generateContent(
    env: Env,
    source: ContentSource,
    repoId?: string,
    language?: string,
    chatId?: string,
    options?: {
        userTweets?: string[];
        instruction?: string;
        userImageParts?: ImagePart[];
    }
): Promise<ContentResponse>
```

When `userImageParts` are provided, uses multimodal prompt (same as repost's image analysis pattern).

**Rationale**: Keeps the function signature backward-compatible. Existing callers pass no options and get current behavior.

### 8. GitHub webhook refactored: notification-only with deferred generation

Current webhook flow:
```
webhook → verify → fetch PR data → generateContent → createDraft → sendNotification
```

New webhook flow:
```
webhook → verify → build ContentSource → store in webhook_events table → sendNotification (no draft yet)
```

However, this introduces a new table and complexity. Simpler alternative:

**Keep auto-generation in webhooks, but change notification buttons.** The webhook still auto-generates a draft (preserving the current "it just works" behavior for users who don't interact). The notification buttons change to offer more control:

```
[⚡ Fast ✅] [✏️ Edit] [👀 View] [🗑 Delete]
```

- **`[⚡ Fast ✅]`** → Same as current `[Approve]` — the draft is already generated, this approves it. Label changed to match repost batch UX consistency.
- **`[✏️ Edit]`** → Opens a compose session with the source commit pre-loaded from the existing draft's metadata. The user can then modify, add instruction, toggle image, etc. Pen down creates a NEW draft (or replaces the auto-generated one).
- **`[👀 View]`** → Same as current — navigates to draft detail.
- **`[🗑 Delete]`** → Same as current — deletes the draft.

Wait — this doesn't match the repost "Fast Generate" pattern exactly. In repost, "Fast" generates on demand because no draft exists yet. In webhooks, the draft already exists.

**Revised approach**: Two paths based on user setting:

**Option A: Auto-generate (current behavior, default)**
Webhook creates draft automatically. Notification shows: `[✅ Approve] [✏️ Edit] [👀 View] [🗑 Delete]`

The `[✏️ Edit]` button opens a compose session with `sourceCommit` pre-loaded from the draft's metadata (commit_sha, pr_number, pr_title). The user can write initial thoughts, set instruction, toggle controls, and pen down to regenerate — creating a new draft that replaces the auto-generated one.

**Option B: Notify-only (opt-in via setting)**
Webhook stores the event data and sends notification WITHOUT generating: `[⚡ Fast] [✏️ Edit]`

"Fast" generates immediately (same as webhook auto-gen). "Edit" opens compose.

For simplicity, we go with **Option A** as default behavior (no breaking change) and add the `[✏️ Edit]` button to the existing notification. This lets users who want control get it without changing the default behavior for everyone.

**Implementation of Edit Commit from webhook notification:**
1. Parse `draftId` from callback data
2. Load the draft from DB to get `commit_sha` and `pr_title`
3. Use `commit_sha` to re-fetch content source from GitHub (via `getContentSource`)
4. OR: Store `ContentSource` as JSON on the draft itself (new `source_data` column — avoids re-fetching)
5. Build `ComposeSourceCommit` from stored/fetched data
6. Call `enterComposeMode` with `mode: 'commit'`, `sourceCommit`

Storing `ContentSource` on the draft is cleaner — avoids a GitHub API call and works even if the user's GitHub token has expired. Add a `source_data TEXT` column to `drafts` table.

**Rationale**: Preserves existing auto-generation behavior (no breaking change). Adds edit-compose capability for users who want control. The `source_data` column avoids costly re-fetches.

### 9. Draft `source_data` column for content source persistence

New column on `drafts` table:

```sql
ALTER TABLE drafts ADD COLUMN source_data TEXT;
```

Stores the serialized `ContentSource` JSON when a draft is created from a commit/PR source. This enables:
- "Edit Commit" from webhook notification without re-fetching from GitHub
- Regeneration from compose without network calls
- Future features like "regenerate with different settings"

The column is nullable — only populated for commit-sourced drafts. Repost drafts don't need it (source tweet data is already in `original_tweet_id/url` + `twitter_tweets` table).

**Rationale**: One column, big flexibility gain. No schema changes to existing data.

### 10. Shared utility extractions

Several patterns repeat across repost and commit compose:

**a. `buildPromptSections` utility** — builds optional "MY INITIAL THOUGHTS" and "WHAT I'M GOING FOR" sections:
```typescript
function buildPromptSections(options: {
    userTweets?: string[];
    instruction?: string;
}): string
```
Used by both `buildRepostUserPrompt` and `buildContentPrompt`.

**b. `handleComposeGeneration` utility** — shared pattern for compose pen-down generation:
The repost and commit pen-down handlers share a pattern: check AI toggle, build prompt, call AI, handle fallback, finalize draft. Extract the shared orchestration logic where possible while keeping mode-specific prompt building separate.

**c. Status message helpers** — formatting "Generating..." / "Refining..." status messages is repeated. Extract to shared helper.

**Rationale**: DRY principle. These utilities reduce duplication between three modes (handwrite already shares via `finalizeDraft`).

### 11. `enterComposeMode` extended for commit mode

```typescript
export interface EnterComposeOptions {
    mode: 'handwrite' | 'repost' | 'commit';
    sourceTweet?: ComposeSourceTweet;
    sourceCommit?: ComposeSourceCommit;
    sourceAccountId?: string;
    batchTweetId?: string;
    existingDraftId?: string;
    aiRefine?: boolean;
    imageGen?: boolean;
}
```

Mode-aware defaults:
- handwrite: `aiRefine: false`, `imageGen: false`
- repost: `aiRefine: true`, `imageGen: false`
- commit: `aiRefine: true`, `imageGen: true` (commits benefit from AI-generated images)

**Rationale**: Commit mode defaults to AI + image because the content source is technical (commits/PRs) and benefits from both AI storytelling and visual accompaniment.

### 12. Settings for commit defaults

Two new columns on `users` table:

```sql
ALTER TABLE users ADD COLUMN commit_fast_image INTEGER DEFAULT 1;
ALTER TABLE users ADD COLUMN commit_fast_ai INTEGER DEFAULT 1;
```

- `commit_fast_image`: Whether auto-generated webhook drafts include image generation (1=on by default)
- `commit_fast_ai`: Whether commit compose defaults to AI on (1=on by default)

Settings view gains a "Commit Defaults" section:

```
💻 Commit Defaults
[🎨 Auto Image: ON/OFF] [🤖 Auto AI: ON/OFF]
```

These affect both webhook auto-generation and the default toggles when entering compose via `/generate`.

**Rationale**: Symmetric with repost defaults. Users who want speed can turn off image gen for webhook auto-generation.

### 13. Backward compatibility for webhook notifications

Existing webhook notifications have buttons with `action:approve:DRAFT_ID`, `action:edit:DRAFT_ID`, etc. The `approve` and `edit` handlers already exist in the router.

The new `[✏️ Edit]` for commit compose needs a different handler than the existing `edit` action (which opens inline editing, not compose mode). Options:

- New action: `edit_commit:DRAFT_ID` → `editCommitAction`
- Reuse existing: Detect draft source and branch in `editAction`

Use a new action `edit_compose:DRAFT_ID` that detects the draft source and enters compose mode. For commit-sourced drafts, it reads `source_data` and enters commit compose. This handler could also work for future repost-sourced drafts edited from notifications.

**Rationale**: A generic `edit_compose` action is more future-proof than `edit_commit`. It reads the draft's source and branches accordingly.

### 14. Image generation follows handwrite pattern

The key difference from current commit image gen:

**Current**: `generateContent` returns `imagePrompt` in JSON response → `ensureImage` generates image separately using that prompt.

**Desired (handwrite pattern)**: The imagePrompt is generated as part of the AI call where identity + skill + content are combined. The `work-progress` skill already returns `imagePrompt` in its JSON output, so for "generate from scratch" the pattern is already correct.

For "generate with user's initial thoughts" (user has tweets), the path is:
1. If AI on + user tweets → `refineHandwrittenContent` with `generateImagePrompt: true`
2. `refineHandwrittenContent` uses `assembleSystemInstruction(env, chatId, 'refine', lang, { attachImageGen: true })` which attaches the `image-gen` skill to the system prompt
3. Identity + refine skill + image-gen skill combined → single Gemini call → tweets + imagePrompt

But wait — for commit mode with user tweets, we want the `work-progress` angle (commit context), not the `refine` angle (text refinement). Two options:

**Option A**: Pass commit context as the "instruction" to `refineHandwrittenContent`. The refine skill handles "I want to change it like this: [commit context]". This doesn't feel right — the refine skill is about polishing text, not generating from technical context.

**Option B**: For commit mode with user tweets, call `generateContent` with the commit source + userTweets + instruction. The `work-progress` skill already returns imagePrompt. The user tweets are included as "MY INITIAL THOUGHTS" in the prompt.

**Option B is correct.** The `work-progress` skill is the right framing for commit-based content. It already generates imagePrompt. We just extend `generateContent` to accept user tweets and instruction, and the flow works.

For commit mode WITHOUT user tweets: `generateContent` (same as today) — already generates imagePrompt.

For commit mode WITH user tweets: `generateContent` with `options.userTweets` — work-progress skill handles the initial thoughts, still generates imagePrompt.

Image is then lazily generated from `imagePrompt` via `ensureImage` during `finalizeDraft` (same pattern as handwrite). The key insight is: work-progress skill ALREADY combines identity + skill + content → imagePrompt. We don't need `refineHandwrittenContent` for commits.

**Rationale**: Work-progress is the right skill for commit content. It already handles imagePrompt. We just need to pass user context through.

## Risks / Trade-offs

- **[Risk] Commit compose adds a step for users used to immediate generation** → Mitigated by "Fast" auto-gen from webhooks (unchanged behavior) and the ability to immediately hit Pen Down in `/generate` compose. The extra step is opt-in control, not mandatory friction.

- **[Risk] `source_data` column adds storage** → Each `ContentSource` JSON is ~1-5KB. Acceptable for D1 per-row limits. The column is nullable and only populated for commit-sourced drafts.

- **[Risk] Re-fetching content source from GitHub for Edit Commit** → Mitigated by storing `source_data` on the draft. No GitHub API call needed for compose entry.

- **[Trade-off] `awaiting_input` stays `'handwrite'` for commit compose** → Same trade-off as repost compose. Slightly confusing in code but avoids touching router, input handler registration, and migrating existing chat states.

- **[Trade-off] Webhook still auto-generates (not notify-only)** → Preserves existing behavior but means the auto-generated draft may be discarded if user clicks Edit. Acceptable — the generation cost is already paid in the current system.

- **[Trade-off] No image analysis for commits (no source image)** → Unlike repost (which has a source tweet image), commits have no source image. The analyze toggle only applies to user-attached images. This is natural — commits are text-based content sources.

- **[Risk] `generateContent` signature growing** → Adding optional `userTweets`, `instruction`, `userImageParts` to `generateContent`. Use an options object to keep the signature clean.

## Migration Plan

1. **DB migration**: Add `source_data TEXT` to `drafts`, `commit_fast_image INTEGER DEFAULT 1` and `commit_fast_ai INTEGER DEFAULT 1` to `users` table.
2. **Code changes**: All changes are backward-compatible. Webhook auto-gen continues working during rollout.
3. **Deployment**: Single deployment. Existing webhook notifications with old button layout continue working (old callbacks still handled).
4. **Cleanup**: After 1 week, remove deprecated `commitShaInput` inline generation path (it becomes compose-only).
