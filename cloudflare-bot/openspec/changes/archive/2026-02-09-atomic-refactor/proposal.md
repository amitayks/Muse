## Why

The Cloudflare Telegram bot codebase has grown organically to ~6100 lines across 15 files with significant boilerplate duplication. The `sendMessage + updateChatState` pattern repeats ~25 times, the publish-with-image flow is duplicated 3x, and callback.ts/message.ts are giant switch statements (574/565 lines). This makes adding new features error-prone and maintenance costly. Additionally, `grok.ts` now uses Gemini exclusively and needs renaming.

## What Changes

- **Command/Action pattern**: Replace giant switch statements in `callback.ts` and `message.ts` with dispatch tables routing to individual handler files
- **Core utilities**: Extract `sendMessage + updateChatState` into a single `respond()` helper; extract the publish pipeline (image gen → upload → post → record) into a shared function
- **File-per-handler**: One file per slash command (~8), one file per callback action (~12), grouped in `commands/` and `actions/` directories
- **Split views**: Break the monolithic 519-line `views/index.ts` into domain-specific view files
- **Route handlers**: Pull inline admin/image/test route handlers out of `index.ts` into a `routes/` directory
- **Rename grok.ts → gemini.ts**: The service now uses Google Gemini exclusively
- **Consolidate image storage**: Move R2 storage logic out of the AI service so `gemini.ts` only generates images, and a separate `storage.ts` (or existing `r2.ts`) handles persistence
- **Awaiting-input handlers**: Extract input-awaiting state handlers into `inputs/` directory or merge into parent command files

**NOT changing** (already clean):
- `services/db.ts` — clean CRUD layer
- `services/security.ts` — rate limiting, validation
- `types.ts` — type definitions
- Database schema, API contracts, or user-facing features

## Capabilities

### New Capabilities
- `command-dispatch`: Command/Action dispatch pattern with router, handler context, and respond utility — replaces switch statements
- `publish-pipeline`: Shared publish pipeline (image generation → media upload → X post → DB record → user notification)
- `view-system`: Split view rendering into domain-specific modules (home, drafts, repos, published)
- `route-handlers`: HTTP route handlers extracted from index.ts into individual files

### Modified Capabilities
<!-- No existing specs to modify -->

## Impact

- **Code**: Complete restructure of `handlers/callback.ts`, `handlers/message.ts`, `views/index.ts`, `index.ts`, and rename of `services/grok.ts`
- **Files added**: ~30 new small files (commands, actions, views, routes, core utilities)
- **Files removed**: `handlers/callback.ts`, `handlers/message.ts`, `views/index.ts` (replaced by split files), `services/grok.ts` (renamed)
- **No API changes**: All external interfaces (Telegram webhook, GitHub webhook, cron, HTTP routes) remain identical
- **No database changes**: Schema and queries unchanged
- **No feature changes**: All existing capabilities preserved exactly
