/**
 * Shared types for the Cloudflare Bot
 */

import type { RenderServiceBinding } from './services/render-contract';

// Environment bindings
export interface Env {
    DB: D1Database;
    IMAGES: R2Bucket;
    // Service binding to the render-worker (Satori/resvg image rendering kept out of this
    // Worker's bundle). See src/services/render-contract.ts and src/services/tweet-card.ts.
    RENDER: RenderServiceBinding;
    TELEGRAM_BOT_TOKEN: string;
    TELEGRAM_CHAT_ID: string;
    GITHUB_TOKEN: string;
    GITHUB_OWNER?: string;
    GITHUB_WEBHOOK_SECRET?: string;
    // X OAuth2 (PKCE) public client credentials
    X_OAUTH2_CLIENT_ID?: string;
    X_OAUTH2_REDIRECT_URI?: string;
    // Resolved per-request bearer access token, set by hydrateEnv
    X_OAUTH2_ACCESS_TOKEN?: string;
    // LinkedIn OAuth 2.0 (confidential client) app credentials — app-level Worker config,
    // NEVER per-user. The client secret is required because LinkedIn is a confidential client.
    LINKEDIN_CLIENT_ID?: string;
    LINKEDIN_CLIENT_SECRET?: string;
    LINKEDIN_REDIRECT_URI?: string;
    // Resolved per-request LinkedIn values, set by hydrateEnv (undefined when not connected)
    LINKEDIN_ACCESS_TOKEN?: string;
    LINKEDIN_PERSON_URN?: string;
    // Google API key for Gemini image generation
    GOOGLE_API_KEY: string;
    // Claude API key for Claude text generation
    CLAUDE_API_KEY?: string;
    // AI provider preference (gemini | claude)
    AI_PROVIDER?: string;
    // Security: Admin secret for protected endpoints
    ADMIN_SECRET?: string;
    // HeyGen API key for video generation
    HEYGEN_API_KEY?: string;
    // Instagram credentials
    INSTAGRAM_ACCESS_TOKEN?: string;
    INSTAGRAM_BUSINESS_ACCOUNT_ID?: string;
    // Instagram App Secret (used once for the short-lived -> long-lived token exchange)
    INSTAGRAM_APP_SECRET?: string;
    // ISO 8601 expiry of the stored long-lived Instagram token (plaintext, not a secret)
    INSTAGRAM_TOKEN_EXPIRES_AT?: string;
    // Multi-tenant: encryption key for user API keys (AES-256-GCM, 32 bytes base64)
    ENCRYPTION_KEY: string;
    // Multi-tenant: max registered users (default 50)
    MAX_USERS?: string;
    // Multi-tenant: preserved admin chat ID (set during env hydration)
    ADMIN_CHAT_ID?: string;
    // Worker URL for cron fan-out self-fetch
    WORKER_URL?: string;
    // Webapp URL (Cloudflare Pages) — enables "Open App" button and webapp-based editing
    WEBAPP_URL?: string;
}

// ==================== MULTI-TENANT USER ====================

// User status
export type UserStatus = 'onboarding' | 'active' | 'suspended';

// Onboarding step — flow order: welcome → x_keys → instagram → identity → gemini_key → github_token → complete
export type OnboardingStep = 'welcome' | 'x_keys' | 'instagram' | 'identity' | 'gemini_key' | 'github_token' | 'complete' | null;

// User record from D1 (merged with former chat_state)
export interface User {
    chat_id: string;
    username: string | null;
    display_name: string | null;
    status: UserStatus;
    onboarding_step: OnboardingStep;

    // Encrypted API keys
    gemini_key_enc: string | null;
    x_api_key_enc: string | null;
    x_api_secret_enc: string | null;
    x_access_token_enc: string | null;
    x_access_secret_enc: string | null;
    github_token_enc: string | null;
    heygen_api_key_enc: string | null;
    instagram_token_enc: string | null;
    instagram_account_id_enc: string | null;
    instagram_app_secret_enc: string | null;
    instagram_token_expires_at: string | null;
    claude_key_enc: string | null;
    // LinkedIn OAuth 2.0 (confidential client) user-context tokens + identity
    linkedin_oauth2_access_enc: string | null;
    linkedin_oauth2_refresh_enc: string | null;
    linkedin_oauth2_expires_at: string | null;
    linkedin_refresh_expires_at: string | null;
    linkedin_person_urn: string | null; // urn:li:person:{sub} (plaintext identifier, not a secret)

