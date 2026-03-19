## Context

The onboarding flow currently runs: Welcome → Gemini → X → GitHub → Identity → Complete. Steps were added in the order they were implemented. The identity analysis — described as "the most important step" — is buried last. There is no language selection during onboarding; the user's language is defaulted and only changeable later in settings. Each step uses dry "Step N/3" labels with no connection to what features the keys enable.

The onboarding state machine lives in `commands/onboarding.ts`, with views in `views/onboarding.ts`, strings in `ui/strings/en.ts` and `he.ts`, and the step type defined as `OnboardingStep` in `types.ts`.

## Goals / Non-Goals

**Goals:**
- Reorder flow to: Welcome (with language) → X → Identity → Gemini → GitHub → Complete
- Add language selection (EN/HE) to the welcome screen with auto-detection from Telegram
- Replace "Step N/3" with feature-unlock framing at each step
- Move identity analysis immediately after X connection
- If X is skipped, silently apply default identity (skip identity screen entirely)
- Show identity analysis snippet after completion
- Show cost transparency on identity step (~N tweets · 1 AI call)
- Frame GitHub as a "Bonus" step, visually distinct
- Merge "Learn More" content into the welcome screen (no separate Learn More screen)

**Non-Goals:**
- Changing the actual key validation/encryption logic (stays the same)
- Changing the identity analysis AI pipeline (just surfacing more of its output)
- Adding new services/integrations to onboarding
- Redesigning the "How to get keys" external guides (will be enhanced later)
- Changing the max users cap logic

## Decisions

### Decision 1: Language selection via inline button toggle on welcome screen

**Approach**: Two inline buttons side by side (`[English ✓]` `[עברית]`), where tapping one re-renders the entire welcome message in that language with the checkmark moved. Language is saved to `users.language` immediately on tap. The "Let's Go" button proceeds with whatever language is currently stored.

**Auto-detection**: When creating the user record in the webhook handler, read `update.message.from.language_code`. If it equals `'he'`, set initial language to `'he'`; otherwise default to `'en'`. This means Hebrew speakers see their language pre-selected on first render.

**Alternative considered**: Language as a separate first step. Rejected — it adds friction for a single toggle. Baking it into welcome keeps the screen count the same.

**Callbacks**:
- `onboard:lang_en` → save lang, re-render welcome in English
- `onboard:lang_he` → save lang, re-render welcome in Hebrew
- `onboard:start` → proceed (existing callback, same behavior)

### Decision 2: New step order and routing

The `OnboardingStep` type values remain the same set (`'welcome' | 'x_keys' | 'identity' | 'gemini_key' | 'github_token' | 'complete' | null`), but the transition logic changes:

```
welcome ──[start]──→ x_keys

x_keys ──[keys valid]──→ identity
x_keys ──[skip]──→ gemini_key  (silently store default identity)

identity ──[analyze]──→ (show snippet) ──→ gemini_key
identity ──[use default]──→ gemini_key

gemini_key ──[key valid]──→ github_token
gemini_key ──[skip]──→ github_token

github_token ──[token valid]──→ complete
github_token ──[skip/not now]──→ complete
```

Key difference: when X is skipped, identity step is bypassed entirely. The `storeDefaultIdentity()` call happens inline during the X skip handler, and `onboarding_step` advances directly to `gemini_key`.

### Decision 3: Feature-unlock framing in views

Each key step's view includes a list of features that get unlocked by connecting that service. Uses lock emoji (`🔒`) for locked features in the description. No overall progress bar or step counter.

**X step unlocks**: Repost, Handwrite, Follow, Identity
**Gemini step unlocks**: All AI content generation, Smart rewriting, Identity-aware drafts
**GitHub step unlocks**: Auto-generate from commits, Track repos

The welcome screen includes a brief merged value prop (what was previously behind "Learn More") — no separate Learn More screen or callback needed.

### Decision 4: Identity snippet after analysis

`analyzeIdentity()` already returns the full identity document text. After successful analysis, extract the first 2-3 meaningful lines (or first ~200 chars) from the returned text and display them in the success message. No AI summarization needed — just truncate with "..." and point to Settings/WebApp for the full document.

Also return tweet count from `analyzeIdentity()` by changing the return type from `string | null` to `{ document: string; tweetCount: number } | null`. This allows the identity step to display "~N tweets analyzed · 1 AI call" accurately.

### Decision 5: Remove `renderLearnMore` and `onboard:learn` callback

The "Learn More" screen and its callback are removed entirely. The feature list (Repost, Generate, Handwrite, Follow) is incorporated into the welcome screen text. This simplifies the callback handler and removes a dead-end screen.

## Risks / Trade-offs

**[Risk] X keys as the first credential step is high-friction** → Mitigated by the feature-unlock framing that motivates why these 4 keys matter. The inline format guide (4 key names shown in message body) helps. Future enhancement: step-by-step guide with screenshots.

**[Risk] Skipping X silently applies default identity** → Acceptable because the user can re-analyze anytime from Settings once they connect X. No need to show them a screen for something they can't do without X.

**[Risk] Existing users mid-onboarding when code deploys** → The `onboarding_step` values are unchanged. A user on `gemini_key` step in the old flow will see the new Gemini screen (which is fine). A user on `x_keys` will see the new X screen. The only edge case is a user on `github_token` who hasn't done identity yet — after GitHub they'd go to complete, but identity is already defaulted by the old flow's identity step. So no migration issue.

**[Risk] Hebrew translations may be incomplete for new strings** → Both `en.ts` and `he.ts` must be updated together. The `t()` function falls back to English for missing keys, so partial deployment is safe.
