export const meta = {
  name: 'apply-identity-tweet-depth',
  description: 'Implement the add-configurable-identity-tweet-depth OpenSpec change across disjoint modules',
  phases: [
    { title: 'Foundation', detail: 'storage, X-integration, who-am-i skill, strings (disjoint files, parallel)' },
    { title: 'Consumers', detail: 'identity service, settings UI, onboarding UI (parallel)' },
    { title: 'Verify', detail: 'tsc --noEmit + adversarial spec-conformance review' },
  ],
}

const ROOT = '/Users/amkeisar/Keisar/Projects/MusePostBot/cloudflare-bot'

// ───────────────────────── SHARED CONTRACT ─────────────────────────
// Every agent MUST follow these exact names/signatures so the independently
// edited modules compile and wire together. Presets are EXACTLY {100,200,400},
// default 200. Repo root: /Users/amkeisar/Keisar/Projects/MusePostBot/cloudflare-bot
const CONTRACT = `
SHARED CONTRACT (all agents must follow EXACTLY — modules are edited in parallel and must compile together).
Repo root: ${ROOT}
Setting = "identity analysis depth". Allowed values EXACTLY 100, 200, 400. Default 200.

[STORAGE] (owned by the Foundation/storage agent)
- New DB column: users.identity_tweet_count INTEGER DEFAULT 200.
- src/data/user-settings-db.ts exports two functions (mirror getPageSize/setPageSize and the try/catch style of getAiProvider):
    getIdentityTweetCount(env, chatId): Promise<number>
       SELECT identity_tweet_count FROM users WHERE chat_id=?; if the value is null/missing/not one of 100,200,400 return 200; wrap in try/catch returning 200 on any error (pre-migration safety).
    setIdentityTweetCount(env, chatId, count): Promise<void>
       Only UPDATE when count is one of 100,200,400; set updated_at=datetime('now').
  db.ts re-exports via "export * from './user-settings-db'" — DO NOT edit db.ts.
- src/types.ts User interface: add a line  identity_tweet_count: number;  right after the identity_lang_notified field.

[X INTEGRATION] src/integrations/x.ts (owned by the X-integration agent)
- getUserTweets(env, userId, sinceId?, maxResults=10, paginationToken?: string):
    * Add a 5th optional param paginationToken?: string. When present, add query param pagination_token=<token>.
    * Change the expansions query value to: author_id,attachments.media_keys,referenced_tweets.id,referenced_tweets.id.author_id
    * KEEP exclude=retweets and the max_results clamp Math.min(Math.max(maxResults,5),100).
    * The returned object MUST keep its existing fields (tweets, newestId, media, users) AND add:
         nextToken: string | null    // from data.meta?.next_token ?? null
         referencedTweets: XTweet[]   // from data.includes?.tweets ?? []
      (poller.ts destructures {tweets,newestId,media,users} and {newestId} — do not remove or rename those.)
- ClassifiedTweet interface: add optional fields  refText?: string; refAuthorUsername?: string; refAuthorName?: string;
- fetchUserTweets(env, count = 200): Promise<ClassifiedTweet[]>  (CHANGE signature to accept count, default 200):
    * Resolve userId via getMyUserId(env) as today.
    * Paginate: loop calling getUserTweets(env, userId, undefined, 100, token), starting token undefined, accumulating raw tweets, referencedTweets and users across pages. Stop when accumulated tweets length >= count OR nextToken is null/empty. Page cap = Math.min(8, Math.ceil(count/100)+2). Use sequential awaits (NOT Promise.all).
    * Failure tolerant: wrap each page call so that if a page throws, you break the loop and proceed with what was already collected (do not rethrow). After the loop, trim the tweets array to at most count.
    * Build lookup maps across ALL collected pages:
         refTweetById: Map<string, XTweet>  keyed by referenced tweet id (from referencedTweets)
         userById:     Map<string, XUserExpansion> keyed by user id (from users)
    * For each tweet t: kind = classifyTweet(t). If kind === 'reply' resolve the referenced id from t.referenced_tweets where type === 'replied_to'; if kind === 'quote' from type === 'quoted'. Look up refTweetById -> refTweet; if found set refText = refTweet.text trimmed, newlines collapsed to spaces, truncated to 200 chars (append an ellipsis if it was longer); and refTweet.author_id -> userById -> set refAuthorUsername = that user.username and refAuthorName = that user.name. If the reference is missing, leave the three ref fields undefined.
    * Return ClassifiedTweet[] with { text, kind, created_at, refText?, refAuthorUsername?, refAuthorName? }.

[IDENTITY PROMPT LINE FORMAT] produced in src/ai/identity.ts, consumed/explained by src/skills/who-am-i.ts.
  With n = (index + 1), the tweet lines sent to the model MUST be formatted EXACTLY like:
    original:        n. [POST] TEXT
    reply (w/ ref):  n. [REPLY to @USERNAME: "REFTEXT"] TEXT
    quote (w/ ref):  n. [QUOTE of @USERNAME: "REFTEXT"] TEXT
    reply (no ref):  n. [REPLY] TEXT
    quote (no ref):  n. [QUOTE] TEXT
  where USERNAME = refAuthorUsername, REFTEXT = refText, TEXT = the user's own tweet text.

[CALLBACKS]
  Settings: open selector -> callback "view:identity_depth_select" (dispatched in src/actions/view-change.ts);
            choose value  -> callback "config:identity_depth:<N>" (dispatched in src/actions/config-toggle.ts).
  Onboarding: choose value -> callback "onboard:identity_depth:<N>" (handled in src/commands/onboarding.ts handleOnboardingCallback).

[STRING KEYS] (added by the strings agent to BOTH src/ui/strings/en.ts and he.ts, identical key paths)
  settings.btnTweetDepth, settings.tweetDepth, settings.descTweetDepth,
  settings.tweetDepthTitle, settings.tweetDepthDesc, settings.tweetDepthCurrent,
  onboarding.identityDepthLabel, onboarding.identityDepthHint.
  (onboarding.identityCost already exists and contains the {count} placeholder.)
`