    // Feature flags
    has_gemini: number;
    has_x: number;
    has_github: number;
    has_heygen: number;
    has_instagram: number;
    has_claude: number;
    has_linkedin: number;

    // UI state (from former chat_state)
    message_id: number | null;
    onboarding_message_id: number | null;
    current_view: string;
    context: string | null;

    // Settings
    ai_provider: string; // 'gemini' | 'claude'
    language: string; // 'en' | 'he'
    timezone: string;
    page_size: number;
    video_settings: string | null;
    default_publish_targets: string; // JSON string of PublishTargets

    // GitHub username (for scoped commit search)
    github_username: string | null;

    // Own X profile data (for tweet card rendering)
    own_profile_image_url: string | null;
    own_username_x: string | null;
    own_display_name_x: string | null;

    // Rate limiting
    daily_generates: number;
    daily_reposts: number;
    last_reset_date: string | null;
    consecutive_failures: number;

    // Identity language notification tracking
    identity_lang_notified: string; // comma-separated lang codes, e.g. 'he' or 'en,he'

    // Identity analysis depth: number of tweets to analyze (100, 200, or 400)
    identity_tweet_count: number;

    // Timestamps
    created_at: string;
    last_active_at: string | null;
    updated_at: string;
}

// Draft status
// A draft whose X target is a video stays in 'publishing' (not a new status) while its
// tweet-creation is deferred to the every-minute cron processor (core/x-pending.ts) — the
// x_pending_posts row is the source of truth for that "X deferred" state.
export type DraftStatus = 'draft' | 'approved' | 'publishing' | 'published' | 'scheduled';

// Draft format
export type DraftFormat = 'single' | 'thread';

// Media item attached to a tweet
/**
 * Per-media platform targeting. Each flag decides whether THIS media item attaches to that
 * platform's post. Absent object / absent field ⇒ targeted (see isMediaTargeted in core/media-targets).
 * Keys mirror PublishTargets so a media item and the draft use the same platform names.
 */
export interface MediaTargets {
    x?: boolean;
    instagram_post?: boolean;
    instagram_story?: boolean;
    instagram_reel?: boolean;
    linkedin?: boolean;
}

export interface TweetMedia {
    key: string;       // R2 key
    type: 'photo' | 'video';
    width?: number;
    height?: number;
    /** Per-item platform targeting; absent ⇒ all platforms (back-compat). */
    targets?: MediaTargets;
}

// Tweet in a draft
export interface Tweet {
    text: string;
    index: number;
    media?: TweetMedia[];
}

// Draft content structure
export interface DraftContent {
    format: DraftFormat;
    tweets: Tweet[];
}

// Extended content response that includes overview patches
export interface ContentResponse {
    content: DraftContent;
    overviewUpdates: OverviewPatch | null;
}

// ==================== MULTI-PLATFORM PUBLISHING ====================

// Per-draft platform selection
export interface PublishTargets {
    x: boolean;
    instagram_post: boolean;
    instagram_story: boolean;
    instagram_reel: boolean;
    linkedin: boolean;
}

export const DEFAULT_PUBLISH_TARGETS: PublishTargets = {
    x: true,
    instagram_post: false,
    instagram_story: false,
    instagram_reel: false,
    linkedin: false,
};

// Per-platform publish results (stored on draft after publishing)
export interface PublishResults {
    x?: {
        tweet_ids: string[];
        url: string;
    };
    instagram_post?: {
        post_id: string;
        url: string;
    };
    instagram_story?: {
        post_id: string;
        url: null;
    };
    instagram_reel?: {
        post_id: string;
        url: string;
    };
    linkedin?: {
        post_urn: string;
        url: string;
    };
    errors?: Record<string, string>;
    /** Set when an Instagram failure was an auth error (expired/invalid token) — drives the "Reconnect Instagram" affordance */
    needsInstagramReconnect?: boolean;
    /** Set when an X failure requires (re)connecting the OAuth 2.0 token — drives the "Reconnect X" affordance */
    needsXReconnect?: boolean;
    /** Set when a LinkedIn failure was an auth error (expired/invalid/missing token) — drives the "Reconnect LinkedIn" affordance */
    needsLinkedInReconnect?: boolean;
    /**
     * Set while an X VIDEO post has been deferred to the every-minute cron processor
     * (core/x-pending.ts): media is uploaded inline, the postThread/postQuoteTweet step retries
     * until the media is attachable. `results.x` and `results.errors.x` are both absent until the
     * processor resolves it; the draft sits in 'publishing'. Cleared once X succeeds or gives up.
     */
    x_pending?: boolean;
}

