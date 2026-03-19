## 1. Remove Forced Char Limit from Skill

- [x] 1.1 Update `skills/what-i-like.ts` — remove "max 120 characters" from EN skill text (line 62), keep "one sentence" constraint
- [x] 1.2 Update `skills/what-i-like.ts` — remove "מקסימום 120 תווים" from HE skill text (line 127), keep "משפט אחד" constraint
- [x] 1.3 Remove implementation notes block from `skills/what-i-like.ts` (lines 131-159) — all notes will be fulfilled by this change

## 2. Inject Author Persona into Scoring

- [x] 2.1 Update `ai/scoring.ts:scoreTweetBatch` — load `TwitterAccountOverview.persona` for each unique `account_id` in the batch, build a `Map<string, string>` of accountId→persona
- [x] 2.2 Update `ai/scoring-prompt.ts:buildScoringUserPrompt` — accept optional `personaMap: Map<string, string>` param, include `Author context: <persona>` line for tweets whose account has persona data
- [x] 2.3 Update `ai/scoring.ts` — pass the persona map to `buildScoringUserPrompt`

## 3. Thread Reason to Quote Generation

- [x] 3.1 Update `ai/repost-prompt.ts:buildRepostUserPrompt` — add optional `relevanceReason?: string` param, include self-addressed section `WHAT CAUGHT MY ATTENTION:\n<reason>` when present
- [x] 3.2 Update `ai/repost-generate.ts:generateRepostContent` — add optional `relevanceReason?: string` param, pass it to `buildRepostUserPrompt`
- [x] 3.3 Update `actions/tweet-generate.ts:tweetGenerateAction` — pass `tweet.relevance_reason` to `generateRepostContent`
- [x] 3.4 Update `actions/fast-generate.ts:fastGenerateAction` — pass `tweet.relevance_reason` to `generateRepostContent`
- [x] 3.5 Update `services/auto-approve.ts:generateAndApproveDraft` — pass `tweet.relevance_reason` to `generateRepostContent`

## 4. Remove Reason from Display

- [x] 4.1 Update `services/batch-notification.ts:buildBatchPage` — remove the `relevance_reason` italic display line
- [x] 4.2 Update `actions/batch-page.ts` — remove the `relevance_reason` italic display line

## 5. Add Score-Band TODO Notes

- [x] 5.1 Add implementation notes to `services/auto-approve.ts` — document score-band auto-approve vision (9-10 auto-approve, 7-8 notify, etc.) with cross-references to `batch-notification.ts` and `skills/what-i-like.ts`
- [x] 5.2 Add implementation notes to `services/batch-notification.ts` — document notification priority tier vision with cross-references to `auto-approve.ts` and `skills/what-i-like.ts`

## 6. Deploy & Verify

- [x] 6.1 Deploy to Cloudflare Workers
- [ ] 6.2 Hit migrate endpoint to re-seed updated `what-i-like` skill (char limit removed)
- [ ] 6.3 Verify scoring includes author persona in prompt
- [ ] 6.4 Verify quote generation receives scoring reason
- [ ] 6.5 Verify batch notifications no longer show reason text
