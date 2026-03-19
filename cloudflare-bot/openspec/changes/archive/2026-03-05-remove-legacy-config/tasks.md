## 1. Types & Defaults

- [x] 1.1 Remove `includeHashtags`, `alwaysGenerateThreadImage`, `singleTweetImageProbability` from `RepoConfig` interface in `types.ts`
- [x] 1.2 Remove same 3 fields from `DEFAULT_REPO_CONFIG` in `types.ts`
- [x] 1.3 Remove `includeHashtags`, `alwaysGenerateImage`, `singleImageProbability`, `tone` from `TwitterAccountConfig` interface in `types.ts`
- [x] 1.4 Remove same 4 fields from `DEFAULT_TWITTER_ACCOUNT_CONFIG` in `types.ts`
- [x] 1.5 Remove `selected_tone` from `repost_preview` in `ChatContext` interface in `types.ts`; remove the `TwitterAccountConfig['tone']` type reference

## 2. Repo UI

- [x] 2.1 Remove "Content Settings" section (hashtags display + icon) from `views/repos.ts`
- [x] 2.2 Remove "Image Settings" section (threadImage display + singleProb display) from `views/repos.ts`
- [x] 2.3 Remove hashtag toggle button row from `views/repos.ts` keyboard
- [x] 2.4 Remove img toggle + img% cycle button row from `views/repos.ts` keyboard
- [x] 2.5 Remove `hashtagOn`, `hashtagIcon`, `imgOn`, `imgIcon` variables from `views/repos.ts`

## 3. Account UI

- [x] 3.1 Remove hashtag display line from `views/accounts.ts`
- [x] 3.2 Remove tone display line from `views/accounts.ts`
- [x] 3.3 Remove "Image Settings" section (alwaysImage + singleProb) from `views/accounts.ts`
- [x] 3.4 Remove hashtag toggle button from `views/accounts.ts` keyboard
- [x] 3.5 Remove tone cycle button from `views/accounts.ts` keyboard
- [x] 3.6 Remove img toggle + img% button row from `views/accounts.ts` keyboard
- [x] 3.7 Remove `hashtagOn`, `hashtagIcon`, `imgOn`, `imgIcon` variables and `toneLabels` map from `views/accounts.ts`

## 4. Config Toggle Handlers

- [x] 4.1 Remove `case 'hashtags'`, `case 'threadImage'`, `case 'singleImage'` from `actions/config-toggle.ts`
- [x] 4.2 Remove `case 'hashtags'`, `case 'img'`, `case 'img_pct'`, `case 'tone'` from `actions/account-config.ts`; remove `TONES` and `IMAGE_PROBABILITIES` constants

## 5. Repost Preview & Generation

- [x] 5.1 Remove `rpToneAction` export and handler from `actions/repost-preview.ts`; remove `tone` from `effectiveConfig`
- [x] 5.2 Remove `rp_tone` route from `core/router.ts`; remove `rpToneAction` import
- [x] 5.3 Remove `selectedTone` param from `renderRepostPreview` in `views/repost.ts`; remove tone selector buttons (toneRow1, toneRow2) and tone display line
- [x] 5.4 Remove `selected_tone` assignment from `inputs/repost-url.ts` repost_preview context
- [x] 5.5 Remove `tone` and `includeHashtags` params from `buildRepostUserPrompt` in `ai/repost-prompt.ts`; remove their lines from prompt output
- [x] 5.6 Remove `config.tone` and `config.includeHashtags` from call to `buildRepostUserPrompt` in `ai/repost-generate.ts`; remove `effectiveConfig.tone` override in `actions/repost-preview.ts`

## 6. I18n Strings

- [x] 6.1 Remove from `ui/strings/en.ts`: `repos.contentSettings`, `repos.hashtags`, `repos.imageSettings`, `repos.threadImage`, `repos.always`, `repos.singleProb`, `accounts.alwaysImage`, `accounts.tone*` (6 tone labels)
- [x] 6.2 Remove from `ui/strings/he.ts`: same keys as 6.1
- [x] 6.3 Remove repost tone strings if any: `repost.toneLabel`, `repost.toneSelectHint`

## 7. Verify

- [x] 7.1 Run `tsc --noEmit` — must pass with zero errors
- [x] 7.2 Deploy and smoke test
