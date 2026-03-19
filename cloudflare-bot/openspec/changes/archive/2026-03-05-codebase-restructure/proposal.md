## Why

The `src/services/` folder has 29 files dumped flat with no logical grouping — skill prompts sit next to DB operations, external API clients mix with infrastructure utilities. As the codebase grows (identity system, new skills, video pipeline), navigating and maintaining this becomes increasingly painful. Restructuring now creates clear boundaries between concerns and makes the codebase approachable.

## What Changes

- **Split skill prompts**: Break `skill-prompts-en.ts` and `skill-prompts-he.ts` (9 exports each) into 9 individual files, each containing both EN and HE versions of one skill
- **Create `src/skills/` directory**: Move all skill prompt files here with a barrel `index.ts` that re-exports everything and provides `getDefaultPromptTexts()`
- **Create `src/ai/` directory**: Move Gemini client, identity analysis, scoring, repost generation, persona bootstrap, and prompt CRUD/assembly here
- **Create `src/integrations/` directory**: Move X, GitHub, HeyGen, Telegram clients and webhook management here
- **Create `src/data/` directory**: Move DB operations, user-db, user-keys, storage, and R2 here
- **Create `src/infra/` directory**: Move security, crypto, and timezone utilities here
- **Slim `src/services/`**: Keep only feature orchestrators (auto-approve, batch-notification, poller, video-publish)
- **Update all import paths** across the entire codebase to match new locations

## Capabilities

### New Capabilities
- `skills-extraction`: Extract skill prompts into individual per-skill files in a dedicated `src/skills/` directory
- `service-reorganization`: Reorganize the flat `src/services/` folder into domain-specific directories (`ai/`, `integrations/`, `data/`, `infra/`)

### Modified Capabilities

_(No spec-level behavior changes — this is a pure restructure with no functional modifications)_

## Impact

- **Every file that imports from `services/`** will need updated import paths (~50+ files across actions, commands, handlers, inputs, routes, views, core)
- **Zero runtime behavior changes** — all exports remain the same, only file locations change
- **Build validation**: `tsc --noEmit` catches all broken imports
- **Git history**: Files moved via git will preserve blame with `git log --follow`