/**
 * Durable publish progress — already-completed uploads for an in-flight publish, keyed by platform.
 * The publish-job processor (core/publish-jobs.ts) persists this between cron chunks so a resumable
 * publishDraft skips uploads it has already done (no re-upload, no double-post). Media is keyed by
 * tweet index + media index so a partially-uploaded thread resumes mid-thread. JSON-serializable
 * (stored as publish_jobs.progress). Empty/absent means "nothing uploaded yet".
 */
export interface PublishProgress {
    x?: {
        /** Per-tweet media id arrays (handwritten drafts). null = no media / not yet uploaded for that tweet. */
        perTweetMediaIds?: (string[] | null)[];
        /** Single draft-level media id (legacy auto-generated drafts). */
        mediaId?: string;
    };
    instagram_post?: {
        /** Per-image media/container ids in carousel order. null = slot not yet uploaded. */
        mediaIds?: (string | null)[];
    };
    instagram_story?: {
        mediaId?: string;
    };
    instagram_reel?: {
        mediaId?: string;
    };
    linkedin?: {
        /** Uploaded asset/image URNs in order. null = slot not yet uploaded. */
        assetUrns?: (string | null)[];
    };
    /**
     * Platforms that have already POSTED in an earlier chunk. Carried across chunks so a resumed
     * publishDraft does NOT re-post a platform that succeeded while another platform's uploads spilled
     * into a later chunk (e.g. X posts in chunk 1, LinkedIn video upload finishes in chunk 2). Only
     * success keys are stored (x / x_pending / instagram_* / linkedin); errors are not, so a failed
     * platform retries cleanly on resume. The final chunk merges these into the published record.
     */
    posted?: PublishResults;
}

// ==================== MEDIA PRE-WARM ====================

/**
 * Platforms a media item can be pre-warmed (uploaded ahead of publish) for. Mirrors the per-media
 * targeting keys (MediaTargets / PublishTargets) so a warm row's platform matches the draft's targeting
 * exactly. Each maps to a distinct upload encoding: X media_id, Instagram container id (caption-coupled),
 * LinkedIn asset URN. See data/media-uploads-db.ts and core/media-prewarm.ts.
 */
export type MediaWarmPlatform = 'x' | 'instagram_post' | 'instagram_story' | 'instagram_reel' | 'linkedin';

/**
 * Lifecycle of a media_uploads warm row: 'pending' (queued) → 'processing' (leased by a warm tick) →
 * 'ready' (handle uploaded, usable by publishDraft) → 'failed' (attempts exhausted) / 'expired'
 * (handle past its validity window). 'ready' is the only state publish seeds progress from.
 */
export type MediaUploadStatus = 'pending' | 'processing' | 'ready' | 'failed' | 'expired';

// Draft record from D1
export interface Draft {
    id: string;
    chat_id: string; // Owner's Telegram chat ID
    pr_number: number;
    pr_title: string;
    commit_sha: string;
    source: string; // 'auto' | 'handwrite' | 'repost' | 'commit'
    status: DraftStatus;
    content: string; // JSON string of DraftContent
    image_url: string | null;
    scheduled_at: string | null;
    original_tweet_id: string | null; // For repost drafts: the quoted tweet ID
    original_tweet_url: string | null; // For repost drafts: URL to original tweet
    publish_targets: string; // JSON string of PublishTargets
    publish_results: string; // JSON string of PublishResults
    has_video: number; // 0 or 1
    event_id: string | null; // FK to commit_events.id (for commit/PR drafts)
    created_at: string;
    updated_at: string;
}

// Chat state for conversation tracking (now stored in users table)
export interface ChatState {
    chat_id: string;
    message_id: number | null;
    current_view: string;
    context: string | null; // JSON for pagination, selected draft, etc.
    timezone: string; // UTC offset, e.g. 'UTC', 'UTC+2', 'UTC-5:30'
    updated_at: string;
}

