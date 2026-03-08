## Why

The current onboarding flow was built incrementally — steps were added in implementation order rather than designed for user experience. The result: API key collection starts immediately (cold start), the most impactful step (identity analysis) is buried last, and there's no language selection, no feature-unlocking framing, and no connection between each step and what it enables. This redesign creates a purposeful flow that builds excitement, connects each step to tangible outcomes, and puts the "magic moment" (identity analysis) early in the journey.

## What Changes

- **Reorder onboarding steps**: Welcome → X/Twitter → Identity → Gemini → GitHub → Complete (was: Welcome → Gemini → X → GitHub → Identity → Complete)
- **Add language selection to welcome screen**: English/Hebrew toggle on the first screen, auto-detected from Telegram's `language_code`, stored immediately and applied to the entire flow
- **Remove "Learn More" as a separate screen**: Merge the value proposition into the welcome message itself
- **Feature-unlock framing**: Each key step shows what features it unlocks (e.g., X unlocks Repost, Handwrite, Follow, Identity) instead of dry "Step 1/3" labels
- **Identity step follows X immediately**: If X was connected, offer tweet analysis right away; if X was skipped, silently use default identity and skip the identity screen entirely
- **Show identity snippet after analysis**: Display a short preview of the generated identity document after analysis completes
- **Cost transparency on identity step**: Show "~N tweets analyzed · 1 AI call" to set expectations
- **GitHub reframed as "Bonus"**: Visually distinct from required steps, clearly optional
- **Update `OnboardingStep` type**: New step order with new step names reflecting the redesigned flow
- **Update all onboarding strings**: New copy for both English and Hebrew reflecting unlock framing and new step order

## Capabilities

### New Capabilities
_(none — this is a redesign of existing capabilities)_

### Modified Capabilities
- `user-onboarding`: Complete rewrite of step order, decision tree, welcome screen with language selection, feature-unlock framing, identity-after-X flow, and completion screen
- `i18n-strings`: New and updated onboarding string keys for both languages to support redesigned screens

## Impact

- **Commands**: `cloudflare-bot/src/commands/onboarding.ts` — rewrite step routing and callback handlers for new flow order and new callbacks (language toggle, merged welcome)
- **Views**: `cloudflare-bot/src/views/onboarding.ts` — rewrite all render functions for new screens, new copy, unlock framing
- **Types**: `cloudflare-bot/src/types.ts` — update `OnboardingStep` type to match new steps
- **Strings**: `cloudflare-bot/src/ui/strings/en.ts` and `he.ts` — new onboarding section keys
- **Identity**: Minor change to `cloudflare-bot/src/ai/identity.ts` — return tweet count for cost display; return snippet from identity document
- **Database**: `onboarding_step` column values change (migration-safe since it's a TEXT column)
