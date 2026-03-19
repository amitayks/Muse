## Why

The bot currently writes posts using generic "professional AI writer" system prompts. Gemini is told "you are an AI assistant that helps create social media content" — and the output reads exactly like that. Polished, competent, and unmistakably AI-generated. Every post sounds like it was written by the same Silicon Valley marketing intern, regardless of who the user actually is.

The fundamental problem: **we know everything about the accounts the user follows (via the persona system), but we know nothing about the user themselves.** The bot can write a contextually appropriate reply to @elonmusk, but it can't write a tweet that sounds like the actual human who pressed "generate."

This change rewrites the entire prompt architecture from the ground up with one core principle:

> **Gemini doesn't write FOR the user. Gemini writes AS the user.**

Every system prompt is replaced with a "skill" — a structured, psychologically-grounded instruction set written in **first-person self-narrative**. Gemini doesn't receive external instructions telling it to "mimic" someone. Instead, it receives an identity document written as its own inner monologue ("I am... I write like... I care about..."), and every skill continues in that voice. There is no director and no actor. There is just a person thinking and writing.

### The Psychological Foundation

Traditional prompt engineering treats the LLM as an actor receiving stage directions: "You are X, write like Y." This creates a meta-layer of imitation that leaks into the output — the model is always *performing* rather than *being*.

The self-perspective approach eliminates this meta-layer:

1. **First-person framing** — Skills are written as inner monologue ("I share my work because I care about what I build"), not instructions ("You should write posts about the user's work"). This mirrors how humans self-talk and self-direct. When a person convinces themselves of something, they say "I can do this," not "You can do this." The LLM follows the same pattern — first-person context produces first-person continuation.

2. **Identity displacement** — LLMs predict the next token based on all preceding context. When the system prompt is full of detailed "I am..." statements about a specific person, the generic base model identity gets displaced by the stronger, more specific one. Gemini doesn't "play a role" — it adopts the identity because no competing identity is present.

3. **No transition gap** — With "You are..." prompts, the model transitions from receiving-instructions mode to generating-output mode. That transition is where AI-tone leaks in. With "I am..." prompts, the model is already in the output voice from the first token. Generation is a natural continuation, not a mode switch.

4. **Emotional grounding** — People don't just have writing styles — they have emotional patterns, reactions, excitement triggers, and perspectives. The identity system captures these as self-described attributes ("I get genuinely excited when I solve a hard distributed systems problem"), which grounds Gemini's generation in emotional authenticity, not just stylistic mimicry.

### Why Now

The prompt storage system (database-backed, per-user, per-language, admin-versioned) was just completed. The infrastructure to store, resolve, and edit prompts already exists. The skill rewrite builds on this foundation — same storage mechanism, fundamentally different content.

---

## What Changes

### A. New User Identity System

**Onboarding flow addition:**
When a user reaches the identity stage during onboarding, they see two buttons:
- **"Understand who I am"** — The bot fetches the user's last 100 tweets via the X API (using their connected credentials). Pure retweets are filtered out. Quote tweets are weighted MORE heavily than original posts because they reveal the user's reactions, opinions, and emotional triggers — richer identity signal than self-initiated posts. Replies are included if available (reveal conversational tone). The tweets are sent to Gemini with the `/who-am-i` skill, which analyzes them **as if they are Gemini's own tweets** and produces a comprehensive Identity Document.
- **"Use default"** — A minimal skeleton identity is applied: "I'm a tech professional who shares my work online. I prefer clear, direct communication. [No specific patterns analyzed yet — using neutral baseline until identity is built.]" This is honest — it doesn't pretend to know things it doesn't. The user can replace/refine it anytime in settings, or re-trigger the analysis later by sending their own posts.