// Published post record (simplified — per-platform results are in draft.publish_results)
export interface Published {
    id: string;
    chat_id: string; // Owner's Telegram chat ID
    draft_id: string;
    pr_number: number;
    tweet_ids: string | null;
    tweet_url: string | null;
    image_url: string | null;
    instagram_post_id: string | null;
    instagram_url: string | null;
    published_at: string;
}

// ==================== REPO WATCHING ====================

// Repo configuration for content generation
export interface RepoConfig {
    watchPRs: boolean;
    watchPushes: boolean;
    branches: string[];
    platform: 'x';

    // Thread settings
    minCommitsForThread: number;
    maxTweets: number;
}

// Watched repo record from D1
export interface WatchedRepo {
    id: string;
    chat_id: string; // Owner's Telegram chat ID
    owner: string;
    repo: string;
    is_watching: number; // 0 or 1
    config: string; // JSON string of RepoConfig
    webhook_id: string | null;
    webhook_secret: string | null;
    created_at: string;
    updated_at: string;
}

// Default config for new repos
export const DEFAULT_REPO_CONFIG: RepoConfig = {
    watchPRs: true,
    watchPushes: false,
    branches: ['main'],
    platform: 'x',
    minCommitsForThread: 3,
    maxTweets: 10,
};

// ==================== REPO OVERVIEW ====================

// Persistent repo context for content generation
export interface RepoOverview {
    id: string;
    repo_id: string;
    summary: string | null;
    tech_stack: string | null;
    key_features: string[];  // Stored as JSON in D1
    target_audience: string | null;
    brand_voice: string | null;
    visual_theme: string | null;
    recent_changes: string[];  // Stored as JSON in D1, max 20 items FIFO
    version: number;
    created_at: string;
    updated_at: string;
}

// Field-level patch for overview auto-updates from Gemini
// null = no change, string = replace scalar, { add, remove } = modify array
export interface OverviewPatch {
    summary?: string | null;
    tech_stack?: string | null;
    key_features?: { add: string[]; remove: string[] } | null;
    target_audience?: string | null;
    brand_voice?: string | null;
    visual_theme?: string | null;
    recent_changes?: { add: string[]; remove: string[] } | null;
}

// ==================== VIDEO STUDIO ====================

// Video draft status
export type VideoDraftStatus = 'draft' | 'generating' | 'queued' | 'completed' | 'approved' | 'scheduled' | 'published' | 'failed';

// Valid HeyGen voice emotions
export type HeyGenEmotion = 'Excited' | 'Friendly' | 'Serious' | 'Soothing' | 'Broadcaster';

// Video configuration for a single video generation
export interface VideoConfig {
    commitDepth: number | 'since_last_video' | 'custom';
    tone: string;
    length: string; // '30s' | '60s' | '90s' | '2m' | '3m' | '5m'
    characterId?: string;
    lookId?: string;
    talkingPhotoId?: string;
    imageKey?: string;
    voiceId?: string;
    aspectRatio: '9:16' | '16:9' | '1:1';
    emotion: HeyGenEmotion;
    background: { type: 'default' } | { type: 'color'; value: string } | { type: 'image'; url: string };
    captions: boolean;
    textOverlay: boolean;
    manualInstructions?: string;
}

// Default video config
export const DEFAULT_VIDEO_CONFIG: VideoConfig = {
    commitDepth: 3,
    tone: 'Casual Update',
    length: '60s',
    aspectRatio: '9:16',
    emotion: 'Friendly',
    background: { type: 'default' },
    captions: true,
    textOverlay: false,
};

// Video scene from Gemini script generation
export interface VideoScene {
    scriptText: string;
    emotion: HeyGenEmotion;
    motionPrompt: string;
    textOverlay?: string;
}

// Gemini video script response
export interface VideoScriptResponse {
    title: string;
    scenes: VideoScene[];
    caption: string;        // Instagram caption (max 2200 chars)
    twitterCaption: string;
    totalWordCount: number;
}

