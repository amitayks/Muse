## 1. Skills Extraction

- [x] 1.1 Create `src/skills/` directory
- [x] 1.2 Create `src/skills/who-am-i.ts` — extract `WHO_AM_I_EN` from `skill-prompts-en.ts` and `WHO_AM_I_HE` from `skill-prompts-he.ts`
- [x] 1.3 Create `src/skills/work-progress.ts` — extract `WORK_PROGRESS_EN` and `WORK_PROGRESS_HE`
- [x] 1.4 Create `src/skills/refine.ts` — extract `REFINE_EN` and `REFINE_HE`
- [x] 1.5 Create `src/skills/quote.ts` — extract `QUOTE_EN` and `QUOTE_HE`
- [x] 1.6 Create `src/skills/video.ts` — extract `VIDEO_EN` and `VIDEO_HE`
- [x] 1.7 Create `src/skills/know-my-project.ts` — extract `KNOW_MY_PROJECT_EN` and `KNOW_MY_PROJECT_HE`
- [x] 1.8 Create `src/skills/persona.ts` — extract `PERSONA_EN` and `PERSONA_HE`
- [x] 1.9 Create `src/skills/what-i-like.ts` — extract `WHAT_I_LIKE_EN` and `WHAT_I_LIKE_HE`
- [x] 1.10 Create `src/skills/image-gen.ts` — extract `IMAGE_GEN_EN` and `IMAGE_GEN_HE`
- [x] 1.11 Create `src/skills/index.ts` — re-export all 18 constants + export `getDefaultPromptTexts()` (move function from `prompts.ts`)
- [x] 1.12 Update `prompts.ts` to import from `../skills` instead of `./skill-prompts-en` and `./skill-prompts-he`; remove `getDefaultPromptTexts()` local definition, import from skills
- [x] 1.13 Delete `src/services/skill-prompts-en.ts` and `src/services/skill-prompts-he.ts`
- [x] 1.14 Verify: `tsc --noEmit` passes with zero errors

## 2. Create Target Directories

- [x] 2.1 Create `src/ai/`, `src/integrations/`, `src/data/`, `src/infra/` directories

## 3. Move AI Layer Files

- [x] 3.1 Move `services/gemini.ts` → `ai/gemini.ts`
- [x] 3.2 Move `services/prompts.ts` → `ai/prompts.ts`
- [x] 3.3 Move `services/identity.ts` → `ai/identity.ts`
- [x] 3.4 Move `services/scoring.ts` → `ai/scoring.ts`
- [x] 3.5 Move `services/scoring-prompt.ts` → `ai/scoring-prompt.ts`
- [x] 3.6 Move `services/repost-generate.ts` → `ai/repost-generate.ts`
- [x] 3.7 Move `services/repost-prompt.ts` → `ai/repost-prompt.ts`
- [x] 3.8 Move `services/persona-bootstrap.ts` → `ai/persona-bootstrap.ts`
- [x] 3.9 Move `services/persona-prompt.ts` → `ai/persona-prompt.ts`
- [x] 3.10 Update internal imports within `ai/` files (e.g., `gemini.ts` → `../data/db`, `../infra/security`; `identity.ts` → `../integrations/x`, etc.)
- [x] 3.11 Update all external importers of AI files (~18 files across actions, commands, handlers, inputs, routes)

## 4. Move Integrations Files

- [x] 4.1 Move `services/x.ts` → `integrations/x.ts`
- [x] 4.2 Move `services/github.ts` → `integrations/github.ts`
- [x] 4.3 Move `services/heygen.ts` → `integrations/heygen.ts`
- [x] 4.4 Move `services/telegram.ts` → `integrations/telegram.ts`
- [x] 4.5 Move `services/telegram-auth.ts` → `integrations/telegram-auth.ts`
- [x] 4.6 Move `services/webhook.ts` → `integrations/webhook.ts`
- [x] 4.7 Update internal imports within `integrations/` files (`heygen.ts` → `../infra/security`, `webhook.ts` → `../infra/security`)
- [x] 4.8 Update all external importers of integration files (~50+ files — telegram.ts alone has 38 importers)

## 5. Move Data Layer Files

- [x] 5.1 Move `services/db.ts` → `data/db.ts`
- [x] 5.2 Move `services/user-db.ts` → `data/user-db.ts`
- [x] 5.3 Move `services/user-keys.ts` → `data/user-keys.ts`
- [x] 5.4 Move `services/storage.ts` → `data/storage.ts`
- [x] 5.5 Move `services/r2.ts` → `data/r2.ts`
- [x] 5.6 Update internal imports within `data/` files (`db.ts` → `../infra/security`; `user-keys.ts` → `../infra/crypto`, `./user-db`; `storage.ts` → `../ai/gemini`, `../infra/security`, `../integrations/telegram`)
- [x] 5.7 Update all external importers of data files (~60+ files — db.ts alone has 55 importers)

## 6. Move Infra Files

- [x] 6.1 Move `services/security.ts` → `infra/security.ts`
- [x] 6.2 Move `services/crypto.ts` → `infra/crypto.ts`
- [x] 6.3 Move `services/timezone.ts` → `infra/timezone.ts`
- [x] 6.4 Update internal imports within `infra/` files (`security.ts` → `../data/user-db`)
- [x] 6.5 Update all external importers of infra files (~35+ files — security.ts has 29 importers)

## 7. Verify & Cleanup

- [x] 7.1 Verify `src/services/` contains only: `auto-approve.ts`, `batch-notification.ts`, `poller.ts`, `video-publish.ts`
- [x] 7.2 Update remaining `services/` files' internal imports (`auto-approve.ts` → `../data/db`; `batch-notification.ts` → `../data/db`, `../integrations/telegram`; `poller.ts` → `../integrations/x`; `video-publish.ts` → `../infra/security`, `../integrations/x`)
- [x] 7.3 Full build verification: `tsc --noEmit` passes with zero errors
- [x] 7.4 Verify no stale imports: grep for `from.*services/` should only match the 4 remaining service files
- [x] 7.5 Deploy and smoke test