// ───────────────────────── PHASE 1: FOUNDATION ─────────────────────────
phase('Foundation')

const FILE_SUMMARY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['filesChanged', 'summary'],
  properties: {
    filesChanged: { type: 'array', items: { type: 'string' }, description: 'repo-relative paths edited or created' },
    summary: { type: 'string', description: 'concise description of what was implemented' },
    notes: { type: 'string', description: 'anything the integration/verify step should know (deviations, assumptions)' },
  },
}

const foundation = await parallel([
  // A — storage / migration / types
  () => agent(
    CONTRACT + `

YOU ARE THE STORAGE AGENT. You OWN these files ONLY (edit/create nothing else):
  - cloudflare-bot/migrations/019_identity_tweet_depth.sql  (CREATE)
  - cloudflare-bot/schema.sql                                (add the column to the users table definition, after identity_lang_notified, matching the existing style)
  - cloudflare-bot/src/types.ts                              (add identity_tweet_count: number; to the User interface after identity_lang_notified)
  - cloudflare-bot/src/data/user-settings-db.ts              (add getIdentityTweetCount + setIdentityTweetCount per the contract, placed in a new "IDENTITY TWEET DEPTH" section after PAGE SIZE)
DO NOT edit src/data/db.ts (it re-exports via export *). DO NOT touch any other file.
Migration content: a single line  ALTER TABLE users ADD COLUMN identity_tweet_count INTEGER DEFAULT 200;  with a short comment header matching migrations 011/015 style.
Read each file before editing. Implement precisely, then report.`,
    { label: 'A:storage', phase: 'Foundation', schema: FILE_SUMMARY_SCHEMA },
  ),
  // B — X integration
  () => agent(
    CONTRACT + `

YOU ARE THE X-INTEGRATION AGENT. You OWN ONLY: cloudflare-bot/src/integrations/x.ts
Implement the [X INTEGRATION] section of the contract precisely: getUserTweets (paginationToken param, expansions, nextToken + referencedTweets in the return type AND return value), the ClassifiedTweet new optional fields, and the rewritten fetchUserTweets(env, count=200) with pagination, ref-context enrichment, lookup maps, page cap, and failure tolerance.
Note classifyTweet(tweet) already exists and returns 'original'|'quote'|'reply'. getMyUserId(env) already exists. XTweet has .text, .author_id, .referenced_tweets (array of {type,id}). XUserExpansion has .username and .name. Keep all existing exports and behavior intact for other callers (poller.ts). Do NOT touch any other file. Read the file first, then edit. Report what changed.`,
    { label: 'B:x-integration', phase: 'Foundation', schema: FILE_SUMMARY_SCHEMA },
  ),
  // D — who-am-i skill (EN + HE)
  () => agent(
    CONTRACT + `

YOU ARE THE SKILL-PROMPT AGENT. You OWN ONLY: cloudflare-bot/src/skills/who-am-i.ts
Update BOTH WHO_AM_I_EN and WHO_AM_I_HE string constants. Find the part that explains the [POST] / [QUOTE] / [REPLY] tags (how each tag is used as a signal). Extend it so it ALSO explains the enriched forms exactly as produced by identity.ts:
   [REPLY to @user: "..."]  and  [QUOTE of @user: "..."]
Instruct the model that when a reply/quote line includes the referenced author and text, it MUST interpret the user's reaction AGAINST that referenced content and author (what the user agrees/disagrees with, how they engage, their stance) rather than reading the reply/quote text in isolation. Preserve all existing guidance (including weighting quote tweets heavily for opinions/reactions). The Hebrew (HE) edit must be a natural, fluent Hebrew translation of the same added guidance — not English. Read the file first. Do NOT touch any other file. Report what changed.`,
    { label: 'D:who-am-i', phase: 'Foundation', schema: FILE_SUMMARY_SCHEMA },
  ),
  // G — strings (EN + HE)
  () => agent(
    CONTRACT + `

YOU ARE THE STRINGS AGENT. You OWN ONLY: cloudflare-bot/src/ui/strings/en.ts AND cloudflare-bot/src/ui/strings/he.ts
Add these keys to BOTH files (identical key paths; English copy in en.ts, natural fluent Hebrew in he.ts). Place settings.* keys inside the existing settings object (near the pageSize keys) and onboarding.* keys inside the existing onboarding object.

en.ts values:
  settings.btnTweetDepth      = '🔍 Analysis Depth'
  settings.tweetDepth         = '🔍 Analysis Depth'
  settings.descTweetDepth     = 'How many recent posts to analyze when building your identity.'
  settings.tweetDepthTitle    = '🔍 <b>Identity Analysis Depth</b>'
  settings.tweetDepthDesc     = 'Choose how many of your recent posts Muse reads to build your identity. More posts = a richer read, but it takes a little longer.'
  settings.tweetDepthCurrent  = 'Current'
  onboarding.identityDepthLabel = 'How many posts should I analyze?'
  onboarding.identityDepthHint  = '⏳ Larger selections take a bit longer.'

he.ts values (natural Hebrew, keep emojis and any <b> tags):
  settings.btnTweetDepth      = '🔍 עומק ניתוח'
  settings.tweetDepth         = '🔍 עומק ניתוח'
  settings.descTweetDepth     = (Hebrew: how many recent posts to analyze when building your identity)
  settings.tweetDepthTitle    = '🔍 <b>עומק ניתוח זהות</b>'
  settings.tweetDepthDesc     = (Hebrew: choose how many recent posts Muse reads to build your identity; more posts = richer but slower)
  settings.tweetDepthCurrent  = 'נוכחי'
  onboarding.identityDepthLabel = (Hebrew: how many posts should I analyze?)
  onboarding.identityDepthHint  = '⏳ בחירה גדולה יותר לוקחת קצת יותר זמן.'

Also VERIFY that onboarding.identityCost already exists in both files and contains the {count} placeholder; if it is missing in either file, add it (EN: 'I'll analyze ~{count} of your recent posts using AI.', HE natural). Keep both files' object structure identical. Read both files first. Do NOT touch any other file. Report what changed.`,
    { label: 'G:strings', phase: 'Foundation', schema: FILE_SUMMARY_SCHEMA },
  ),
])