// Video draft record from D1
export interface VideoDraft {
    id: string;
    chat_id: string;
    repo_id: string | null;
    status: VideoDraftStatus;
    script: string | null;     // JSON string of VideoScriptResponse
    caption: string | null;
    twitter_caption: string | null;
    title: string | null;
    config: string | null;     // JSON string of VideoConfig
    heygen_video_id: string | null;
    video_url: string | null;  // R2 key
    reference_sha: string | null;
    scheduled_at: string | null;
    created_at: string;
    updated_at: string;
}

// Video published record from D1
export interface VideoPublished {
    id: string;
    chat_id: string;
    video_draft_id: string;
    repo_id: string | null;
    twitter_url: string | null;
    instagram_url: string | null;
    caption: string | null;
    published_at: string;
}

// Video preset record from D1
export interface VideoPreset {
    id: string;
    chat_id: string;
    name: string;
    config: string; // JSON string of VideoConfig
    created_at: string;
}

// HeyGen job status response
export interface HeyGenJobStatus {
    video_id: string;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    video_url?: string;
    error?: string;
}

// HeyGen webhook callback payload
export interface HeyGenWebhookPayload {
    event_type: 'avatar_video.success' | 'avatar_video.fail';
    event_data: {
        video_id: string;
        url?: string;
        error?: string;
        callback_id?: string;
    };
}

// HeyGen character (stored in chat settings JSON)
export interface HeyGenCharacter {
    heygenGroupId: string;
    name: string;
    personality?: string;
    defaultTalkingPhotoId?: string;
    voiceId?: string;
    defaultEmotion: HeyGenEmotion;
    status: 'ready' | 'training' | 'failed';
    looks: HeyGenLook[];
    createdAt: string;
}

// HeyGen look (talking photo variant)
export interface HeyGenLook {
    talkingPhotoId: string;
    imageKey: string;
    name: string;
}

// Video settings (persisted per-chat as JSON in users.video_settings)
export interface VideoSettings {
    characters: HeyGenCharacter[];
    defaults: {
        aspectRatio?: string;
        maxLength?: string;
        defaultCharacterId?: string;
        defaultBackground?: string;
        defaultCaptions?: boolean;
    };
}

export const DEFAULT_VIDEO_SETTINGS: VideoSettings = {
    characters: [],
    defaults: {},
};

// ==================== TWITTER REPOST SYSTEM ====================

// Twitter account configuration
export interface TwitterAccountConfig {
    relevanceThreshold: number; // 1-10
    autoApprove: boolean;
    analyzeMedia: boolean;
}

export const DEFAULT_TWITTER_ACCOUNT_CONFIG: TwitterAccountConfig = {
    relevanceThreshold: 6,
    autoApprove: false,
    analyzeMedia: true,
};

// Followed Twitter account record from D1
export interface TwitterAccount {
    id: string;
    chat_id: string;
    username: string;
    user_id: string | null;
    display_name: string | null;
    is_watching: number; // 0 or 1
    last_tweet_id: string | null;
    config: string; // JSON string of TwitterAccountConfig
    thread_buffer: string | null; // JSON for incomplete thread tracking
    profile_image_url: string | null;
    next_poll_at: string | null; // ISO 8601 timestamp for backoff scheduling
    consecutive_empty_polls: number; // count of consecutive polls with no new tweets
    created_at: string;
    updated_at: string;
}

// AI-generated persona overview for a Twitter account
export interface TwitterAccountOverview {
    id: string;
    account_id: string;
    persona: string | null;
    topics: string | null; // JSON array
    communication_style: string | null;
    notable_context: string | null;
    recent_themes: string | null; // JSON array
    version: number;
    created_at: string;
    updated_at: string;
}

// Persona cache for non-followed accounts
export interface PersonaCache {
    id: string;
    username: string; // UNIQUE
    user_id: string | null;
    display_name: string | null;
    bio: string | null;
    persona: string | null;
    topics: string | null; // JSON array
    profile_image_url: string | null;
    created_at: string;
    updated_at: string;
}

// Tweet record from D1
export type TwitterTweetStatus = 'pending' | 'buffered' | 'scored' | 'drafted' | 'skipped';

