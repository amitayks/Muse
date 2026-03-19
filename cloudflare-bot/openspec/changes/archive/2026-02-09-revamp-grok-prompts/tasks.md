## 1. Type System Changes

- [x] 1.1 Add `ImagePromptData` interface to `types.ts` with concept, composition, environment, and technical categories
- [x] 1.2 Update `DraftContent.imagePrompt` type from `string` to `ImagePromptData | string | undefined`
- [x] 1.3 Add `commitMessages: string[]` and `fileNames: string[]` to `PRData` interface
- [x] 1.4 Add `commitMessages: string[]` and `fileNames: string[]` to `CommitData` interface
- [x] 1.5 Remove `tone` from `RepoConfig` interface and `DEFAULT_REPO_CONFIG`
- [x] 1.6 Remove `codeContext` and `CodeContextLevel` from `RepoConfig` interface and `DEFAULT_REPO_CONFIG`

## 2. GitHub Data Pipeline

- [x] 2.1 Update `getPR()` in `github.ts` to fetch commit messages (map `commits[].commit.message` first line) and populate `PRData.commitMessages`
- [x] 2.2 Add PR file names fetch in `getPR()` via `GET /repos/{owner}/{repo}/pulls/{number}/files` to populate `PRData.fileNames`
- [x] 2.3 Update `getCommitData()` in `github.ts` to populate `CommitData.commitMessages` with the commit title and `CommitData.fileNames` from `commit.files[].filename`

## 3. Webhook Handlers

- [x] 3.1 Update PR webhook handler in `github-webhook.ts` to fetch commit messages via GitHub API (call `GET /repos/{owner}/{repo}/pulls/{number}/commits`) and populate `contentSource.data.commitMessages`
- [x] 3.2 Update PR webhook handler to fetch file names via GitHub API (call `GET /repos/{owner}/{repo}/pulls/{number}/files`) and populate `contentSource.data.fileNames`
- [x] 3.3 Update push webhook handler to extract `commitMessages` from `event.commits[].message` (first line of each)
- [x] 3.4 Update push webhook handler to extract `fileNames` by combining and deduplicating `added`, `modified`, `removed` from all commits

## 4. Grok System Prompt Redesign

- [x] 4.1 Rewrite `buildContentPrompt()` to send ONLY commit messages and file names (remove title, body, author, stats)
- [x] 4.2 Rewrite the `generateContent()` system prompt with multi-perspective creative approach: tweet perspectives (Tech Influencer, Copywriter, Growth Marketer, Community Manager) and image perspectives (Creative Director, Art Director, Brand Designer)
- [x] 4.3 Update system prompt to require `imagePrompt` as structured `ImagePromptData` JSON object in the response format
- [x] 4.4 Rewrite `editContent()` system prompt with the same multi-perspective creative approach

## 5. Image Prompt Handling

- [x] 5.1 Update `generateImage()` to handle both `ImagePromptData` objects (JSON.stringify) and legacy string prompts
- [x] 5.2 Rewrite `buildImagePrompt()` fallback to return an `ImagePromptData` object instead of a plain string
- [x] 5.3 Add validation in `generateContent()` response parsing to verify imagePrompt is valid ImagePromptData, fall back to `buildImagePrompt()` if not

## 6. Remove Dead Config UI

- [x] 6.1 Remove `tone` toggle case from `callback.ts` config handler
- [x] 6.2 Remove `codeContext` toggle case from `callback.ts` config handler
- [x] 6.3 Remove tone display and button from `views/index.ts` repo config view
- [x] 6.4 Remove codeContext display and button from `views/index.ts` repo config view

## 7. Cleanup

- [x] 7.1 Remove unused `getEnhancedCodeContext()`, `fetchCommitDiff()`, and `fetchFileContent()` from `github.ts` (no longer needed — data pipeline is locked to commits + files only)
- [x] 7.2 Verify build passes with `npm run build` or TypeScript compilation