const foundationOk = foundation.filter(Boolean)
log(`Foundation complete: ${foundationOk.length}/4 modules (${foundationOk.flatMap(r => r.filesChanged || []).length} files)`)

// ───────────────────────── PHASE 2: CONSUMERS ─────────────────────────
phase('Consumers')

const consumers = await parallel([
  // C — identity service
  () => agent(
    CONTRACT + `

YOU ARE THE IDENTITY-SERVICE AGENT. You OWN ONLY: cloudflare-bot/src/ai/identity.ts
The Foundation phase is DONE — src/integrations/x.ts now has fetchUserTweets(env, count) and ClassifiedTweet has refText/refAuthorUsername/refAuthorName; src/data/db.ts now re-exports getIdentityTweetCount/setIdentityTweetCount. READ src/integrations/x.ts and src/data/user-settings-db.ts first to confirm the exact signatures before editing.
Changes in analyzeIdentity:
  1. Read the user's depth: const count = await getIdentityTweetCount(env, chatId); (import it from '../data/db').
  2. Call fetchUserTweets(env, count) instead of fetchUserTweets(env).
  3. Replace the tweetLines mapping so each line uses the EXACT [IDENTITY PROMPT LINE FORMAT] from the contract (POST / REPLY to @user / QUOTE of @user / bare REPLY / bare QUOTE).
Keep everything else (own-profile fetch, getDefaultPromptText('who-am-i'), callLLMText, saveUserPrompt, return shape {document, tweetCount}) intact. Do NOT touch any other file. Report what changed.`,
    { label: 'C:identity', phase: 'Consumers', schema: FILE_SUMMARY_SCHEMA },
  ),
  // E — settings UI (views + 3 actions)
  () => agent(
    CONTRACT + `

YOU ARE THE SETTINGS-UI AGENT. You OWN ONLY these files:
  - cloudflare-bot/src/views/settings.ts
  - cloudflare-bot/src/actions/view-change.ts
  - cloudflare-bot/src/actions/config-toggle.ts
  - cloudflare-bot/src/actions/settings-keys.ts
Foundation is DONE: db.ts re-exports getIdentityTweetCount/setIdentityTweetCount; strings keys settings.btnTweetDepth / tweetDepth / descTweetDepth / tweetDepthTitle / tweetDepthDesc / tweetDepthCurrent exist in en.ts+he.ts. READ each file before editing.

1) src/views/settings.ts:
   - Add export function renderIdentityDepthSelect(currentDepth = 200, lang = 'en'): ViewResult — MIRROR renderPageSizeSelect (study it in the same file) but options [100,200,400], each button callback 'config:identity_depth:' + n and text selectedItemLabel(String(n), n === currentDepth); back button to 'settings:sub:skills'. Body text uses t(lang,'settings.tweetDepthTitle'), t(lang,'settings.tweetDepthDesc'), and t(lang,'settings.tweetDepthCurrent') + arrow + currentDepth.
   - renderSettingsSkills: ADD a new last parameter  identityDepth = 200 . Add a keyboard button row { text: t(lang,'settings.btnTweetDepth'), callback_data: 'view:identity_depth_select' } immediately AFTER the existing Analyze Identity button row. Also add a line to the body text showing t(lang,'settings.tweetDepth') + arrow + <code>identityDepth</code> (+ a short description t(lang,'settings.descTweetDepth')).
2) src/actions/view-change.ts: add  case 'identity_depth_select':  mirroring the existing case 'page_size_select' — updateChatState current_view 'identity_depth_select' context null, const d = await getIdentityTweetCount(env, chatId), return renderIdentityDepthSelect(d, lang). Add imports for getIdentityTweetCount (from '../data/db') and renderIdentityDepthSelect (from '../views/settings' — match how renderPageSizeSelect is imported).
3) src/actions/config-toggle.ts: add a branch  if (setting === 'identity_depth') { const depth = parseInt(extra || '200', 10); if ([100,200,400].includes(depth)) await setIdentityTweetCount(env, chatId, depth); const staleCount = await countStalePrompts(env, chatId); const isAdminUser = isAdmin(chatId, env); const d = await getIdentityTweetCount(env, chatId); return renderSettingsSkills(lang, env.WORKER_URL, staleCount, isAdminUser, d); }  — add any missing imports (setIdentityTweetCount, getIdentityTweetCount from '../data/db'; countStalePrompts from its module — find where settings-keys.ts imports it; renderSettingsSkills from '../views/settings'). isAdmin is already imported there.
4) src/actions/settings-keys.ts: in the  case 'skills':  load const d = await getIdentityTweetCount(env, chatId) and pass it as the 5th argument to renderSettingsSkills(lang, env.WORKER_URL, staleCount, isAdminUser, d). Grep this file for ALL renderSettingsSkills(...) calls and update each. Add the getIdentityTweetCount import from '../data/db'.
Do NOT touch any other file. Report what changed.`,
    { label: 'E:settings-ui', phase: 'Consumers', schema: FILE_SUMMARY_SCHEMA },
  ),
  // F — onboarding UI (view + command)
  () => agent(
    CONTRACT + `

YOU ARE THE ONBOARDING-UI AGENT. You OWN ONLY:
  - cloudflare-bot/src/views/onboarding.ts
  - cloudflare-bot/src/commands/onboarding.ts
Foundation is DONE: db.ts re-exports getIdentityTweetCount/setIdentityTweetCount; strings onboarding.identityDepthLabel and onboarding.identityDepthHint exist in en.ts+he.ts; onboarding.identityCost has {count}. READ each file first.

1) src/views/onboarding.ts renderIdentityStep: CHANGE signature from (tweetCount = 50, lang) to (currentDepth = 200, lang = 'en'). Use currentDepth where the cost line interpolates {count} (i.e. .replace('{count}', String(currentDepth))). ADD a selector row of three buttons placed ABOVE the 'Understand Me' button: for each n of [100,200,400] -> { text: selectedItemLabel(String(n), n === currentDepth), callback_data: 'onboard:identity_depth:' + n }. Add a label line t(lang,'onboarding.identityDepthLabel') near the selector and, when currentDepth >= 200, include t(lang,'onboarding.identityDepthHint') in the body text. Keep the 'Understand Me' (onboard:identity_analyze) and 'Use default' (onboard:identity_default) buttons. Import selectedItemLabel if not already imported (it lives in '../ui/components').
2) src/commands/onboarding.ts:
   - In handleOnboardingCallback, ADD (alongside the other onboard:identity_* handlers): if (data.startsWith('onboard:identity_depth:')) { const n = parseInt(data.split(':')[2] || '200', 10); if ([100,200,400].includes(n)) await setIdentityTweetCount(env, chatId, n); await sendStepView(env, chatId, telegramChatId, messageId, 'identity', lang); return; }
   - Find sendStepView and its 'identity' step branch: it must load const d = await getIdentityTweetCount(env, chatId) and call renderIdentityStep(d, lang) (instead of renderIdentityStep() / renderIdentityStep(50)). If the identity step is rendered anywhere else in this file, thread the depth there too.
   - Add imports for getIdentityTweetCount and setIdentityTweetCount from '../data/db' (or wherever this file imports user settings helpers — match existing import style).
Do NOT touch any other file. Report what changed.`,
    { label: 'F:onboarding-ui', phase: 'Consumers', schema: FILE_SUMMARY_SCHEMA },
  ),
])