**Identity Document structure:**
The output of the `/who-am-i` analysis is a rich, first-person self-description covering:
- Writing fingerprint (sentence rhythm, length patterns, structure preferences)
- Vocabulary spectrum (casual/formal ratio, jargon usage, characteristic words/phrases)
- Emotional range — not a single tone but a spectrum (e.g., "usually witty, sometimes earnest, rarely formal")
- Grammar patterns — not "mistakes to replicate" but "patterns to preserve" (e.g., "I start sentences lowercase," "I mix Hebrew and English mid-thought," "I use ... instead of periods")
- Topic interests and perspective angles
- Humor style and sarcasm patterns
- Engagement patterns (how the user reacts to others, what triggers responses)
- Signature moves (recurring structures, opening patterns, closing patterns)

**Storage:** The Identity Document is stored in `user_prompts` as prompt type `identity`. The user can view and edit it (they're editing the INFO — who they are — not the SKILL that generated it). The admin can edit the analysis skill itself.

**Evolution:** The identity should grow more accurate over time. After every ~20 posts the user approves and publishes, the system can offer to refine the identity with the new data. User edits to generated content (the diff between what Gemini produced and what the user actually published) are the richest signal — they represent direct style corrections.

### B. Skill Architecture — Replacing All System Prompts

Every existing system prompt is rewritten from scratch as a "skill" — a structured document with two parts:

**Part 1: Self-Narrative (first-person, ~80% of the skill)**
The psychological framing. Written as inner monologue. Establishes identity, mindset, and approach for the specific task. This is what makes Gemini "think" as the user.

**Part 2: Task Protocol (neutral/technical, ~20% of the skill)**
Output format, JSON structure, field constraints, character limits. A person can think in first person and still follow a technical spec — these aren't in conflict.

**Conflict resolution hierarchy** (explicit in every skill):
1. **Identity INFO** → WHO I am (always wins)
2. **Skill prompt** → HOW I operate for this task
3. **Runtime context** → WHAT I'm working with right now

If the skill says "be creative" but the identity says "I'm minimal and dry," the output should be minimal and dry creativity. Identity always takes precedence.

### C. Prompt Consolidation — 9 Types → 9 Skills (with merges)

| # | Old Prompt Type(s) | New Skill | Slash Name | Identity Attached | Description |
|---|-------------------|-----------|------------|-------------------|-------------|
| A | *(new)* | Identity Analysis | `/who-am-i` | N/A (this CREATES it) | Analyzes user's tweets as Gemini's own, produces Identity Document |
| B | `content` | Work Progress | `/work-progress` | FULL | Write about MY recent work/commits from my perspective |
| C | `edit` + `handwrite_refine` | Refine | `/refine` | FULL | Take this draft and rewrite it in MY voice (optional instruction) |
| D | `repost` | Quote | `/quote` | FULL + persona of other author | Share MY thoughts by quoting this post |
| E | `video` | Video | `/video` | FULL | (Admin only for now, future expansion to scenes/characters) |
| F | `overview` | Know My Project | `/know-my-project` | FULL | Understand MY project — what I built, what I achieved, what matters to me |
| G | `persona` | Persona | `/persona` | None | Research an X account (utility, unchanged logic, new skill format) |
| H | `scoring` | What I Like | `/what-i-like` | FULL | Score posts from MY perspective — do I like this? Would I quote it? |
| I | `handwrite_image` | Image Gen | `/image-gen` | None (attached to other skills) | Image prompt generation — visual direction module |

**Key merges:**
- `edit` + `handwrite_refine` → `/refine` — Same skill, different entry points. When used for handwrite refine: no instruction, just "write this in my voice." When used for edit: includes the user's edit instruction as Gemini's own thought ("I got this text, and I want to change it like [instruction]").

**Key reframes:**
- `overview` → `/know-my-project` — Not dry facts extraction. Gemini reviews its OWN project and understands what it built, what it achieved, what's hard, what's exciting. Output is emotionally grounded first-person understanding. Can also feed back into identity (new repo = new interests/skills).
- `scoring` → `/what-i-like` — Not objective scoring. Gemini asks itself: "Do I like this post? How much? Would I want to quote this? Does it spark a reaction?" Identity-driven subjective evaluation.

### D. User-Editable Skills (4 types)

Users can edit these through the existing WebApp:
1. **Identity Info** (`identity`) — The "who I am" document. Edit the content, not the analysis skill.
2. **Work Progress** (`content`) — How Gemini approaches writing about repos/commits.
3. **Refine** (`edit`) — How Gemini refines drafts and hand-written posts.
4. **Quote** (`repost`) — How Gemini approaches quote-tweets and reposts.

### E. Admin-Editable Skills (all types)

The admin has access to every skill, including:
- The `/who-am-i` analysis skill itself (the instructions that generate identity documents)
- `/video`, `/know-my-project`, `/persona`, `/what-i-like`, `/image-gen`
- All user-editable skills (content, edit/refine, repost/quote)

This allows the admin to iterate and refine the entire system through real-world testing over time.

### F. Self-Perspective Enforcement Across All Skills

Every identity-attached skill follows these principles:

1. **No mention of "the user"** — The skill never says "the user wants..." or "write for the user." It says "I want..." or simply proceeds from the first-person perspective.
2. **Identity as self, not reference** — The identity section is introduced as "this is who I am" not "this is the user's profile." Gemini reads it as its own self-description.
3. **Tasks framed as self-directed** — Not "generate a tweet about these commits" but "I'm looking at my recent work and deciding what to share."
4. **Reactions framed as genuine** — Not "write a quote tweet responding to this post" but "I want to share my thoughts on this post" or "this caught my attention and here's what I think."
5. **Refinement framed as self-editing** — Not "refine the user's draft" but "here's a draft and I want to rewrite it in my own voice."

### G. Runtime Assembly

Each Gemini API call assembles the full context as three distinct layers:

```
systemInstruction = [
  SKILL_PROMPT          ← The skill (admin-editable, per prompt type + language)
  +
  IDENTITY_DOCUMENT     ← "Who I am" (user-editable, per user)
  +
  TASK_PROTOCOL         ← Output format, JSON structure, constraints
]

userContent = [
  RUNTIME_CONTEXT       ← Commits, persona, project overview, tweets, etc.
]
```

The three layers are always kept separate — never merged into a single editable blob. This prevents users from accidentally breaking format specs when editing their identity, or losing identity context when editing a skill.

---

## Capabilities

### New Capabilities
- `user-identity-system`: Onboarding-driven identity analysis from user's tweets, first-person Identity Document generation and storage, user-editable identity info, progressive identity evolution from published posts
- `skill-prompt-architecture`: Self-perspective first-person skill prompts replacing all system prompts, three-layer assembly (skill + identity + protocol), psychological grounding with inner-monologue framing

### Modified Capabilities
- `prompt-storage`: Extended with `identity` prompt type, identity-aware resolution (skill + identity assembly), updated user-editable list (4 skills instead of 3)
- `multi-perspective-prompts`: Completely rewritten as `/work-progress` skill with first-person self-perspective and full identity injection
- `repost-system`: Rewritten as `/quote` skill — Gemini reacts from its own identity to quoted post, combined with persona context for the other author
- `content-generation`: All Gemini calls updated to use three-layer assembly (skill + identity + runtime context)

## Impact

- **New onboarding step**: Identity analysis flow added to user onboarding (two buttons: analyze vs. default)
- **X API integration**: Fetch user's last 100 tweets for identity analysis (using existing connected credentials)
- **New prompt type**: `identity` added to PromptType enum and DB tables
- **All system prompts rewritten**: Every prompt in `default_prompts` replaced with new skill content
- **DB migrations**: Add `identity` rows to `default_prompts`, potentially new `identity_metadata` fields on users table
- **Modified files**: `services/prompts.ts` (new type, assembly logic), `services/gemini.ts` (all generation functions use new assembly), `services/repost-generate.ts`, `services/scoring.ts`, `services/persona-bootstrap.ts`, `services/persona-cache.ts`
- **New files**: Identity analysis service, tweet fetching utility, onboarding identity flow handler
- **WebApp updates**: User webapp shows 4 editable skills (was 3), admin webapp shows all skills, identity info gets its own edit view
- **Prompt content**: All 9 prompt types × 2 languages = 18 prompt rewrites from scratch, plus 2 new identity prompts (analysis skill en/he) and 2 identity defaults (skeleton en/he)
- **Token budget increase**: ~2-3x input tokens per creative call due to identity injection. Offset by quality improvement and reduced need for regeneration/editing.

---

## Additional Context

### The Self-Perspective Approach — Technical Rationale

LLMs generate tokens by predicting what comes next given all preceding context. The system prompt is not a "command" — it's context that shapes all future generation.

**"You are..." framing:** The model's internal state resolves to "I'm in a conversation where someone is telling me to be something." There's a director-actor relationship. The model performs a role, and the performance quality varies — the "acting" layer is always present.

**"I am..." framing:** The model's internal state resolves to "I am reading my own thoughts." No director exists. The identity IS the model for this API call. Generation flows directly from self-narrative without a performance transition.

This is why the entire skill architecture uses first-person inner monologue. It's not a stylistic choice — it's a mechanism for producing more authentic output by eliminating the mimicry meta-layer.

### Identity Spectrum vs. Single Point

The identity analysis must capture the user's RANGE, not just their average:
- A usually-witty person sometimes writes something earnest
- A casual writer sometimes produces structured analysis
- An enthusiastic person sometimes expresses frustration

The identity document should map spectrums ("usually X, sometimes Y, rarely Z") rather than pinning to a single tone. This prevents the identity from becoming a "personality straitjacket" that forces every post into the same voice.

### Grammar Patterns — "Preserve, Don't Replicate"

The skill prompts should instruct Gemini to PRESERVE the user's natural patterns rather than INTRODUCE artificial mistakes. The difference:
- Bad: "Make grammar mistakes like the user does" → produces unnatural, forced errors
- Good: "These are patterns in MY writing — I don't 'fix' them because they're how I naturally express myself" → organic, authentic voice

Nobody notices clean writing. Everyone notices wrong mistakes. The framing must be about preservation of authentic patterns, not injection of artificial ones.

### Feedback Loop — What Signals to Learn From

| Signal | Value | Safe? |
|--------|-------|-------|
| Posts user published (final version) | High — this is the approved voice | Yes |
| User edits to AI-generated content (diff) | Highest — direct style correction | Yes |
| Which reposts user chose to generate | Medium — interest/engagement signal | Yes |
| Topics of repos user adds | Medium — interest expansion | Yes |
| New projects reviewed via /know-my-project | Medium — skill/interest updates | Yes |
| Posts generated but NOT published | Low — draft ≠ intent | Careful |
| AI scoring results | None — AI opinion, not user opinion | No |

### Token Budget Estimate

| Component | Current (~tokens) | New (~tokens) | Notes |
|-----------|-------------------|---------------|-------|
| Skill prompt | 600-1500 | 800-1200 | Slightly more structured |
| Identity info | 0 | 400-800 | New — injected on every creative call |
| Runtime context | 200-2000 | 200-2000 | Unchanged |
| **Total per call** | **800-3500** | **1400-4000** | **~2x increase on creative calls** |

The increase is concentrated on creative skills (content, refine, quote, video). Utility skills (persona, image-gen) don't carry identity overhead. Scoring carries it once per batch (amortized across 20+ tweets).

### Skill-to-Model Mapping

| Skill | Gemini Model | Rationale |
|-------|-------------|-----------|
| `/who-am-i` | gemini-3.1-pro | One-time analysis, quality critical |
| `/work-progress` | gemini-3.1-pro | Creative generation, needs depth |
| `/refine` | gemini-3.1-pro | Voice matching requires nuance |
| `/quote` | gemini-3.1-pro | Faster, conversational, high temp |
| `/video` | gemini-3.1-pro | Script quality matters |
| `/know-my-project` | gemini-3.1-pro | Deep understanding needed |
| `/persona` | gemini-3.1-pro | Research utility + Google Search |
| `/what-i-like` | gemini-3.1-pro | Batch processing, speed matters |
| `/image-gen` | (embedded in other skills) | Not a standalone call |
