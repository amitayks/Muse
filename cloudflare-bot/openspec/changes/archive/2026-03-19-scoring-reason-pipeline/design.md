## Context

The `what-i-like` scoring skill produces a `relevance_reason` — a sentence describing which psychological channels activated and why a tweet resonates. Currently this reason is displayed in batch notifications (cluttering the UI with internal AI reasoning) and then discarded when generating quote tweets (losing the emotional entry point). The skill also evaluates "Author Context" (channel #6) but receives no persona data for tweet authors.

The prompt architecture follows a "skills are the single source of truth" model — user prompts carry only data, not instructions. The scoring reason fits naturally as data context for the quote skill.

## Goals / Non-Goals

**Goals:**
- Thread `relevance_reason` as internal context to the quote generation pipeline
- Enrich scoring with author persona data so channel #6 evaluates meaningfully
- Clean up batch notifications by removing internal AI reasoning from display
- Remove artificial char limits from scoring reasons, trust the AI
- Document score-band vision for future implementation

**Non-Goals:**
- Changing the score threshold mechanism (stays numeric, user-controllable)
- Implementing score-band-based auto-approve (deferred, documented as TODO)
- Changing notification priority by score band (deferred, documented as TODO)
- Modifying the scoring evaluation framework itself

## Decisions

### 1. Reason passed as self-addressed user prompt section

The `relevance_reason` is injected into `buildRepostUserPrompt` as a self-addressed section:
```
WHAT CAUGHT MY ATTENTION:
<reason text>
```
This follows the established pattern — user prompts carry data, skills interpret it. The quote skill already knows how to use contextual signals; this adds one more.

**Alternative**: Pass as system prompt metadata → Rejected because system prompts are assembled from skills + identity, not per-call data.

### 2. Persona loaded per unique account_id in batch

Before scoring, `scoreTweetBatch` loads `TwitterAccountOverview.persona` for each unique `account_id` in the batch. A Map is built once, then `buildScoringUserPrompt` receives it and includes persona per-tweet.

**Alternative**: Load persona inside the prompt builder → Rejected because prompt builders are synchronous, DB calls are async.

### 3. Reason removed from display, not from storage

`relevance_reason` continues to be stored in DB (useful for debugging, analytics, and feeding to generation). It's only removed from the Telegram notification and batch page display.

### 4. Score-band notes as code comments

Future score-band behavior (auto-approve by band, notification priority tiers) is documented as implementation notes in `auto-approve.ts` and `batch-notification.ts` with cross-references to related files. This preserves the vision without premature implementation.

## Risks / Trade-offs

- **[Extra DB queries in scoring]** Loading persona for each unique account adds queries before scoring. → Mitigated: batch has typically 5-15 tweets from 3-5 accounts, so 3-5 extra queries. Negligible latency.
- **[Longer user prompts]** Reason + persona add tokens to both scoring and generation prompts. → Mitigated: scoring personas are typically 1-2 sentences; reasons are 1 sentence. Minimal token impact.
- **[Reason quality varies]** Some reasons may be generic despite the skill's instructions. → Accepted: even a mediocre reason gives the quote skill more context than none.