const consumersOk = consumers.filter(Boolean)
log(`Consumers complete: ${consumersOk.length}/3 modules`)

// ───────────────────────── PHASE 3: VERIFY ─────────────────────────
phase('Verify')

const allChanged = [...foundationOk, ...consumersOk].flatMap(r => r.filesChanged || [])

const [typecheck, review] = await parallel([
  () => agent(
    `Run a TypeScript typecheck on the cloudflare-bot project and report results VERBATIM.
Commands to run (from the repo): cd ${ROOT} && npx tsc --noEmit
Then also run: cd ${ROOT} && npx biome check src 2>&1 | tail -40   (lint; non-blocking, just report).
Report the tsc result: did it pass? how many errors? List each error line (file:line: message) verbatim. Do NOT attempt to fix anything — report only.`,
    {
      label: 'verify:tsc', phase: 'Verify',
      schema: {
        type: 'object', additionalProperties: false,
        required: ['tscPassed', 'errorCount', 'errors'],
        properties: {
          tscPassed: { type: 'boolean' },
          errorCount: { type: 'number' },
          errors: { type: 'array', items: { type: 'string' }, description: 'verbatim tsc error lines' },
          lintNotes: { type: 'string', description: 'brief biome lint summary, if any' },
        },
      },
    },
  ),
  () => agent(
    `You are an adversarial spec-conformance reviewer. Read the OpenSpec change at /Users/amkeisar/Keisar/Projects/MusePostBot/openspec/changes/add-configurable-identity-tweet-depth/ (proposal.md, design.md, specs/**/spec.md, tasks.md). Then read the implementation in these changed files: ${JSON.stringify(allChanged)} plus src/integrations/x.ts, src/ai/identity.ts, src/views/onboarding.ts, src/views/settings.ts, src/commands/onboarding.ts (all under ${ROOT}).
Check, skeptically, whether the implementation actually satisfies the spec requirements and scenarios. Look specifically for: (1) pagination really loops on next_token and bounds pages; (2) exclude=retweets retained; (3) referenced-tweet text+author resolved from the SAME call expansions and attached to replies/quotes with graceful fallback when missing; (4) the prompt line format matches exactly what who-am-i.ts now documents; (5) the depth setting is read by analyzeIdentity and shared by onboarding + settings; (6) selector wired in BOTH onboarding and settings with correct callbacks; (7) EN and HE strings both present; (8) default 200, presets 100/200/400 only.
Report a list of concrete gaps (file + issue + severity high/medium/low). If something is correct, do not list it. Do NOT edit any files.`,
    {
      label: 'verify:spec-review', phase: 'Verify',
      schema: {
        type: 'object', additionalProperties: false,
        required: ['conforms', 'gaps'],
        properties: {
          conforms: { type: 'boolean' },
          gaps: {
            type: 'array',
            items: {
              type: 'object', additionalProperties: false,
              required: ['severity', 'file', 'issue'],
              properties: {
                severity: { type: 'string', enum: ['high', 'medium', 'low'] },
                file: { type: 'string' },
                issue: { type: 'string' },
              },
            },
          },
        },
      },
    },
  ),
])

return {
  filesChanged: Array.from(new Set(allChanged)).sort(),
  foundation: foundationOk.map(r => ({ summary: r.summary, files: r.filesChanged, notes: r.notes })),
  consumers: consumersOk.map(r => ({ summary: r.summary, files: r.filesChanged, notes: r.notes })),
  typecheck,
  review,
}
