## Why

The `what-i-like` scoring skill generates rich psychological context about *why* a tweet resonates (which channels activated — value resonance, cognitive engagement, identity positioning, etc.), but this context is currently wasted. It's shown to the user in notifications (where it adds clutter) and then discarded when generating quote tweets (where it would add the most value). Additionally, the skill's "Author Context" evaluation channel (#6) is blind — no persona data is passed for tweet authors during scoring. The scoring reason also has an arbitrary 120-char forced limit that constrains AI expression.

## What Changes

- **Thread `relevance_reason` to quote generation**: Pass the scoring reason through `generateRepostContent` → `buildRepostUserPrompt` so the quote skill gets the emotional entry point instead of re-analyzing from scratch
- **Remove reason from notification display**: Stop showing `relevance_reason` in batch notifications and batch pages — it's internal AI context, not user-facing content
- **Inject author persona into scoring batches**: Load `TwitterAccountOverview.persona` for each unique author in the batch and include it alongside tweets in the scoring user prompt
- **Remove forced char limit from skill**: Drop "max 120 characters" constraint from EN and HE skill text — trust the AI to write concise reasons naturally
- **Add score-band TODO notes**: Document the score→engagement mapping vision (auto-approve by band, notification priority) in relevant files for future implementation

## Capabilities

### New Capabilities

- `scoring-reason-forwarding`: Thread scoring reason through repost generation pipeline as internal AI context

### Modified Capabilities

- `twitter-batch-notifications`: Remove `relevance_reason` display from notification messages
- `repost-system`: Accept and use scoring reason in repost prompt building

## Impact

- `src/ai/scoring.ts` — load persona data per author before scoring
- `src/ai/scoring-prompt.ts` — include persona alongside tweets in user prompt
- `src/ai/repost-generate.ts` — accept `relevanceReason` param, pass to prompt builder
- `src/ai/repost-prompt.ts` — include reason as self-addressed context section
- `src/actions/tweet-generate.ts` — pass `tweet.relevance_reason` to generation
- `src/actions/fast-generate.ts` — pass `tweet.relevance_reason` to generation
- `src/services/auto-approve.ts` — pass `tweet.relevance_reason` to generation
- `src/services/batch-notification.ts` — remove reason display
- `src/actions/batch-page.ts` — remove reason display
- `src/skills/what-i-like.ts` — remove char limit, remove implementation notes (fulfilled)
