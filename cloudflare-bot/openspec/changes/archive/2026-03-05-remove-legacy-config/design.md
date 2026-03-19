## Context

The bot previously had per-repo and per-account config for hashtags, image probability, and tone. With the identity/skills system now controlling content style, these config fields are redundant. Some (repo image settings) were never wired to backend logic at all.

## Goals / Non-Goals

**Goals:**
- Remove 3 fields from RepoConfig: `includeHashtags`, `alwaysGenerateThreadImage`, `singleTweetImageProbability`
- Remove 4 fields from TwitterAccountConfig: `includeHashtags`, `alwaysGenerateImage`, `singleImageProbability`, `tone`
- Remove all UI (display, buttons, toggle handlers) for these fields
- Remove prompt parameters (`tone`, `includeHashtags`) from repost prompt builder
- Clean up related i18n strings

**Non-Goals:**
- Changing the image generation pipeline itself (keep `generateImage` in gemini.ts, keep publish.ts logic)
- DB migration — existing config JSON will have extra fields that TypeScript silently ignores
- Removing the tone selector from the manual repost preview UI (that's a separate concern — we'll handle it if needed)

## Decisions

### 1. No DB migration needed
**Decision:** Don't migrate existing config JSON in DB rows.
**Rationale:** TypeScript's `JSON.parse()` into the interface silently ignores extra fields. Old configs with `includeHashtags: true` just have an unused property. New configs created after this change won't include these fields.

### 2. Remove entire "Content Settings" and "Image Settings" sections from repo view
**Decision:** Remove both sections since all their fields are being removed.
**Rationale:** After removing hashtags, the "Content Settings" section is empty. After removing img + img%, the "Image Settings" section is empty.

### 3. Remove tone from repost-preview.ts fallback config
**Decision:** Remove `tone` from the fallback `effectiveConfig` object and from `buildRepostUserPrompt`.
**Rationale:** Identity/skills now control tone. The tone param in the prompt was the only place it was consumed.

### 4. Keep the tone selector in repost preview for now
**Decision:** The manual repost preview has tone selector buttons. We'll evaluate removing those separately if needed.
**Rationale:** The tone selector in the preview is a separate UI concern tied to the `repost_preview` context state.

Wait — actually, since we're removing `tone` from the prompt builder entirely, the tone selector buttons in the preview become dead UI. We should remove them too.

**Revised Decision:** Remove tone selector from repost preview as well, and remove `selected_tone` from the `repost_preview` context state.

## Risks / Trade-offs

- **[Risk] Users with custom tone preferences lose them** → Acceptable, identity/skills is the replacement
- **[Risk] Leftover config JSON in DB** → Harmless, TypeScript ignores extra fields
- **[Trade-off] Simpler UI but less control** → Intentional; skills/identity is the new control surface
