## Context

The Cloudflare Telegram bot has ~6100 lines across 15 files. Two files dominate: `handlers/callback.ts` (574 lines, one giant switch) and `handlers/message.ts` (565 lines, three nested switches). The `sendMessage + updateChatState` pattern repeats ~25 times. The publish-with-image pipeline is duplicated 3x (callback publish, callback publish_approved, cron, and the /approve command). `views/index.ts` is a single 519-line file mixing all domains. `index.ts` has inline admin handlers. `services/grok.ts` now exclusively uses Gemini and needs renaming.

All services (`db.ts`, `security.ts`, `telegram.ts`, `github.ts`, `x.ts`, `webhook.ts`, `r2.ts`) are clean and well-structured — they stay untouched.

## Goals / Non-Goals

**Goals:**
- Eliminate the giant switch statements in callback.ts and message.ts with dispatch tables
- Kill the ~25x `sendMessage + updateChatState` boilerplate with a single `respond()` utility
- Extract the publish pipeline (image gen → upload → post → DB record) into one shared function
- Split the monolithic views file into domain-specific modules
- Pull admin route handlers out of index.ts into a routes directory
- Rename grok.ts → gemini.ts, consolidate image storage so gemini.ts only generates
- One file per command, one file per action, one file per input handler

**Non-Goals:**
- Changing db.ts, security.ts, types.ts, or any database schema
- Adding new features or changing any user-facing behavior
- Changing the Telegram webhook, GitHub webhook, or cron interfaces
- Refactoring services that are already clean (telegram.ts, github.ts, x.ts, webhook.ts)

## Decisions

### 1. Dispatch tables over class-based routing

**Choice**: Plain object maps (`Record<string, Handler>`) dispatching to handler functions.

**Alternative considered**: Class-based command pattern with `Command` interface. Rejected because the bot has simple stateless handlers — a class hierarchy adds indirection without benefit. Functions + maps are idiomatic TypeScript for this scale.

### 2. Handler Context object

**Choice**: Each handler receives a `HandlerContext` object:
```
{ env, chatId, messageId?, args? }
```

This replaces passing 4-5 parameters to every handler. All handlers return `ViewResult | void` — the router handles `respond()` automatically.

**Alternative considered**: Middleware chain (like Express). Rejected — too heavy for 20 handlers that share the same 3-line setup.

### 3. `respond()` utility kills the pattern

**Choice**: A single `respond(env, chatId, view, opts?)` function that:
- Calls `sendMessage` or `editMessage` based on opts
- Calls `updateChatState` with the view name and context
- Returns the message ID

This replaces the 25 occurrences of:
```ts
const messageId = await sendMessage(env, chatId, view.text, view.keyboard);
await updateChatState(env, chatId, { message_id: messageId, ... });
```

### 4. Shared publish pipeline

**Choice**: A single `publishDraft(env, chatId, draft)` function in `core/publish.ts` that handles:
- Parse content JSON
- Get or generate image (check R2 first, generate if missing)
- Upload media to X
- Post thread
- Update draft status + create published record

Used by: action `publish`, action `publish_approved`, cron handler, and `/approve` command.

### 5. File structure

```
src/
  index.ts           — Slim: just routing to routes/*
  types.ts           — Unchanged
  core/
    router.ts        — Dispatch tables + telegram update routing
    respond.ts       — respond() utility
    publish.ts       — Shared publish pipeline
  commands/
    start.ts         — /start
    generate.ts      — /generate
    approve.ts       — /approve (publish all approved)
    drafts.ts        — /drafts
    help.ts          — /help
    schedule.ts      — /schedule
    delete.ts        — /delete
    repos.ts         — /repos
    watch.ts         — /watch
  actions/
    view-change.ts   — view:home, view:drafts, etc.
    draft-detail.ts  — draft:{id}
    approve.ts       — action:approve:{id}
    reject.ts        — action:reject:{id}
    publish.ts       — action:publish:{id}
    publish-all.ts   — action:publish_approved
    regenerate.ts    — action:regenerate:{id}
    schedule.ts      — action:schedule:{id}
    unschedule.ts    — action:unschedule:{id}
    edit.ts          — action:edit:{id}
    repo-actions.ts  — action:add_repo, watch, unwatch, delete_repo, confirm_delete_repo, edit_repo
    config-toggle.ts — config:*:{repoId}
    pagination.ts    — page:{n}
  inputs/
    commit-sha.ts    — awaiting_input: commit_sha
    schedule.ts      — awaiting_input: schedule
    delete.ts        — awaiting_input: delete
    add-repo.ts      — awaiting_input: add_repo
    edit-draft.ts    — awaiting_input: edit_draft
  routes/
    webhook.ts       — POST /webhook (Telegram)
    github.ts        — POST /github-webhook
    setup.ts         — /setup
    migrate.ts       — /migrate
    test-x.ts        — /test-x
    test-generate.ts — /test-generate
    image.ts         — /image/*
    health.ts        — /health
  views/
    home.ts          — renderHome, renderHelp, renderGenerating, renderError, renderSuccess, renderPublishing
    drafts.ts        — renderDraftsList, renderDraftDetail, renderGeneratePrompt, renderSchedulePrompt, renderDeletePrompt
    repos.ts         — renderReposList, renderRepoDetail, renderAddRepo, renderDeleteRepoConfirm, renderRepoConfig
    index.ts         — Re-exports everything for backward compatibility during migration
  services/
    gemini.ts        — Renamed from grok.ts, image generation only (storage moved out)
    storage.ts       — Image storage: generateAndStoreImage, ensureImage (consolidates R2 logic)
    db.ts            — Unchanged
    security.ts      — Unchanged
    telegram.ts      — Unchanged
    github.ts        — Unchanged
    x.ts             — Unchanged
    webhook.ts       — Unchanged
    r2.ts            — Unchanged (storage.ts uses it)
  handlers/
    github-webhook.ts — Unchanged
    cron.ts          — Updated to use publish pipeline
```

### 6. Rename grok.ts → gemini.ts + split storage

**Choice**: `gemini.ts` keeps only AI generation functions: `generateContent`, `editContent`, `generateImage`, `callGeminiText`, `parseContentResponse`, prompts. Image storage (`generateAndStoreImage`, `ensureImage`) moves to `services/storage.ts` which imports from `gemini.ts` for generation and `r2.ts` / env.IMAGES for persistence.

**Alternative considered**: Keep everything in gemini.ts. Rejected because mixing AI API calls with R2 storage is a different concern — splitting makes each testable and reusable independently.

### 7. Router handles photo-to-text message transition

**Choice**: The photo/text message transition logic (currently in `handleCallback`) moves into `core/router.ts`. The router detects if the current message is a photo, and if the next view is text-only, it deletes the photo message and sends a new one. Individual action handlers don't need to know about this.

## Risks / Trade-offs

**[Many small files]** → 30+ new files may feel like over-splitting. Mitigated by clear naming, flat structure within each directory, and each file being <50 lines. Navigation is easy with file search.

**[Re-export during migration]** → `views/index.ts` becomes a re-export barrel during migration, which can cause confusion. Mitigated by removing it once all imports are updated.

**[Import depth]** → Actions importing from `core/`, `services/`, `views/` creates a 3-level import graph. Mitigated by keeping the graph acyclic: core depends on nothing, actions depend on core+services+views, routes depend on core.

**[No tests]** → Pure refactor without tests relies on manual testing via Telegram. Mitigated by keeping all external interfaces identical and doing incremental migration.
