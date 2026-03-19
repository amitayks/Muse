## Why

The bot now uses skills/identity for tone, style, and content decisions. Per-repo and per-account config fields for hashtags, image probability, and tone are redundant — some were never wired to backend logic at all (dead config). Removing them simplifies the UI and eliminates user confusion about settings that don't affect output.

## What Changes

**RepoConfig — remove 3 fields:**
- `includeHashtags` — dead config (never consumed by repo content gen)
- `alwaysGenerateThreadImage` — dead config (publish pipeline always generates)
- `singleTweetImageProbability` — dead config (never consumed)

**TwitterAccountConfig — remove 4 fields:**
- `includeHashtags` — remove from repost prompt builder
- `alwaysGenerateImage` — dead config
- `singleImageProbability` — dead config
- `tone` — remove from repost prompt builder; identity/skills now control tone

**UI cleanup:**
- Remove "Content Settings" section + hashtag toggle from repo detail view
- Remove "Image Settings" section + img toggle + img% button from repo detail view
- Remove hashtag toggle, tone button, img toggle, img% button from account detail view
- Remove "Image Settings" section from account detail view
- Remove related i18n strings
- Remove toggle handlers for removed settings

**Prompt cleanup:**
- Remove `includeHashtags` param from `buildRepostUserPrompt`
- Remove `tone` param from `buildRepostUserPrompt`

**Keep intact:** Image generation pipeline (`generateImage` in gemini.ts, publish.ts logic)

## Capabilities

### New Capabilities

### Modified Capabilities
- `repost-system`: Remove tone and includeHashtags from repost prompt builder

## Impact

- `src/types.ts` — RepoConfig, TwitterAccountConfig, defaults
- `src/views/repos.ts` — repo detail view
- `src/views/accounts.ts` — account detail view
- `src/actions/config-toggle.ts` — repo config toggle handler
- `src/actions/account-config.ts` — account config toggle handler
- `src/actions/repost-preview.ts` — fallback config
- `src/ai/repost-generate.ts` — config fields passed to prompt
- `src/ai/repost-prompt.ts` — prompt builder params
- `src/ui/strings/en.ts` + `he.ts` — i18n strings
- Existing user DB data: config JSON will have extra fields that get silently ignored by TypeScript