export interface TwitterTweet {
    id: string; // Tweet ID from X
    account_id: string;
    chat_id: string;
    conversation_id: string | null;
    thread_position: number;
    is_thread: number; // 0 or 1
    text: string;
    author_username: string;
    metrics: string | null; // JSON
    tweet_url: string | null;
    tweeted_at: string | null;
    relevance_score: number | null;
    relevance_reason: string | null;
    status: TwitterTweetStatus;
    draft_id: string | null;
    batch_message_id: number | null;
    media_url: string | null;
    author_profile_image_url: string | null;
    author_display_name: string | null;
    created_at: string;
}

// Thread buffer entry tracked per conversation_id
export interface ThreadBufferEntry {
    tweet_ids: string[];
    stale_polls: number;
}

// ==================== GITHUB WEBHOOKS ====================

// GitHub webhook pull request event
export interface GitHubPullRequestEvent {
    action: string;
    pull_request: {
        number: number;
        title: string;
        body: string | null;
        merged: boolean;
        merged_at: string | null;
        base: { ref: string };
        head: { sha: string };
        user: { login: string };
        additions: number;
        deletions: number;
        changed_files: number;
    };
    repository: {
        full_name: string;
        owner: { login: string };
        name: string;
    };
}

// GitHub webhook push event
export interface GitHubPushEvent {
    ref: string;
    commits: Array<{
        id: string;
        message: string;
        author: { name: string; username?: string };
        added: string[];
        modified: string[];
        removed: string[];
    }>;
    head_commit: {
        id: string;
        message: string;
        timestamp: string;
        author: { name: string; username?: string };
    } | null;
    repository: {
        full_name: string;
        owner: { login: string };
        name: string;
    };
    pusher: { name: string };
}

// ==================== PR & COMMIT DATA ====================

// PR data from GitHub
export interface PRData {
    number: number;
    title: string;
    body: string;
    commits: string[];
    commitMessages: string[];
    fileNames: string[];
    files_changed: number;
    additions: number;
    deletions: number;
    merged_at: string;
    author: string;
}

// Direct commit data (fallback when no PR)
export interface CommitData {
    sha: string;
    title: string;
    body: string;
    commitMessages: string[];
    fileNames: string[];
    files_changed: number;
    additions: number;
    deletions: number;
    author: string;
    date: string;
}

// Union type for content generation source
export type ContentSource =
    | { type: 'pr'; data: PRData; repo?: string }
    | { type: 'commit'; data: CommitData; repo?: string };

// ==================== TELEGRAM ====================

// Telegram inline button
export interface InlineButton {
    text: string;
    callback_data?: string;
    url?: string;
    web_app?: { url: string };
    style?: 'primary' | 'success' | 'danger';
}

// View render result
export interface ViewResult {
    text: string;
    keyboard: InlineButton[][];
    disableLinkPreview?: boolean;
    toast?: string;
}

// Telegram message
export interface TelegramMessage {
    message_id: number;
    chat: { id: number };
    text?: string;
    caption?: string;
    photo?: Array<{ file_id: string; file_size?: number; width?: number; height?: number }>;
    document?: { file_id: string; file_name?: string; mime_type?: string; file_size?: number };
    media_group_id?: string;
    from?: { id: number; first_name: string };
    web_app_data?: { data: string; button_text: string };
}

// Telegram callback query
export interface TelegramCallbackQuery {
    id: string;
    from: { id: number; first_name: string };
    message?: TelegramMessage;
    data?: string;
}

// Telegram update
export interface TelegramUpdate {
    update_id: number;
    message?: TelegramMessage;
    edited_message?: TelegramMessage;
    callback_query?: TelegramCallbackQuery;
}

// Context for stateful operations
export interface ChatContext {
    awaiting_input?: 'commit_sha' | 'schedule' | 'schedule_time' | 'delete' | 'add_repo' | 'add_account' | 'edit_draft' | 'handwrite' | 'timezone' | 'edit_overview' | 'video_preset_name' | 'edit_character' | 'repost_url' | 'update_key';
    /** When set on the commit_sha prompt, a pasted SHA is expanded to its full PR. */
    pr_mode?: boolean;
    key_service?: 'gemini' | 'x' | 'github' | 'instagram' | 'claude';
    compose?: ComposeState;
    videoCompose?: VideoComposeState;
    characterCreate?: CharacterCreateState;
    lookCreate?: LookCreateState;
    thumbCompose?: ThumbComposeState;
    imageCompose?: ImageComposeState;
    voiceSelect?: { groupId: string; voiceIds: string[] };
    selectedCharGroupId?: string;
    selected_account_id?: string;
    schedule_date?: string; // YYYY-MM-DD for day picker flow
    schedule_return_view?: string; // Origin view for schedule flow back-navigation
    page?: number;
    selected_draft_id?: string;
    selected_repo_id?: string;
    selected_video_draft_id?: string;
    draft_list_type?: string;
    draft_list_page?: number;
    overview_field?: string;
    video_config?: VideoConfig;
    album_message_ids?: number[];
}

