/**
 * English string registry — all user-facing strings organized by domain
 */

export const en = {
    common: {
        home: '🏠 Home',
        back: '◀️ Back',
        cancel: '❌ Cancel',
        on: 'On',
        off: 'Off',
        yes: 'Yes',
        no: 'No',
        error: '❌ <b>Error</b>',
        success: '✅ <b>Success!</b>',
        delete: 'Delete',
        yesDelete: 'Yes, delete',
        prev: '⬅️ Prev',
        next: 'Next ➡️',
        example: '<b>Example:</b>',
        loading: 'Loading...',
        tapToChange: 'Tap a setting to change it:',
        arrow: '→',
        total: 'total',
        page: 'Page',
        of: 'of',
        done: 'Done',
    },

    home: {
        title: '🤖 <b>Content Bot Dashboard</b>',
        nextUp: '📅 <b>Next up:</b>',
        queueLabel: '📊 <b>Queue:</b>',
        scheduled: 'scheduled',
        drafts: 'drafts',
        approved: 'approved',
        allClear: '👋 All clear! No posts in queue.',
        singleTweet: 'Single Tweet',
        pending: 'Pending',

        // Button labels
        btnSchedule: '📅 Schedule',
        btnDrafts: '📝 Drafts',
        btnHandwrite: '✍️ Handwrite',
        btnGenerate: '⚡ Generate',
        btnRepost: '🔄 RePost',
        btnRepos: '📦 Repos',
        btnAccounts: '👤 Accounts',
        btnVideoStudio: '🎬 Video Studio',
        btnSettings: '⚙️ Settings',
        btnHelp: '❓ Help',
    },

    help: {
        title: '❓ <b>Help</b>',
        createContent: '<b>Create Content</b>',
        generateDesc: '⚡ <b>Generate</b> — AI creates a post from any commit or PR',
        handwriteDesc: '✍️ <b>Handwrite</b> — Compose your own tweet or thread',
        repostDesc: '🔄 <b>RePost</b> — Quote-tweet from any tweet URL',
        manage: '<b>Manage</b>',
        draftsDesc: '📝 <b>Drafts</b> — Review, edit, approve, schedule, or delete',
        reposDesc: '📦 <b>Repos</b> — Watch repos for auto-generated content',
        accountsDesc: '👤 <b>Accounts</b> — Follow X accounts for repost suggestions',
        howItWorks: '<b>How it works</b>',
        howItWorksDesc: 'Watch a repo → new PRs auto-generate drafts → review and publish to X. Scheduled posts go out automatically. AI images are generated and attached when publishing.',
        quickCommands: '<b>Quick commands</b>',
        quickCommandsList: '/generate, /handwrite, /repost, /drafts, /repos, /watch, /help',
    },

    error: {
        tapHome: 'Tap Home to return to the dashboard.',
        occurred: 'An error occurred.',
        repoNotFound: 'Repository not found.',
        accountNotFound: 'Account not found.',
        draftNotFound: 'Draft not found.',
        videoNotFound: 'Video not found.',
        invalidTimezone: 'Invalid timezone format. Use UTC+N or UTC-N format.',
        missingRepo: 'Missing repository.',
        missingField: 'Missing field.',
        noOverview: 'No overview found. Bootstrap one first.',
        videoAdminOnly: '❌ Video Studio is only available to the admin.',
        commitEventNotFound: 'Commit event not found.',
        commitAlreadyGenerated: 'A draft has already been generated for this event.',
        commitFetchFailed: '❌ <b>Commit not found</b>\n\nCouldn\'t find <code>{sha}</code> in your repos. Make sure the commit is pushed to GitHub.\n\nSend another commit SHA or PR number to try again.',
        githubTokenMissing: '❌ <b>GitHub not connected</b>\n\nYou need to add your GitHub token first. Go to Settings → API Keys to set it up.',
        commitSourceParseFailed: 'Failed to parse event source data.',
    },

    success: {
        title: '✅ <b>Success!</b>',
    },

    generating: {
        title: '🔄 <b>Generating...</b>',
        findingPr: 'Finding PR for commit',
        mayTakeMoment: 'This may take a moment.',
    },

    publishing: {
        title: '📤 <b>Publishing...</b>',
        publishingTo: 'Publishing to X...',
        pleaseWait: 'Please wait.',
    },

    compose: {
        title: '✍️ <b>Compose Your Post</b>',
        instructions: 'Send me your content — each message becomes a tweet in the thread.',
        textHint: '📝 <b>Text</b> — just type and send',
        photoHint: '📷 <b>Photo</b> — attach an image (with optional caption)',
        editHint: '✏️ <b>Edit</b> — edit any sent message to update it',
        whenDone: 'When you\'re done, tap <b>Pen Down</b> to save your draft.',
        imageHint: '🎨 <b>Image</b> — AI generates an eye-catching image for your post',
        aiHint: '✨ <b>AI Refine</b> — polishes your writing while keeping your voice',
        instructHint: '📝 <b>Instruct</b> — give AI custom instructions for your content',
        analyzeHint: '📷 <b>Analyze</b> — AI sees your attached images for smarter refinement',
        composing: '✍️ <b>Composing</b>',
        btnPenDown: '✏️ Pen Down',
        btnImage: '🎨 Image',
        btnAi: '✨ AI',
        xImageLimit: '⚠️ 𝕏: {count}/4 — only first 4 will post',
        igImageLimit: '⚠️ IG: <s>{count}/10</s> — only first 10 will post',

        // Compose buttons
        btnInstruct: '📝 Instruct',
        btnAnalyze: '📷 Analyze',

        // Instruction UX
        instructToast: 'Type your instruction next',
        awaitingInstruction: '📝 Type your instruction next...',
        instructionPrefix: '📝',

        // Repost compose mode
        repostHeader: '🔄 <b>Repost from @{username}</b>',
        repostInstructions: 'Add your own tweets, images, or instructions — or just tap <b>Pen Down</b> to generate.',
        repostThreadIndicator: '🧵 Thread',
        repostImageIndicator: '🖼 Has image',
        andMoreTweets: '...and {count} more',

        // Commit compose mode
        commitHeader: '📌 <b>{repoShort} | {title}</b>',
        commitStats: '{commits} commits · {files} files',
        commitStatsFull: '{commits} commits · {files} files · +{additions} / -{deletions}',
        commitInstructions: 'Add your own tweets, attach images, or tap <b>Pen Down</b> to generate from this change.',

        // Compose status messages
        generatingFromInstruction: '✨ Generating from instruction...',
        refiningAndImage: '✨ Refining text & generating image...',
        refiningAi: '✨ Refining with AI...',
        generatingImagePrompt: '🖼 Generating image prompt...',
        savingDraft: '💾 Saving draft...',
        generatingImage: '🎨 Generating image...',
    },

    settings: {
        title: '⚙️ <b>Settings</b>',
        timezone: '🕐 <b>Timezone:</b>',
        pageSize: '📏 <b>Page Size:</b>',
        language: '🌐 <b>Language:</b>',
        items: 'items',
        utcDefault: 'UTC (default)',

        btnTimezone: '🕐 Timezone',
        btnPageSize: '📏 Page Size',
        btnApiKeys: '🔑 API Keys',
        btnSystemPrompts: 'System Prompts',
        btnSystemPromptsAdmin: 'System Prompts (Admin)',
        btnLanguage: '🌐',
        btnAnalyzeIdentity: '🪞 Analyze identity',

        // Identity language notification
        identityLangNotification: '🪞 <b>Identity not available in this language</b>\n\nYour identity was analyzed in another language. You can re-analyze it for this language, or keep using the default identity.',
        btnReanalyzeIdentity: '🪞 Re-analyze',
        btnKeepDefault: '👍 Keep default',
        identityNoX: '⚠️ X/Twitter credentials are required for identity analysis.',
        identityNoXConnect: '⚠️ X/Twitter credentials are required for identity analysis.\n\nPlease connect your X account first from API Keys settings.',
        identityReanalyzed: '✅ <b>Identity re-analysis complete!</b>\n\nYour identity document has been updated.',
        identityReanalyzedWebApp: '✅ <b>Identity re-analysis complete!</b>\n\nYour Identity Document has been updated. You can view and edit it in the WebApp.',
        identityAnalyzeFailed: '⚠️ Analysis failed. Your existing identity remains unchanged.',
        identityAnalyzeFailedRetry: '⚠️ Re-analysis failed. Please try again later.\n\nYour existing identity remains unchanged.',
        identityAnalyzeFailedNoTweets: '⚠️ Re-analysis failed. No tweets were found or an error occurred.\n\nYour existing identity remains unchanged.',

        // Repost defaults
        repostDefaults: '🔄 <b>Repost Defaults</b>',
        btnFastImage: '🎨 Fast Image',
        btnSourceAnalysis: '📷 Source Analysis',

        // Commit defaults
        commitDefaults: '💻 <b>Commit Defaults</b>',
        btnCommitFastImage: '🎨 Auto Image',
        btnCommitFastAi: '🤖 Auto AI',

        languageEn: '🇺🇸 English',
        languageHe: '🇮🇱 עברית',

        // Timezone select
        timezoneTitle: '🕐 <b>Select Timezone</b>',
        timezoneDesc: 'Choose a UTC offset or type a custom one:',
        timezoneCustom: '⌨️ Type custom offset',
        timezoneInputTitle: '⌨️ <b>Custom Timezone</b>',
        timezoneInputDesc: 'Type your UTC offset:',
        timezoneInputExamples: 'Examples: <code>UTC+2</code>, <code>UTC-5:30</code>, <code>UTC+9:45</code>',

        // Page size select
        pageSizeTitle: '📏 <b>Page Size</b>',
        pageSizeDesc: 'Choose how many items to show per page:',
        pageSizeCurrent: 'Current:',

        // API Keys
        apiKeysTitle: '🔑 <b>API Keys</b>',
        geminiAi: 'Gemini AI',
        xTwitter: 'X/Twitter',
        github: 'GitHub',
        instagram: 'Instagram',
        update: 'Update',
        connect: 'Connect',
        connected: 'Connected',
        notConnected: 'Not connected',
    },

    repos: {
        title: '📦 <b>Watched Repositories</b>',
        noRepos: 'No repositories are being watched yet.\n\nAdd a repo to start auto-detecting new PRs and commits!',
        tapToManage: 'Tap a repo to manage settings.',
        addRepo: '➕ Add repo',
        watching: '👁 Watching',
        paused: '⏸️ Paused',

        // Detail
        watchSettings: '<b>Watch Settings:</b>',
        prs: 'PRs',
        pushes: 'Pushes',
        branches: '📌 Branches:',

        // Overview
        projectOverview: '<b>Project Overview:</b>',
        noOverviewYet: 'No overview yet — run <code>/overview {repo}</code> to bootstrap.',
        noSummary: 'No summary',
        editOverview: '✏️ Edit Overview',
        rebootstrap: '🔄 Re-bootstrap',
        bootstrapOverview: '🔍 Bootstrap Overview',

        // Actions
        stopWatching: 'Stop watching',
        startWatching: 'Start watching',

        // Add repo
        addRepoTitle: '➕ <b>Add Repository</b>',
        addRepoDesc: 'Send me the repository in <code>owner/repo</code> format.\n\nI\'ll set up a webhook to auto-detect new PRs and commits.',
        addRepoExample: 'ozkeisar/work-content-tracker',

        // Delete confirm
        deleteRepoTitle: 'Delete Repository?',
        deleteRepoMsg: 'Are you sure you want to delete:\n<code>{repo}</code>\n\nThis will also remove the webhook from GitHub.',

        // Config
        push: 'Push',

        // Overview edit
        editOverviewTitle: '✏️ <b>Edit Overview</b>',
        editOverviewDesc: 'Select a field to edit:',
        fieldSummary: '📋 Summary',
        fieldTechStack: '🛠 Tech Stack',
        fieldKeyFeatures: '⭐ Key Features',
        fieldTargetAudience: '👥 Target Audience',
        fieldBrandVoice: '🎤 Brand Voice',
        fieldVisualTheme: '🎨 Visual Theme',
        editFieldTitle: '✏️ <b>Edit {label}</b>',
        currentValue: '<b>Current value:</b>',
        sendNewValue: 'Send the new value:',
        empty: '(empty)',
        summaryLabel: 'Summary',
        techStackLabel: 'Tech Stack',
        keyFeaturesLabel: 'Key Features (comma-separated)',
        targetAudienceLabel: 'Target Audience',
        brandVoiceLabel: 'Brand Voice',
        visualThemeLabel: 'Visual Theme',
    },

    accounts: {
        title: '👤 <b>Followed Accounts</b>',
        noAccounts: 'No accounts are being followed yet.\n\nAdd a Twitter/X account to start auto-detecting new tweets for repost!',
        tapToManage: 'Tap an account to manage settings.',
        addAccount: '➕ Add account',

        // Detail
        repostSettings: '<b>Repost Settings:</b>',
        threshold: '🎯 Threshold:',
        autoApprove: 'Auto-approve:',

        // Persona
        personaLabel: '<b>Persona:</b>',
        noPersona: 'No persona yet — tap Bootstrap to generate one.',
        updatePersona: '🔍 Update Persona',
        bootstrapPersona: '🔍 Bootstrap Persona',

        // Actions
        unfollow: 'Unfollow',
        follow: 'Follow',

        // Add account
        addAccountTitle: '➕ <b>Add Twitter Account</b>',
        addAccountDesc: 'Send me the Twitter/X username to follow.\n\nI\'ll start watching for their new tweets and notify you when there\'s something worth reposting.',
        addAccountExample: '@vercel or vercel',

        // Delete confirm
        deleteAccountTitle: 'Delete Account?',
        deleteAccountMsg: 'Are you sure you want to stop following:\n<b>@{username}</b>\n\nThis will also delete all stored tweets and persona data for this account.',

        // Config toggles
        auto: 'Auto',
        analyzeMedia: 'Analyze Media',
    },

    drafts: {
        title: '📝 <b>Drafts</b>',
        noDrafts: 'No drafts yet. Use ⚡ Generate or ✍️ Handwrite to create one!',
        selectCategory: 'Select a category:',
        autoGenerated: '📤 Auto-generated',
        handwritten: '✍️ Handwritten',
        reposts: '🔄 RePosts',
        approvedLabel: 'Approved',
        scheduledLabel: '📅 Scheduled',
        publishedLabel: '🗂 Published',

        // Draft list type labels
        typeAuto: 'Auto-generated',
        typeApproved: 'Approved',
        typeHandwrite: 'Handwritten',
        typeScheduled: 'Scheduled',
        typePublished: 'Published',
        typeRepost: 'RePosts',

        noDraftsInType: 'No {type} drafts found.',

        // Draft detail
        repostDraft: '🔄 Repost Draft',
        handwrittenDraft: '✍️ Handwritten Draft',
        draftForPr: '📋 Draft for PR #{number}',
        originalTweet: '🔗 Original tweet',
        format: '<b>Format:</b>',
        singleTweet: 'Single Tweet',
        tweetN: '<b>Tweet {n}:</b>',

        // Actions
        approve: '✅ Approve',
        publishNow: '📤 Publish Now',
        schedule: '📅 Schedule',
        aiRefine: '✨ AI Refine',
        edit: '✏️ Edit',
        viewOnX: '🔗 View on X',

        // Delete draft confirm
        deleteDraftTitle: '🗑 <b>Delete Draft?</b>',
        deleteDraftWarn: '⚠️ This will permanently delete this draft. This action cannot be undone.',

        // Generate prompt
        generateTitle: '⚡ <b>Generate Content</b>',
        generateDesc: 'Send me a commit SHA or PR number.\n\nExample: <code>abc1234</code> or <code>42</code>\n\nI\'ll find the PR and create engaging content for it!',

        // Schedule prompt
        scheduleTitle: '📅 <b>Schedule Post</b>',
        scheduleDesc: 'Send me the commit SHA and datetime.\n\nFormat: <code>abc1234 2024-01-15 14:00</code>\n\nThe content will be generated now and published at the scheduled time.',

        // Delete prompt
        deleteTitle: '🗑️ <b>Delete Posts</b>',
        deleteDesc: 'Send me a commit SHA to find published posts from that PR.\n\nExample: <code>abc1234</code>\n\nI\'ll show you all posts so you can choose which to delete.',

        // Draft detail — not found
        notFoundTitle: '❌ <b>Draft Not Found</b>',
        notFoundMsg: 'This draft may have been deleted.',

        // Retrieving
        retrieving: '⏳ <b>Retrieving your draft...</b>',
    },

    onboarding: {
        // Welcome (merged value prop — no separate Learn More screen)
        welcomeTitle: '🎭 <b>Welcome to Muse!</b>',
        welcomeSubtitle: 'Your AI content partner for X/Twitter and Instagram.',
        welcomeDesc: "I'll help you turn your code and ideas into polished posts — in YOUR voice.",
        welcomeFeatures: '<b>What you can do:</b>',
        welcomeFeatureRepost: '🔄 <b>Repost</b> — Turn any tweet into your styled take',
        welcomeFeatureGenerate: '⚡ <b>Generate</b> — Create content from your GitHub commits',
        welcomeFeatureHandwrite: '✍️ <b>Handwrite</b> — Compose tweets with AI refinement',
        welcomeFeatureFollow: '👤 <b>Follow</b> — Track X accounts and auto-generate reposts',
        welcomeSetup: "Let's connect your accounts to get started.",
        welcomeDisclaimer: '<i>You bring your own API keys. All keys are encrypted and never shared.</i>',
        langEn: '🇺🇸 English',
        langHe: '🇮🇱 עברית',
        btnLetsGo: '🚀 Let\'s Go',

        // X/Twitter (Step 1 — Unlock Your Thoughts)
        xTitle: '🔓 <b>Unlock Your Thoughts</b>',
        xDesc: 'X is where your thoughts live. Connect it to unlock:',
        xFeatureRepost: '🔄 Paste any tweet URL → get a styled quote-tweet draft',
        xFeatureHandwrite: '✍️ Write tweets & threads with AI polish that sounds like you',
        xFeatureFollow: '👤 Monitor X accounts and auto-draft reposts when they tweet',
        xFeatureIdentity: '🪞 Analyze your tweets to learn your unique writing style',
        xFormat: '<b>Send 4 values</b> (one per line):',
        xKey: '<code>API_KEY</code>',
        xSecret: '<code>API_SECRET</code>',
        xAccessToken: '<code>ACCESS_TOKEN</code>',
        xAccessSecret: '<code>ACCESS_SECRET</code>',
        xDeleteNote: '<i>(I\u2019ll delete the message immediately after saving)</i>',
        btnHowToGetThem: '📖 Guide Me',
        btnSkipForNow: '⏭ Skip for now',
        xSuccess: '✅ <b>X/Twitter connected!</b>',

        // Instagram (Unlock Your Reach)
        instagramTitle: '🔓 <b>Unlock Your Reach</b>',
        instagramDesc: 'Expand beyond X — publish Reels and posts to Instagram.',
        instagramUnlockLabel: 'Connect Instagram to unlock:',
        instagramFeatureReels: '📱 Turn your posts into Instagram Reels automatically',
        instagramFeatureCross: '🔀 Publish to both X and Instagram from one place',
        instagramFormat: '<b>Send 2 values</b> (one per line):',
        instagramAccessToken: '<code>ACCESS_TOKEN</code>',
        instagramAccountId: '<code>BUSINESS_ACCOUNT_ID</code>',
        instagramDeleteNote: '<i>(I\u2019ll delete the message immediately after saving)</i>',
        btnInstagramGuide: '📖 Meta Developers',
        instagramSuccess: '✅ <b>Instagram connected!</b>',

        // Identity (Unlock Your Identity)
        identityTitle: '🔓 <b>Unlock Your Identity</b>',
        identityDesc: 'This is the magic moment. I\'ll analyze your recent tweets to understand:',
        identityAspectStyle: '• Your writing rhythm and style',
        identityAspectVocab: '• Your vocabulary and tone',
        identityAspectEmotion: '• Your emotional patterns',
        identityAspectInterests: '• Your interests and perspective',
        identityFoundation: 'This creates your Identity Document — the foundation for everything I write.',
        identityCost: '📊 ~{count} tweets analyzed · 1 AI call',
        btnUnderstandMe: '🔍 Understand Me',
        btnUseDefault: '📝 Use default',
        identityAnalyzing: '🔍 Analyzing your tweets... This may take a moment.',
        identitySuccessTitle: '✅ <b>Identity analysis complete!</b>',
        identitySnippetLabel: '<b>Here\'s what I see:</b>',
        identitySnippetFooter: '(full document available in Settings)',
        identityFailed: '⚠️ Analysis didn\'t work this time. Using a neutral default — you can re-analyze anytime from Settings.',
        btnNext: 'Next →',

        // Gemini (Step 3 — Power Up the AI)
        geminiTitle: '🔓 <b>Power Up the AI</b>',
        geminiDesc: 'Now that I know your voice, I need an engine to write in it.',
        geminiUnlockLabel: 'Connect Gemini to unlock:',
        geminiFeatureGeneration: '⚡ AI creates original posts from your code and ideas',
        geminiFeatureRewriting: '✨ Polish any draft to match your personal writing style',
        geminiFeatureIdentity: '🧠 Every draft shaped by your unique voice profile',
        geminiGetYours: 'Free key · takes 30 seconds:',
        geminiLink: 'aistudio.google.com/apikey',
        geminiPaste: '📋 Paste your key below:',
        geminiDeleteNote: '<i>(I\u2019ll delete your message immediately after saving the key)</i>',
        btnHowToGet: '📖 Get Free Key',
        geminiSuccess: '✅ <b>Gemini connected!</b>',

        // GitHub (Bonus — Code → Content)
        githubTitle: '🎁 <b>Bonus: Code → Content</b>',
        githubDesc: 'Ship code? Let me turn your commits into posts.',
        githubUnlockLabel: 'Connect GitHub to unlock:',
        githubFeatureGenerate: '📝 New commits and PRs become ready-to-publish drafts',
        githubFeatureRepos: '👁 Monitor repos and auto-generate content for updates',
        githubCreate: 'Create a personal access token at:',
        githubLink: 'github.com/settings/tokens',
        githubPaste: '📋 Paste your token below:',
        btnCreateToken: '📖 Connect GitHub',
        btnNotNow: 'Not now',
        githubSuccess: '✅ <b>GitHub connected!</b>',

        // Complete
        completeTitle: '🎉 <b>You\u2019re all set!</b>',
        completeUnlockedLabel: '<b>Unlocked:</b>',
        completeLockedLabel: '<b>Connect later to unlock:</b>',
        featureRepost: '🔄 Repost',
        featureHandwrite: '✍️ Handwrite',
        featureFollow: '👤 Follow',
        featureIdentity: '🪞 Identity',
        featureInstagram: '📸 Instagram Publishing',
        featureAiGeneration: '🤖 AI Generation',
        featureCodeToContent: '⚡ Code → Content',
        completeHint: 'Try /repost with any tweet URL to get started!',
        btnAddMoreKeys: '⚙️ Add More Keys',

        // Key error
        keyErrorTitle: '❌ <b>{service} key validation failed</b>',
        keyErrorDefault: 'The key appears to be invalid. Please check and try again.',
        keyErrorRetrySkip: 'Paste a new key or skip this step.',
        keyErrorRetry: 'Paste a new key to try again.',
    },

    repost: {
        // Prompt
        promptTitle: '🔄 <b>Manual RePost</b>',
        promptDesc: 'Send me a tweet URL to create a repost.',
        supportedFormats: '<b>Supported formats:</b>',
        promptHint: "I'll fetch the tweet, show you a preview, then generate a quote tweet.",

        // Preview
        previewTitle: '🔄 <b>RePost Preview</b>',
        hasImage: '🖼 Has image — will be analyzed by AI',
        duplicateWarning: '⚠️ <b>Duplicate Detected</b>\n\nYou already have a repost draft for this tweet.',
        viewExisting: '👁 View Existing',
        generateAnyway: '⚡ Generate Anyway',
        generateRepost: '⚡ Generate RePost',
        openTweet: '🔗 Open Tweet',

        // Generating
        generatingTitle: '⏳ <b>Generating repost for @{username}...</b>',
        generatingDesc: 'Fetching context and creating your quote tweet.',
    },

    video: {
        // Studio home
        studioTitle: '🎬 <b>Video Studio</b>',
        studioDesc: 'Create AI avatar videos from your code updates.',
        studioSelect: 'Select a repo or create a standalone video:',
        standaloneVideo: '🎬 Standalone Video',
        addRepoFirst: '➕ Add Repo First',
        btnVideoSettings: '⚙️ Video Settings',

        // Repo home
        repoSelectCategory: 'Select a category or create a new video:',
        createNewVideo: '🆕 Create New Video',

        // Status labels
        statusDrafts: '📝 Drafts',
        statusQueued: '📋 Queued',
        statusGenerating: '⏳ Generating',
        statusCompleted: '✅ Completed',
        statusApproved: '👍 Approved',
        statusScheduled: '📅 Scheduled',
        statusPublished: '📢 Published',
        statusFailed: '❌ Failed',

        noVideos: 'No videos in this category.',

        // Detail
        untitled: 'Untitled Video',
        status: 'Status:',
        scenes: 'Scenes:',
        words: 'Words:',
        created: 'Created:',
        captionsOn: 'Captions: On',
        captionsOff: 'Captions: Off',
        emotion: 'Emotion:',
        preparing: '⏳ Preparing for generation...',
        generatingByHeygen: '⏳ Video is being generated by HeyGen...',
        jobId: 'Job ID:',
        publishedSuccess: '✅ Published successfully.',
        approveGenerate: '✅ Approve & Generate',
        regenerateScript: '🔄 Regenerate Script',
        btnDelete: '🗑 Delete',
        btnPublish: '📢 Publish',
        btnWatch: '▶️ Watch',

        // Config
        configTitle: '🎬 <b>Video Configuration</b>',
        toneLabel: '🎤  Tone:',
        lengthLabel: '⏱  Length:',
        aspectLabel: '📐  Aspect:',
        emotionLabel: '😀  Emotion:',
        commitsLabel: '📊  Commits:',
        characterLabel: '👤  Character:',
        notSet: 'Not set',
        selected: 'Selected',
        sinceLastVideo: 'Since last video',
        noneStandalone: 'None (standalone)',
        latestOnly: 'Latest only',
        captions: 'Captions',
        overlay: 'Overlay',
        textOverlay: 'Text Overlay',
        character: 'Character',
        instructions: 'Instructions',
        savePreset: '💾 Save Preset',
        loadPreset: '📂 Load Preset',
        createVideo: '🎬 Create Video',
        tapToCycle: '<i>Tap a setting to cycle through options</i>',
        instructionsLabel: '📝 <b>Instructions:</b>',

        // Script preview
        scriptPreviewTitle: '🎬 <b>Script Preview: {title}</b>',
        sceneN: '<b>Scene {n}</b>',
        stats: '📊 <b>Stats:</b>',
        estimatedCost: '💰 <b>Estimated Cost:</b>',
        premiumCredits: 'premium credits',
        twitterCaption: '🐦 <b>Twitter:</b>',
        regenerate: '🔄 Regenerate',
        editConfig: '⚙️ Edit Config',
        retry: '🔄 Retry',
    },

    videoSettings: {
        // Home
        title: '🎬 <b>Video Settings</b>',
        characters: '👤 Characters:',
        configured: 'configured',
        voices: '🎙️ Voices: Configure per character',
        defaults: '⚙️ Defaults: Pre-populate new video configs',
        btnCharacters: '👤 Characters',
        btnDefaults: '⚙️ Defaults',
        btnHeygen: '🔑 HeyGen Account',
        btnInstagram: '📸 Instagram',

        // Character list
        charListTitle: '👤 <b>Characters</b>',
        noChars: 'No characters configured yet.\n\nAdd a character to start creating videos with Photo Avatars.',
        addCharacter: '➕ Add Character',
        looks: 'looks',
        look: 'look',

        // Character detail
        statusReady: 'Ready',
        statusTraining: 'Training...',
        statusFailed: 'Failed',
        statusLabel: '📊 Status:',
        voiceLabel: '🎙️ Voice:',
        emotionLabel: '😊 Emotion:',
        personalityLabel: '📝 Personality:',
        looksTitle: '🎭 <b>Looks',
        looksNone: '🎭 <b>Looks:</b> None yet',
        uploadPhotos: '<i>Upload photos to add looks.</i>',
        btnVoice: '🎙️ Voice',
        btnPersonality: '✏️ Personality',
        checkTraining: '⏳ Check Training...',
        syncLooks: '🔄 Sync Looks',
        reTrain: '🧠 Re-Train',
        trainAvatar: '🧠 Train Avatar',
        addLook: '➕ Add Look',
        removeCharacter: '🗑️ Remove Character',
        btnCharactersList: '◀️ Characters',

        // Remove character confirm
        removeCharTitle: '⚠️ <b>Remove Character?</b>',
        removeCharDesc: 'will be removed from your local configuration.',
        removeCharNote: 'Note: The avatar group on HeyGen will NOT be deleted. You can manage it in the HeyGen dashboard.',
        removeCharDrafts: 'Existing video drafts using this character will not be affected.',
        yesRemove: '🗑️ Yes, Remove',

        // Voice select
        voiceSelectTitle: '🎙️ <b>Select Voice for {name}</b>',
        currentVoice: 'Current:',
        showing: 'Showing',

        // Emotion select
        emotionSelectTitle: '😊 <b>Default Emotion for {name}</b>',
        emotionSelectDesc: 'Select the default emotion for video scenes:',

        // Defaults
        defaultsTitle: '⚙️ <b>Default Video Settings</b>',
        defaultsDesc: 'These values pre-populate new video configurations:',
        aspectRatio: '📐 Aspect Ratio:',
        maxLength: '⏱️ Max Length:',
        noLimit: 'No limit',
        characterDefault: '👤 Character:',
        none: 'None',
        background: '🎨 Background:',
        captionsLabel: '📝 Captions:',
        btnAspectRatio: '📐 Aspect Ratio',
        btnMaxLength: '⏱️ Max Length',
        btnCharacter: '👤 Character',
        btnBackground: '🎨 Background',

        // HeyGen
        heygenTitle: '🔑 <b>HeyGen Account</b>',
        apiKey: 'API Key:',
        configuredStatus: '✅ Configured',
        notConfigured: '❌ Not configured',
        creditCosts: '<b>Credit Costs:</b>',
        avatarIII: '• Avatar III: 1 credit per minute of video',
        avatarIV: '• Avatar IV: 6 credits per minute of video',
        photoAvatarTraining: '• Photo Avatar training: 4 credits per look',

        // Instagram
        instagramTitle: '📸 <b>Instagram Settings</b>',
        businessAccountId: 'Business Account ID:',
        accessToken: 'Access Token:',
        instagramEnabled: 'Instagram Reels publishing is enabled.',
        instagramDisabled: 'Configure your Instagram Business Account credentials to enable Reels publishing.',

        // Remove look
        removeLook: '🗑️ Remove',
    },

    notifications: {
        // Webhook notifications
        newPrMerged: 'PR #{number} Merged',
        commitsPushed: '{count} commit{plural} pushed',
        newEventTitle: '{emoji} <b>New {label}!</b>',
        repo: '<b>Repo:</b>',
        titleLabel: '<b>Title:</b>',
        generatedContent: '<b>Generated Content{threadInfo}:</b>',
        autoGeneratedReview: "I've auto-generated content for this. Review and approve?",
        btnApprove: '✅ Approve',
        btnView: '👀 View',
        btnEdit: '✏️ Edit',
        btnEditCompose: '✏️ Edit',
        btnDelete: '🗑 Delete',

        // Cron — scheduled draft notifications
        scheduledPostFailed: '⚠️ <b>Scheduled Post Failed</b>',
        draftReturnedToPending: 'The draft has been returned to pending status.',
        btnViewDrafts: '📝 View Drafts',
        scheduledPostPublished: '📤 <b>Scheduled Post Published!</b>',
        scheduledPostPartial: '⚠️ <b>Scheduled Post Partially Published</b>',
        publishedAt: '🕐 Published {time}',
        publishedTo: '<b>Published to:</b> {summary}',
        publishErrors: '<b>Failed:</b> {errors}',
        draftReturnedToApproved: 'The draft has been returned to approved status. You can retry publishing.',
        btnDashboard: '🏠 Dashboard',

        // Cron — video notifications
        videoReady: '✅ <b>Video Ready!</b>',
        videoReadyMsg: 'Your video has been generated successfully.',
        btnPublish: '📢 Publish',
        btnSchedule: '📅 Schedule',
        btnViewDetails: '🎬 View Details',
        videoGenerationFailed: '❌ Video generation failed: {error}',
        btnViewDraft: '🔄 View Draft',
        videoGenerationTimedOut: '❌ Video generation timed out after 30 minutes. Please try again.',
        scheduledVideoPublished: '📤 <b>Scheduled Video Published!</b>',
        scheduledVideoFailed: '⚠️ <b>Scheduled Video Publish Failed</b>',
        videoReturnedToCompleted: 'The video has been returned to completed status.',
        btnViewVideo: '📋 View',

        // Batch tweet notifications
        newTweetsDetected: '🔔 <b>New Tweets Detected</b>',
        tweetsTotal: 'tweets total',
        generated: '✅ Generated',
        generateFor: '⚡ Generate @{username}',
        openLink: '🔗 Open',
        btnFast: '⚡ Fast',
        btnEditRepost: '✏️ Edit',

        // Commit event notifications
        eventTitle: '{emoji} <b>{label}</b>',
        eventRepo: '<b>Repo:</b> <code>{repo}</code>',
        eventAuthor: '<b>Author:</b> {author}',
        eventStats: '{files} files · +{additions} / -{deletions}',
        eventCommitCount: '{count} commit(s)',
        prMergedLabel: 'PR #{number} Merged',
        pushLabel: '{count} commit{plural} pushed',
        btnFastCommit: '⚡ Fast',
        btnEditCommit: '✏️ Edit',
        btnGenerated: '✅ Generated',
    },

    actions: {
        // Account delete confirmation
        accountDeleted: '✅ <b>Account Deleted</b>',
        accountDeletedMsg: '@{username} has been removed along with all related data.',
        btnAccounts: '👤 Accounts',

        // Account bootstrap
        analyzingAccount: '🔄 <b>Analyzing @{username}...</b>',
        analyzingAccountDesc: 'Searching the web and building a persona profile. This may take a moment.',

        // Repo delete confirmation
        repoDeleted: '✅ <b>Repository Deleted</b>',
        repoDeletedMsg: '<code>{repo}</code> has been removed.',
        webhookRemoved: 'Webhook also removed from GitHub.',
        btnRepos: '📦 Repos',

        // Publish
        publishedToX: 'Published to X!\n\n{url}',
        publishedCount: 'Published {count} drafts:\n\n{results}',
        publishedDraft: '✅ PR #{number}: {url}',
        publishFailed: '❌ PR #{number}: Publishing failed',
        noApprovedDrafts: 'No approved drafts to publish.\n\nApprove some drafts first!',
        publishFailedGeneric: 'Failed to publish. Please try again.',

        // Unschedule
        scheduleCancelled: 'Schedule cancelled. Draft returned to pending status.',

        // Repost draft generated
        repostDraftGenerated: '✅ <b>Repost draft generated!</b>',
        repostDraftGeneratedMsg: 'From <b>@{username}</b>\n<i>{preview}...</i>\n\nYour draft is ready and waiting in Drafts > RePosts.',
        btnViewDraft: '👁 View Draft',

        // Repost generation failure
        generationFailed: '❌ <b>Generation failed</b>',
        generationFailedMsg: "Couldn't generate content. Please try again.",
        btnRetry: '🔄 Retry',

        // Repost follow prompt
        followPrompt: '💡 Want to follow <b>@{username}</b> for automatic repost notifications?',
        btnFollow: '👁 Follow',
        btnNoThanks: '👋 No thanks',
        nowFollowing: '✅ Now following <b>@{username}</b>!\n\nYou\'ll get batch notifications when they post new tweets.',
        followFailed: '❌ Failed to follow <b>@{username}</b>. They may already be in your accounts.',
        noFollowDismiss: '👋 Got it! You can always follow them later from the Accounts page.',

        // Generating image
        generatingImage: '🎨 Generating image...',

        // List actions — delete confirm
        listDeleteTitle: '🗑 <b>Delete draft?</b>',
        listDeleteWarn: '⚠️ This cannot be undone.',
        btnYesDelete: '✅ Yes, Delete',

        // Schedule day
        invalidDateFormat: '❌ Invalid date format.',
        scheduleForDate: '📅 <b>Schedule for {date}</b>',
        sendTimeHHMM: 'Send the time in <b>HH:MM</b> format (e.g. <code>14:30</code>)',
        orFullDateTime: 'Or send a full date and time: <code>YYYY-MM-DD HH:MM</code>',

        // Edit draft prompt
        editDraftTitle: '✏️ <b>Edit Draft</b>',
        editDraftDesc: 'What changes would you like to make?\n\nSend your changes as text — I\'ll update the draft content.',

        // Draft not found in tweet view
        draftNotFoundDeleted: '❌ Draft not found. It may have been deleted.',

        // Message cancellations
        characterCreateCancelled: 'Character creation cancelled.',
        lookCreateCancelled: 'Look creation cancelled.',
        videoComposeCancelled: 'Video instructions compose cancelled.',
    },

    schedule: {
        // Schedule day picker
        dayPickerTitle: '📅 <b>Schedule Draft</b>',
        selectDay: 'Select a day ({tz}):',
        orSendFullDateTime: 'Or send a full date and time: <code>YYYY-MM-DD HH:MM</code>',
        today: 'Today',
        tomorrow: 'Tomorrow',
        daySun: 'Sun',
        dayMon: 'Mon',
        dayTue: 'Tue',
        dayWed: 'Wed',
        dayThu: 'Thu',
        dayFri: 'Fri',
        daySat: 'Sat',

        // Schedule time input
        contextLost: '❌ Schedule context lost. Please try again from the draft.',
        invalidFormat: '❌ Invalid format.',
        sendTime: 'Send time: <code>HH:MM</code>',
        orFullDate: 'Or full date: <code>YYYY-MM-DD HH:MM</code>',
        sendFullDateTime: 'Send a full date and time: <code>YYYY-MM-DD HH:MM</code>',
        noDateSelected: '❌ No date selected.',
        invalidTime: '❌ Invalid time. Hours must be 0-23, minutes 0-59.',
        timeExample: 'Example: <code>14:30</code>',
        invalidDateTimeCombination: '❌ Invalid date/time combination. Please try again.',
        timeInPast: '❌ That time is in the past.',
        provideFutureTime: 'Please provide a future time.',
        formatHHMM: 'Format: <code>HH:MM</code>',
        failedToSchedule: '❌ Failed to schedule draft. Please try again.',
        invalidDatetimeFormat: '❌ Invalid datetime format.',
        useFormat: 'Please use: <code>YYYY-MM-DD HH:MM</code>',
        dateExample: 'Example: <code>2026-02-10 14:00</code>',
        provideFutureDatetime: 'Please provide a future datetime.',
        formatFull: 'Format: <code>YYYY-MM-DD HH:MM</code>',
        provideBothShaAndDatetime: '❌ Please provide both commit SHA and datetime.',
        shaDatetimeFormat: 'Format: <code>SHA YYYY-MM-DD HH:MM</code>',
        shaDatetimeExample: 'Example: <code>abc1234 2024-01-15 14:00</code>',
        scheduledPost: '📅 Scheduled post for {source}\n\nWill publish on {time}',
        scheduleFailed: '❌ <b>Schedule failed</b>',
        scheduleFailedMsg: "Couldn't process <code>{sha}</code>. Send another SHA + datetime to try again.",
    },

    apiKeys: {
        // Settings keys
        updateGeminiTitle: '🔑 <b>Update Gemini API Key</b>',
        updateGeminiDesc: 'Send your new Gemini API key.\n\nGet one free at:',
        geminiLink: '📖 Get key',

        updateXTitle: '🔑 <b>Update X/Twitter Keys</b>',
        updateXDesc: 'Send all 4 values in this exact format (one per line):',
        xDevPortal: '📖 Developer portal',

        updateGithubTitle: '🔑 <b>Update GitHub Token</b>',
        updateGithubDesc: 'Send your new GitHub personal access token.',
        githubCreateToken: '📖 Create token',

        updateInstagramTitle: '📸 <b>Update Instagram Credentials</b>',
        updateInstagramDesc: 'Send your credentials in this format (one per line):',
        instagramDevPortal: '📖 Meta developers',
    },

    addAccount: {
        // Add twitter account input
        invalidUsername: '❌ <b>Invalid username</b>',
        invalidUsernameMsg: '"{username}" doesn\'t look like a valid Twitter/X username.\n\nUsernames must be 1-15 characters, alphanumeric or underscore only.\n\nTry again:',
        alreadyFollowing: '❌ <b>Already following</b>',
        alreadyFollowingMsg: 'You\'re already following @{username}.',
        failedToAddAccount: '❌ Failed to add account. Please try again.',
    },

    settingsKeys: {
        geminiValidationFailed: '❌ Gemini key validation failed (status {status}). Please check and try again.',
        geminiValidationError: '❌ Could not validate Gemini key. Please try again.',
        xExpectedLines: '❌ Expected 4 lines (API_KEY, API_SECRET, ACCESS_TOKEN, ACCESS_SECRET), got {count}.',
        xValidationFailed: '❌ X credential validation failed: {error}',
        githubValidationFailed: '❌ GitHub token validation failed (status {status}). Please check and try again.',
        githubValidationError: '❌ Could not validate GitHub token. Please try again.',
        instagramExpectedLines: '❌ Expected 2 lines (ACCESS_TOKEN, BUSINESS_ACCOUNT_ID), got {count}.',
        instagramValidationFailed: '❌ Instagram token validation failed (status {status}). Please check and try again.',
        instagramValidationError: '❌ Could not validate Instagram token. Please try again.',
    },

    editDraft: {
        noDraftSelected: 'No draft selected for editing.',
        editing: '✏️ <b>Editing draft...</b>',
        applying: 'Applying: "<i>{instruction}</i>"',
        updated: '✅ <b>Draft updated!</b>',
        applied: 'Applied: "<i>{instruction}</i>"',
        btnViewDraft: '👀 View Draft',
        editFailed: '❌ <b>Edit failed</b>',
        editFailedMsg: "Couldn't apply that change. Send another instruction to try again.",
    },

    overview: {
        invalidFormat: '❌ Invalid format.',
        usage: 'Usage: <code>/overview owner/repo</code>',
        notWatched: '❌ Repository <code>{repo}</code> is not in your watched repos.',
        addFirst: 'Add it first with /watch.',
        repoNotFound: '❌ Repository not found.',
        specifyRepo: '❌ Please specify a repository.',
        bootstrapping: '🔍 Bootstrapping overview for <code>{repo}</code>...',
        fetchingReadme: 'Fetching README and recent PRs...',
        bootstrapped: '✅ <b>Overview bootstrapped!</b>',
        summary: '📋 <b>Summary:</b>',
        techStack: '🛠 <b>Tech Stack:</b>',
        keyFeatures: '⭐ <b>Key Features:</b>',
        targetAudience: '👥 <b>Target Audience:</b>',
        brandVoice: '🎤 <b>Brand Voice:</b>',
        visualTheme: '🎨 <b>Visual Theme:</b>',
        contextUsed: 'This context will now be used when generating content for this repo.',
        bootstrapFailed: '❌ Failed to bootstrap overview for <code>{repo}</code>.',
        tryAgain: 'Please try again.',
    },

    addRepo: {
        invalidFormat: '❌ <b>Invalid Format</b>',
        invalidFormatMsg: 'Please use the format: <code>owner/repo</code>',
        btnTryAgain: '🔄 Try again',
        alreadyWatching: '⚠️ <b>Already Watching</b>',
        alreadyWatchingMsg: '<code>{repo}</code> is already in your list!',
        repoNotFoundTitle: '❌ <b>Repository Not Found</b>',
        repoNotFoundMsg: '<code>{repo}</code> does not exist or is not accessible.\n\nMake sure:\n• The repository exists\n• Your GitHub token has access to it',
        workerUrlNotConfigured: '⚠️ WORKER_URL not configured. Webhook not created.',
        webhookCreated: '✅ Webhook created successfully!',
        webhookFailed: '⚠️ Webhook creation failed. Auto-detection may not work.\nCheck that your GITHUB_TOKEN has admin:repo_hook scope.',
        repoAdded: '✅ <b>Repository Added!</b>',
        repoAddedMsg: '<code>{repo}</code> is now being watched.',
        bootstrapping: '🔍 Bootstrapping overview for <code>{repo}</code>...',
        overviewBootstrapped: '✅ Overview bootstrapped for <code>{repo}</code>!\n\nThis context will improve generated content quality.',
        btnViewRepo: '📂 View Repo',
        overviewFailed: '⚠️ Could not auto-generate overview for <code>{repo}</code>.\n\nYou can generate it manually with <code>/overview {repo}</code>',
        addFailed: 'Failed to add repository. Please try again.',
    },

    repostInput: {
        // Repost URL input
        invalidTweetUrl: '❌ <b>Invalid tweet URL</b>',
        invalidTweetUrlMsg: "Couldn't parse a tweet URL from that.",
        tweetNotFound: '❌ <b>Tweet not found</b>',
        tweetNotFoundMsg: "Couldn't fetch tweet <code>{tweetId}</code> from @{username}.\n\nThe tweet may be deleted, from a private account, or the URL may be incorrect.\n\nTry another URL:",
    },

    platforms: {
        // Platform names
        x: 'X',
        post: 'Instagram Post',
        story: 'Instagram Story',
        reel: 'Instagram Reel',

        // Toggle UI
        selectTargets: 'Select Publish Targets',
        currentTargets: 'Current targets',
        targets: 'Targets',
        btnPlatforms: 'Platforms',
        btnPublish: 'Publish',
        btnRepost: 'Repost',

        // Default platforms (settings)
        defaultPlatforms: 'Default Platforms',
        defaultPlatformsDesc: 'New drafts will use these platforms by default.',

        // Repost picker
        repostTitle: 'Repost to Additional Platforms',
        selectRepostTargets: 'Select platforms to publish to:',
        selected: 'Selected',

        // Errors
        noTargetSelected: 'Please select at least one platform.',
    },
};

export type StringsMap = typeof en;
