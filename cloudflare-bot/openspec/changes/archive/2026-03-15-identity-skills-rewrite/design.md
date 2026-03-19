## Context

The bot currently uses 9 database-backed system prompts (stored in `default_prompts` / `user_prompts` tables) that instruct Gemini in a generic "you are an AI writer" voice. The prompt storage infrastructure (DB tables, resolution with fallback, version tracking, admin push, user customization, WebApp editors) is fully built and working.

This change replaces all prompt content with a new "skill" architecture where Gemini writes in first-person as the user, powered by an Identity Document generated from the user's own tweets. The storage infrastructure stays; the content and assembly logic change.

**Current call flow:**
```
getPrompt(env, chatId, type, lang) → single prompt string → systemInstruction
```

**New call flow:**
```
assembleSystemInstruction(env, chatId, type, lang) → skill + identity + protocol → systemInstruction
```

## Goals / Non-Goals

**Goals:**
- Replace all 9 system prompts with first-person self-narrative skills
- Add identity analysis system (tweet fetch → Gemini analysis → Identity Document)
- Build `assembleSystemInstruction()` for three-layer assembly (skill + identity + task protocol)
- Rename all prompt types to new skill names across DB, API, and UI
- Merge `handwrite_refine` into `refine` skill
- Add identity step to onboarding flow
- Remove on-demand persona generation for manual reposts
- Remove tweet history from quote generation context

