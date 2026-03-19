## Context

The `src/services/` directory has grown to 29 files spanning 5 distinct concerns: skill prompts (pure text), AI generation, external API clients, data persistence, and infrastructure utilities. All sit flat in one folder with no logical grouping, making navigation and maintenance increasingly difficult as the codebase grows.

Current file distribution by concern:
- **Skill prompts** (2 files, 702 lines): `skill-prompts-en.ts`, `skill-prompts-he.ts`
- **AI layer** (9 files, ~1600 lines): `gemini.ts`, `prompts.ts`, `identity.ts`, `scoring.ts`, `scoring-prompt.ts`, `repost-generate.ts`, `repost-prompt.ts`, `persona-bootstrap.ts`, `persona-prompt.ts`
- **External APIs** (6 files, ~1600 lines): `x.ts`, `github.ts`, `heygen.ts`, `telegram.ts`, `telegram-auth.ts`, `webhook.ts`
- **Data layer** (5 files, ~2100 lines): `db.ts`, `user-db.ts`, `user-keys.ts`, `storage.ts`, `r2.ts`
- **Infrastructure** (3 files, ~720 lines): `security.ts`, `crypto.ts`, `timezone.ts`
- **Feature orchestrators** (4 files, ~870 lines): `auto-approve.ts`, `batch-notification.ts`, `poller.ts`, `video-publish.ts`

## Goals / Non-Goals

**Goals:**
- Organize files into directories that reflect their domain responsibility
- Make it immediately clear where to find and modify any given concern
- Split monolithic skill prompt files into per-skill files for easier editing
- Zero runtime changes — pure structural refactor

**Non-Goals:**
- Splitting large files (e.g., `db.ts` at 1680 lines) — separate future effort
- Changing any function signatures, exports, or behavior
- Adding barrel exports for every directory (only `skills/` needs one)
- Refactoring internal code within moved files

## Decisions

### 1. Skill prompts get their own top-level `src/skills/` directory
**Rationale**: Skills are pure data (text constants), not logic. They should be editable by anyone without understanding the codebase. A dedicated `skills/` directory makes them instantly discoverable. Each file contains both EN and HE for colocation — when you update a skill's English version, the Hebrew version is right there.

**Alternative considered**: `src/prompts/` — rejected because "prompts" is overloaded (there's also `prompts.ts` which is CRUD logic, and the `*-prompt.ts` user prompt builders).

### 2. `prompts.ts` moves to `src/ai/`, not `src/data/`
**Rationale**: While `prompts.ts` does DB operations, its primary purpose is `assembleSystemInstruction()` — composing system prompts for Gemini calls. It's consumed exclusively by the AI layer (`gemini.ts`, `identity.ts`, `scoring.ts`, etc.). Placing it with its consumers follows the dependency direction.

**Alternative considered**: `src/data/prompts.ts` — rejected because it would create a circular-feeling dependency where AI imports from data for prompt assembly.

### 3. Each skill file exports `SKILL_EN` and `SKILL_HE` constants
**Rationale**: Colocation of translations in one file means when you edit the English prompt you see the Hebrew prompt right below. The barrel `index.ts` re-exports everything so `prompts.ts` has a single clean import.

**Format**: Each file exports two named constants (e.g., `WORK_PROGRESS_EN`, `WORK_PROGRESS_HE`). The `index.ts` also exports `getDefaultPromptTexts()` which was previously a private function in `prompts.ts`.

### 4. Feature orchestrators stay in `src/services/`
**Rationale**: `auto-approve.ts`, `batch-notification.ts`, `poller.ts`, and `video-publish.ts` are business logic that orchestrates other layers. They don't fit neatly into ai/, data/, or integrations/. Keeping them in a slim `services/` folder acknowledges their cross-cutting nature.

### 5. No barrel exports for ai/, integrations/, data/, infra/
**Rationale**: These directories contain files that are imported individually by name. Adding barrel `index.ts` files would create unnecessary coupling and circular dependency risks. Direct imports like `from '../ai/gemini'` are clear and explicit.

## Risks / Trade-offs

- **Large diff, many files touched** → Mitigated by TypeScript compiler catching every broken import. Run `tsc --noEmit` after each phase.
- **Git blame disruption** → `git log --follow <file>` preserves history for moved files. Git's rename detection handles this well for pure moves.
- **Merge conflicts if other branches exist** → Low risk since this is the main development branch. Execute as a single focused change.

## Migration Plan

Execute in two phases to keep each step verifiable:

**Phase 1: Skills extraction**
1. Create `src/skills/` with 9 individual files + `index.ts`
2. Update `prompts.ts` import to use `../skills`
3. Delete old `skill-prompts-en.ts` and `skill-prompts-he.ts`
4. Verify: `tsc --noEmit`

**Phase 2: Service reorganization**
1. Create directories: `src/ai/`, `src/integrations/`, `src/data/`, `src/infra/`
2. Move files to their new locations
3. Update all import paths across the entire codebase
4. Verify: `tsc --noEmit`
5. Deploy and smoke test
