## 1. Schema & Rename Migration

- [x] 1.1 Create `cloudflare-bot/migrations/007_skill_rename.sql` — rename all `prompt_type` values in `default_prompts` and `user_prompts` (`content`→`work-progress`, `edit`→`refine`, `repost`→`quote`, `overview`→`know-my-project`, `scoring`→`what-i-like`, `handwrite_image`→`image-gen`), delete `handwrite_refine` rows, insert `who-am-i` skeleton defaults for `en` and `he`
- [x] 1.2 Update `PromptType` union in `cloudflare-bot/src/services/prompts.ts` to `'work-progress' | 'refine' | 'quote' | 'video' | 'know-my-project' | 'persona' | 'what-i-like' | 'who-am-i' | 'image-gen'`
- [x] 1.3 Add `ALL_SKILLS`, `USER_EDITABLE_SKILLS` (`['work-progress', 'refine', 'quote', 'who-am-i']`), and `IDENTITY_ATTACHED_SKILLS` (`['work-progress', 'refine', 'quote', 'video', 'know-my-project', 'what-i-like']`) constants in `prompts.ts`
- [x] 1.4 Update all `getPrompt()` call sites across the codebase to use new type names — `gemini.ts`, `repost-generate.ts`, `scoring.ts`, and any other callers

## 2. Assembly Function

- [x] 2.1 Add `assembleSystemInstruction(env, chatId, type, lang, options?)` to `prompts.ts` — concatenates skill prompt + identity document (for identity-attached skills) + optional image-gen attachment
- [x] 2.2 Wire `generateContent()` in `gemini.ts` to use `assembleSystemInstruction()` instead of `getPrompt()` directly
- [x] 2.3 Wire `editContent()` in `gemini.ts` to use `assembleSystemInstruction()`
- [x] 2.4 Wire `refineHandwrittenContent()` in `gemini.ts` to use `assembleSystemInstruction()`
- [x] 2.5 Wire repost generation in `repost-generate.ts` to use `assembleSystemInstruction(env, chatId, 'quote', lang)`
- [x] 2.6 Wire scoring in `scoring.ts` to use `assembleSystemInstruction()`
- [x] 2.7 Wire `extractRepoOverview()` in `gemini.ts` to use `assembleSystemInstruction()`
- [x] 2.8 Merge `editContent()` + `refineHandwrittenContent()` into unified `refineContent(env, content, options)` with optional `instruction` parameter — update all callers

## 3. Identity System

- [x] 3.1 Add `fetchUserTweets(env)` to `x.ts` — calls X API v2 `GET /2/users/:id/tweets` with `max_results=100`, `exclude=retweets`, `tweet.fields=referenced_tweets,created_at,text`; tags each tweet as `original`, `quote`, or `reply`
- [x] 3.2 Add identity analysis handler — takes fetched tweets, calls Gemini with the `/who-am-i` default skill prompt, stores the resulting Identity Document in `user_prompts` with `prompt_type='who-am-i'`
- [x] 3.3 Add identity step to onboarding flow in `commands/onboarding.ts` and `views/onboarding.ts` — placed after GitHub token step, two buttons: "Understand who I am" / "Use default"
- [x] 3.4 Handle "Understand who I am" button — fetch tweets, run analysis, show progress message, store result; handle missing X credentials gracefully (explain X is needed, offer default)
- [x] 3.5 Handle "Use default" button — store the skeleton default identity in `user_prompts`
- [x] 3.6 Add "Re-analyze my identity" button to settings view — fetches fresh tweets, runs analysis, shows preview for user confirmation before replacing existing identity

## 4. Repost System Changes

- [x] 4.1 Remove on-demand persona generation from repost flow — remove `persona-cache.ts` usage in `repost-generate.ts` so unknown accounts get no persona bootstrap
- [x] 4.2 Remove tweet history from repost user prompt builder in `repost-generate.ts` — context is limited to identity + tweet being quoted + persona if followed
- [x] 4.3 Update `buildRepostUserPrompt()` to use `user.language` instead of `config.language` for language instruction

## 5. Skill Content

- [x] 5.1 Write `/who-am-i` English skill prompt — analysis instructions for generating Identity Documents from tweets, first-person self-reflection framing
- [x] 5.2 Write `/work-progress` English skill prompt — self-narrative (~80%) + task protocol (~20%), first-person inner monologue about sharing work progress
- [x] 5.3 Write `/refine` English skill prompt — unified refine/edit skill, handles both "rewrite in my voice" (no instruction) and "change it like [instruction]" modes
- [x] 5.4 Write `/quote` English skill prompt — self-directed reaction framing ("this caught my attention"), identity takes precedence over tone setting
- [x] 5.5 Write `/what-i-like` English skill prompt — subjective scoring as self-evaluation ("do I like this?"), includes numeric score + self-reflective reason
- [x] 5.6 Write `/know-my-project` English skill prompt — project analysis as self-reflection, emotionally grounded first-person understanding
- [x] 5.7 Write `/video` English skill prompt — HeyGen video scripts, identity-attached, adapted for spoken format
- [x] 5.8 Write `/persona` English skill prompt — utility skill (no identity injection), rewritten in new format for analyzing X accounts
- [x] 5.9 Write `/image-gen` English skill prompt — visual direction module (no identity), never standalone, attached to calling skill
- [x] 5.10 Write all 9 Hebrew skill prompts (admin adapts from validated English versions) — using English as placeholder
- [x] 5.11 Seed all 18 skill prompts into `default_prompts` via migration or seed script — replaces old prompt content

## 6. WebApp & API Updates

- [x] 6.1 Update user WebApp in `routes/app.ts` — 4 tabs with new skill names: `/work-progress`, `/refine`, `/quote`, `/who-am-i` (identity info editor)
- [x] 6.2 Update admin WebApp in `routes/app-admin.ts` — dropdown shows all 9 skill names with `/` prefix
- [x] 6.3 Update prompt API endpoints in `routes/api-prompt.ts` to accept and return new prompt type names

## 7. Cleanup

- [x] 7.1 Remove `persona-cache.ts` on-demand persona logic (or the entire file if fully unused after repost changes)
- [x] 7.2 Remove old hardcoded seed prompt strings from `prompts.ts`
- [x] 7.3 Verify all old prompt type names (`content`, `edit`, `repost`, `overview`, `scoring`, `handwrite_refine`, `handwrite_image`) are fully removed from codebase — no references remain