**Non-Goals:**
- Identity evolution/feedback loop (future — tracked in proposal but not implemented now)
- Video skill expansion to scenes/characters (future)
- Instagram-specific skills (out of scope)
- Changing the Gemini models used per skill (all stay on gemini-3.1-pro per user's decision)
- Changing the WebApp UI framework or layout (just updating labels and adding identity tab)

## Decisions

### Decision 1: Three-layer assembly in `prompts.ts`, not in each caller

**Choice:** Add `assembleSystemInstruction()` to `services/prompts.ts` as the single assembly point. Callers (`gemini.ts`, `repost-generate.ts`, `scoring.ts`) call this instead of `getPrompt()` directly.

**Why not assemble in each caller?** The assembly logic (skill + identity + optional image-gen + protocol) would be duplicated across 6+ call sites. Centralizing ensures consistent identity injection and makes it easy for the admin to change assembly behavior.

**How it works:**
```typescript
async function assembleSystemInstruction(
  env: Env, chatId: string, type: SkillType, lang: string,
  options?: { attachImageGen?: boolean }
): Promise<string> {
  const skill = await getPrompt(env, chatId, type, lang);

  const parts = [skill];

  // Identity injection for identity-attached skills
  if (IDENTITY_ATTACHED_SKILLS.includes(type)) {
    const identity = await getPrompt(env, chatId, 'who-am-i', lang);
    parts.push(identity);
  }

  // Optional image-gen attachment
  if (options?.attachImageGen) {
    const imageGen = await getPrompt(env, chatId, 'image-gen', lang);
    parts.push(imageGen);
  }

  return parts.join('\n\n');
}
```

**Task protocol:** The task protocol (JSON format specs, field constraints) is embedded as the final section of each skill prompt itself — it's part of the skill content in the DB, not a separate stored entity. This keeps the editable unit self-contained: when the admin edits a skill, they see and can modify the output format too.

**Alternative considered:** Storing task protocols as separate DB entries. Rejected because it adds complexity (more prompt types, more DB rows) for minimal benefit — the protocol rarely changes independently of the skill.

### Decision 2: Clean rename via DB migration, no backward compatibility layer

**Choice:** A single migration renames all `prompt_type` values in `default_prompts` and `user_prompts` using UPDATE statements. The TypeScript type and all code references change simultaneously.

**Migration approach:**
```sql
-- Rename prompt types in default_prompts
UPDATE default_prompts SET prompt_type = 'work-progress' WHERE prompt_type = 'content';
UPDATE default_prompts SET prompt_type = 'refine' WHERE prompt_type = 'edit';
UPDATE default_prompts SET prompt_type = 'quote' WHERE prompt_type = 'repost';
UPDATE default_prompts SET prompt_type = 'know-my-project' WHERE prompt_type = 'overview';
UPDATE default_prompts SET prompt_type = 'what-i-like' WHERE prompt_type = 'scoring';
UPDATE default_prompts SET prompt_type = 'persona' WHERE prompt_type = 'persona';  -- unchanged
UPDATE default_prompts SET prompt_type = 'video' WHERE prompt_type = 'video';      -- unchanged
UPDATE default_prompts SET prompt_type = 'image-gen' WHERE prompt_type = 'handwrite_image';
DELETE FROM default_prompts WHERE prompt_type = 'handwrite_refine';

-- Same renames for user_prompts
UPDATE user_prompts SET prompt_type = 'work-progress' WHERE prompt_type = 'content';
-- ... (same pattern)

-- Insert new who-am-i rows
INSERT INTO default_prompts (prompt_type, language, content, version)
VALUES ('who-am-i', 'en', '<skill content>', 1);
INSERT INTO default_prompts (prompt_type, language, content, version)
VALUES ('who-am-i', 'he', '<skill content>', 1);
```

**Why no backward compatibility?** Single-user bot currently (multi-tenant but small scale), deployed as a single Cloudflare Worker. Migration and code deploy happen atomically via `wrangler deploy`. No rolling deployment where old code reads new DB.

**Alternative considered:** Display-name mapping layer (keep old DB names, map in UI). Rejected per user feedback — clean rename is simpler and avoids a translation layer that would need maintenance.

### Decision 3: Identity Document stored as regular `user_prompts` row

**Choice:** The Identity Document is stored in `user_prompts` with `prompt_type = 'who-am-i'`, using the exact same table and resolution logic as all other skills.

**Why not a separate `user_identity` table?** The Identity Document functionally IS a prompt — it's text that gets injected into the system instruction. Storing it in the same table means:
- `getPrompt()` already handles resolution (user custom → default fallback)
- The WebApp editor already knows how to CRUD `user_prompts` rows
- Version tracking and staleness detection work out of the box
- Admin push/notification system works without changes

**The dual nature of `who-am-i`:** The `default_prompts` row for `who-am-i` contains the *analysis skill* (instructions for generating identity documents). The `user_prompts` row for `who-am-i` contains the *Identity Document itself* (the output of that analysis). This is a semantic overload of the same prompt type, but it works because:
- When the admin edits `who-am-i` default → they're editing the analysis instructions
- When a user edits `who-am-i` custom → they're editing their identity info
- When `assembleSystemInstruction()` resolves `who-am-i` for identity injection → it gets the user's document (or default skeleton)
- When the identity analysis flow runs → it reads the default `who-am-i` as the analysis skill

**Potential confusion:** The admin's "Save & Push" for `who-am-i` pushes the analysis skill, which marks user identity documents as "stale." This is actually correct — if the admin improves the analysis skill, users should know their identity was built with an older version and can re-analyze.

### Decision 4: Tweet fetching uses existing X API credentials and patterns

**Choice:** Build `fetchUserTweets()` in `services/x.ts` following the same OAuth 1.0a patterns as existing X API calls (`getUserTweets`, `publishTweet`, etc.). Fetch from the `users/me/tweets` endpoint (v2 API) since we have user-context OAuth tokens.

**Tweet filtering:**
- Call X API v2 `GET /2/users/:id/tweets` with `max_results=100`, `tweet.fields=referenced_tweets,created_at,text`, `exclude=retweets`
- The `exclude=retweets` parameter handles pure retweet filtering at the API level
- Quote tweets and replies are included by default
- Tag each tweet as `original`, `quote`, or `reply` based on `referenced_tweets` field for weighted analysis

**Rate limits:** X API v2 user timeline endpoint allows 900 requests per 15 minutes (app-level). Identity analysis is infrequent (onboarding + manual re-trigger), so rate limits are not a concern.

**Alternative considered:** Scraping or using a third-party service. Rejected — the user already has connected X credentials, and the official API provides structured data with tweet type classification.

### Decision 5: Refine skill unification — single entry point, instruction as parameter

**Choice:** Both `editContent()` and `refineHandwrittenContent()` call the same underlying function that uses the `/refine` skill. The difference is whether an edit instruction is provided.

```typescript
async function refineContent(
  env: Env, content: DraftContent,
  options: {
    instruction?: string;          // undefined = handwrite mode
    generateImagePrompt: boolean;
    chatId: string;
    lang: string;
  }
): Promise<DraftContent> {
  const systemInstruction = await assembleSystemInstruction(
    env, options.chatId, 'refine', options.lang,
    { attachImageGen: options.generateImagePrompt }
  );

  // Build user prompt — instruction framed as self-directed if present
  const userPrompt = options.instruction
    ? `Here's a draft. I want to change it like this: ${options.instruction}\n\n${tweetsText}`
    : `Here's a draft. I want to rewrite it in my own voice.\n\n${tweetsText}`;

  // ... call Gemini, parse response
}
```

**Why merge?** The existing `editContent()` and `refineHandwrittenContent()` do the same thing — take text, apply Gemini, return refined text. The only differences are: (a) edit has a user instruction, handwrite doesn't, and (b) handwrite has image gen toggling. Both collapse into a single function with optional parameters.

### Decision 6: Quote generation — identity + tweet only, no persona bootstrap

**Choice:** The `/quote` skill receives: (1) user's identity (always, via system instruction), (2) the tweet being quoted (user prompt), (3) the author's persona IF the account is already followed. No on-demand persona creation. No tweet history.

**Why remove tweet history?** The identity system now carries the user's voice and reaction patterns. The tweet history was compensation for not knowing who the user is — with identity, it's redundant context that adds tokens without proportional value.

**Why no on-demand persona?** Persona bootstrap requires a Gemini call with Google Search grounding — that's an extra API call, extra latency, and extra cost for a one-time repost. The user's identity is the primary driver of voice quality. Persona is a nice-to-have that enriches context for accounts the user cares enough about to follow.

**The `/persona` skill still exists** — it runs during the follow flow and for the cron-based persona refresh. It just doesn't run on-demand during manual reposts anymore.

### Decision 7: Skill content — written from scratch, not patched

**Choice:** All 9 skill prompts (× 2 languages = 18 texts) are written from scratch in the new first-person self-narrative format. No attempt to patch or transform existing prompts.

**Why from scratch?** The existing prompts are fundamentally structured around "You are an AI that..." framing. Converting them to "I am..." would produce Frankenstein text. The psychological grounding, emotional framing, and self-directed task structure require fresh writing.

**Writing order:**
1. `/who-am-i` (analysis skill) — foundation, defines what identity documents look like
2. `/work-progress` — highest-frequency creative skill, most visible output
3. `/refine` — closely related to work-progress, similar voice needs
4. `/quote` — reaction/engagement skill, tests identity + persona interaction
5. `/what-i-like` — scoring with identity, subjective evaluation
6. `/know-my-project` — project understanding with emotional grounding
7. `/video` — admin-only, adapted speaking style
8. `/persona` — utility, lightest rewrite
9. `/image-gen` — visual module, least change from current

**Hebrew versions:** Written by the admin (native speaker) after English versions are validated. The skill structure is language-independent; the self-narrative content is language-specific.

### Decision 8: Onboarding identity step placement

**Choice:** The identity step comes after the GitHub token step and before completion. Order: welcome → gemini key → X keys → github token → **identity** → completion.

**Why after all API keys?** The identity analysis requires X API credentials (`has_x = 1`). Placing it after the X keys step guarantees credentials are available if the user chose to connect X. If they skipped X, the "Understand who I am" button gracefully explains that X credentials are needed and offers the default.

**Why not make it the first step?** The user needs to understand what the bot does before they invest in identity analysis. By the time they reach the identity step, they've connected at least some services and are committed to using the bot.

## Risks / Trade-offs

**[Risk] Identity analysis produces shallow or generic results** → Mitigation: The `/who-am-i` skill must be the most carefully crafted prompt in the system. Admin iterates on it through real-world testing. Users can edit results. Re-analysis available anytime.

**[Risk] Token cost increase ~2x per creative call** → Mitigation: Identity is ~400-800 tokens, amortized across the full context window. Quality improvement reduces regeneration cycles (fewer "try again" clicks), which may offset the per-call cost. Monitor via Gemini API usage dashboard.

**[Risk] 18 prompts written from scratch could have quality regressions** → Mitigation: Admin has full edit access to all skills and can iterate post-deploy. The old prompts are preserved in git history. Deploy to admin account first for testing before pushing to all users.

**[Risk] The dual nature of `who-am-i` (analysis skill in default, identity doc in user) could confuse future developers** → Mitigation: Clear comments in code. The `assembleSystemInstruction()` function always resolves user-level `who-am-i` for injection (getting the identity doc), never the default (which is the analysis skill). The analysis flow explicitly reads the default prompt.

**[Risk] Clean rename breaks any external integrations** → Mitigation: No external integrations exist. The API is only consumed by the Telegram bot and the two WebApps, all deployed from the same codebase.

**[Risk] Users who customized old prompts lose their customizations during rename** → Mitigation: The migration renames `prompt_type` values in-place — the `content` column (actual prompt text) is preserved. A user who customized `content` will have their text under `work-progress` after migration. However, their text was written for the old "You are..." paradigm and may feel inconsistent with the new architecture. The stale notification system will flag this.

**[Trade-off] No on-demand persona for manual reposts reduces context richness** → Accepted: The identity system compensates. Users who want rich persona context for an account can follow it first.

**[Trade-off] No backward compatibility means atomic deploy** → Accepted: Single codebase, single Worker, `wrangler deploy` is atomic. No rolling deployment scenario to worry about.

## Migration Plan

**Phase 1: Schema & rename migration**
1. New D1 migration file: rename all `prompt_type` values, delete `handwrite_refine` rows, insert `who-am-i` skeleton defaults
2. Update `PromptType` union, `ALL_SKILLS`, `USER_EDITABLE_SKILLS`, `IDENTITY_ATTACHED_SKILLS` constants
3. Update all `getPrompt()` call sites to use new type names

**Phase 2: Assembly function**
4. Add `assembleSystemInstruction()` to `prompts.ts`
5. Wire all Gemini callers to use `assembleSystemInstruction()` instead of `getPrompt()` directly
6. Merge `editContent()` + `refineHandwrittenContent()` into unified `refineContent()`

**Phase 3: Identity system**
7. Add `fetchUserTweets()` to `x.ts`
8. Add identity analysis handler (calls Gemini with `/who-am-i` skill, stores result)
9. Add identity step to onboarding flow
10. Add "Re-analyze" button to settings view

**Phase 4: Skill content**
11. Write all 9 English skill prompts from scratch
12. Write all 9 Hebrew skill prompts
13. Seed new skill content into `default_prompts` (replaces old content via migration)

**Phase 5: WebApp & cleanup**
14. Update user WebApp: 4 tabs with new skill names, identity info editor
15. Update admin WebApp: all skill names in dropdown
16. Remove `persona-cache.ts` on-demand persona logic from repost flow
17. Remove tweet history from repost user prompt builder
18. Remove old prompt constants from `prompts.ts` (the hardcoded seed strings)

**Rollback:** Git revert + `wrangler deploy`. The migration is reversible (rename types back, re-insert `handwrite_refine` rows). User identity documents would remain in `user_prompts` as orphaned `who-am-i` rows — harmless.

## Open Questions

1. **Default skeleton identity — how detailed should it be?** The proposal says minimal ("I'm a tech professional..."). Should it include any writing style guidance, or be truly bare-bones to motivate users to analyze?

2. **Hebrew skill prompts — who writes them?** The admin is a native Hebrew speaker. Should the English prompts be written first and then the admin adapts them to Hebrew, or should Hebrew be written independently with the same structure?

3. **Stale identity notification — should it trigger re-analysis offer?** When the admin pushes a new `/who-am-i` analysis skill, users' identity documents are marked stale. Should the bot proactively offer "Your identity was built with an older analysis — want to re-analyze?" or just show the stale badge in the WebApp?
