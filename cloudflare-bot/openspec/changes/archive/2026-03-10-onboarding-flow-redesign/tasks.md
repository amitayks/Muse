## 1. Types & Data Layer

- [x] 1.1 Update `OnboardingStep` type in `types.ts` — keep same values but add a comment documenting the new flow order: `welcome → x_keys → identity → gemini_key → github_token → complete`
- [x] 1.2 Update user creation in `routes/webhook.ts` — auto-detect language from `update.message.from.language_code` (set `'he'` if matches, otherwise `'en'`) when creating the user row

## 2. Onboarding Strings

- [x] 2.1 Update `ui/strings/en.ts` onboarding section — remove Learn More keys (`learnTitle`, `learnRepost`, `learnGenerate`, `learnHandwrite`, `learnFollow`, `learnKeys`, `learnSecurity`, `btnLearnMore`), add new keys: welcome merged value prop, language toggle labels (`langEn`, `langHe`), `btnLetsGo`, X step unlock framing header + feature list, identity step description + cost line + snippet label, Gemini step unlock framing header + feature list, GitHub bonus header + feature list, `btnNotNow`, completion unlocked/locked feature labels
- [x] 2.2 Update `ui/strings/he.ts` onboarding section — mirror all key additions/removals from `en.ts` with Hebrew translations

## 3. Onboarding Views

- [x] 3.1 Rewrite `renderWelcome()` in `views/onboarding.ts` — merged value prop text, language toggle buttons (`onboard:lang_en` / `onboard:lang_he`) with checkmark on current lang, and "Let's Go" button (`onboard:start`). Accept `currentLang` param to render checkmark correctly.
- [x] 3.2 Remove `renderLearnMore()` from `views/onboarding.ts`
- [x] 3.3 Rewrite `renderXKeysPrompt()` — feature-unlock framing header ("Unlock Your Voice"), list of features X enables (🔒 Repost, 🔒 Handwrite, 🔒 Follow, 🔒 Identity), inline 4-key format guide at the bottom, "Guide Me" URL button and "Skip" button
- [x] 3.4 Rewrite `renderIdentityStep()` — remove the `hasX` conditional (this screen is only shown when X is connected), add analysis description, aspects list, cost transparency line (`📊 ~N tweets · 1 AI call`), "Understand Me" and "Skip" buttons
- [x] 3.5 Add `renderIdentitySnippet()` — new view showing identity analysis success with a short preview snippet (~200 chars) of the generated document, link to full doc in Settings, and "Next" button advancing to Gemini step
- [x] 3.6 Rewrite `renderGeminiKeyPrompt()` — feature-unlock framing header ("Power Up the AI"), list of features Gemini enables (🔒 All AI generation, 🔒 Smart rewriting, 🔒 Identity-aware drafts), paste prompt, "Get Free Key" URL button and "Skip" button
- [x] 3.7 Rewrite `renderGitHubTokenPrompt()` — bonus framing header ("Bonus: Code → Content"), list of features GitHub enables (🔒 Auto-generate from commits, 🔒 Track repos), paste prompt, "Connect GitHub" URL button and "Not now" button
- [x] 3.8 Rewrite `renderComplete()` — replace service checklist with unlocked/locked feature summary based on connected services, concrete first-action CTA ("Try /repost with a tweet URL!"), Home and "Add More Keys" buttons

## 4. Onboarding Command Logic

- [x] 4.1 Add language toggle callback handlers in `handleOnboardingCallback()` — handle `onboard:lang_en` and `onboard:lang_he`: update `users.language`, re-render welcome in new language by editing the message in-place
- [x] 4.2 Update `onboard:start` handler — advance to `x_keys` instead of `gemini_key`
- [x] 4.3 Update X keys success flow in `handleXKeysInput()` — after X validation, advance to `identity` step instead of `github_token`
- [x] 4.4 Update `onboard:skip_x` handler — call `storeDefaultIdentity()`, then advance directly to `gemini_key` (bypass identity step entirely)
- [x] 4.5 Update identity analyze success flow — after `analyzeIdentity()` succeeds, extract snippet (~200 chars) from returned document, render `renderIdentitySnippet()`, then advance to `gemini_key` on "Next" button click
- [x] 4.6 Add `onboard:identity_next` callback handler — advances from identity snippet/success to `gemini_key` step
- [x] 4.7 Update identity default/failure flow — store default identity and advance to `gemini_key` (instead of completing)
- [x] 4.8 Update Gemini success flow in `handleGeminiKeyInput()` — after validation, advance to `github_token` (unchanged, but verify the next step render call is correct)
- [x] 4.9 Update `onboard:skip_gemini` handler — advance to `github_token` (instead of `x_keys`)
- [x] 4.10 Update GitHub success/skip flows — advance to `complete` (unchanged, verify)
- [x] 4.11 Remove `onboard:learn` callback handler
- [x] 4.12 Update `handleOnboardingMessage()` welcome branch — pass user's stored language to `renderWelcome()`

## 5. Identity Analysis Enhancement

- [x] 5.1 Update `analyzeIdentity()` return type in `ai/identity.ts` — change from `string | null` to `{ document: string; tweetCount: number } | null`. Return the tweet count from the fetched tweets array length.
- [x] 5.2 Update all callers of `analyzeIdentity()` — adjust for new return type in `commands/onboarding.ts`

## 6. Verify & Clean Up

- [x] 6.1 Ensure all `renderX()` calls pass the user's `lang` parameter throughout the entire onboarding flow
- [x] 6.2 Verify onboarding resume works with new step order — a user returning mid-onboarding on any step sees the correct new screen
- [x] 6.3 Test decision tree: Welcome → X(connect) → Identity(analyze) → Gemini → GitHub → Complete
- [x] 6.4 Test decision tree: Welcome → X(skip) → Gemini → GitHub → Complete (identity auto-defaulted)
- [x] 6.5 Test decision tree: Welcome → X(connect) → Identity(default) → Gemini → GitHub → Complete
- [x] 6.6 Test language toggle: switch EN↔HE on welcome, verify all subsequent steps render in selected language