// Video compose mode for manual instructions
export interface VideoComposeState {
    active: boolean;
    repoId?: string;
    instructions: string[];
    config?: VideoConfig;
}

// Character creation compose mode
export interface CharacterCreateState {
    active: boolean;
    step: 'awaiting_photos' | 'awaiting_name';
    assetIds: string[];
}

// Look creation compose mode
export interface LookCreateState {
    active: boolean;
    step: 'awaiting_photo' | 'awaiting_name';
    characterGroupId: string;
    imageKey?: string;
}

// Thumbnail compose mode
export interface ThumbComposeState {
    active: boolean;
    title?: string;
    color?: string;
    icons?: string;
    imageKey?: string;
    ratio: '16:9' | '9:16';
    statusMessageId: number;
}

// Thumbnail draft record from D1
export interface ThumbDraft {
    id: string;
    chat_id: string;
    title: string;
    color: string;
    icons: string;
    ratio: string;
    source_image_key: string | null;
    result_image_key: string | null;
    created_at: string;
    updated_at: string;
}

// A single prompt segment in image compose, keyed by the Telegram message it came from
export interface ImagePromptSegment {
    messageId: number;
    text: string;
}

// A single reference image in image compose, keyed by the Telegram message it came from
export interface ImageRef {
    messageId: number;
    key: string;
}

// Image create compose mode
export interface ImageComposeState {
    active: boolean;
    segments: ImagePromptSegment[];
    images: ImageRef[];
    statusMessageId: number;
    // Legacy single-slot fields — present only on in-flight sessions created before
    // multi-message support; normalized into segments/images on read.
    prompt?: string;
    imageKey?: string;
}

// Image draft record from D1
export interface ImageDraft {
    id: string;
    chat_id: string;
    prompt: string;
    source_image_key: string | null;
    source_image_keys: string | null; // JSON-encoded array of all reference image R2 keys
    result_image_key: string | null;
    created_at: string;
    updated_at: string;
}

// Compose mode types (unified for handwrite and repost)
export interface ComposeTweet {
    messageId: number;
    text: string;
    media?: TweetMedia[];
    mediaGroupId?: string;
}

export interface ComposeSourceTweet {
    tweetId: string;
    username: string;
    displayName?: string;
    text: string;
    threadText?: string;
    mediaUrl?: string;
    mediaUrls?: string[];
    isThread: boolean;
    metrics?: { likes: number; retweets: number; replies: number; quotes: number };
    tweetUrl: string;
    relevanceReason?: string | null;
}

export interface ComposeSourceCommit {
    type: 'pr' | 'commit';
    repo: string;            // "owner/repo"
    repoShort: string;       // "repo" (display)
    repoId?: string;         // DB repo ID for overview context
    title: string;           // PR title or commit message first line
    prNumber?: number;       // PR number if from PR
    commitSha: string;       // head commit SHA
    commitMessages: string[];
    fileNames: string[];
    filesChanged: number;
    additions: number;
    deletions: number;
    author: string;
}

export interface ComposeState {
    mode: 'handwrite' | 'repost' | 'commit';
    tweets: ComposeTweet[];
    imageGen: boolean;
    aiRefine: boolean;
    analyzeImages: boolean;
    statusMessageId: number;
    instruction?: string;
    instructionMessageId?: number;
    awaitingInstruction?: boolean;
    // Repost-specific (only when mode === 'repost')
    sourceTweet?: ComposeSourceTweet;
    sourceAccountId?: string;
    batchTweetId?: string;
    fetchThread?: boolean;
    // Commit-specific (only when mode === 'commit')
    sourceCommit?: ComposeSourceCommit;
    eventId?: string; // commit_events.id for draft linkage
    // Per-session language override for AI skills/prompts (not persisted to DB)
    langOverride?: 'en' | 'he';
}

