/**
 * Render contract — the single source of truth for the render-worker RPC interface.
 *
 * The content-bot mirrors these shapes in `cloudflare-bot/src/services/render-contract.ts`
 * (a separate Worker project with its own build), so keep the two in sync. The RPC call
 * site in the bot type-checks against its mirror; a signature drift would surface there.
 */

/** Bindings available to the render-worker. Only R2 is needed (fonts + emoji/avatar cache). */
export interface RenderEnv {
    IMAGES: R2Bucket;
}

export interface TweetCardData {
    displayName: string;
    username: string;
    text: string;
    profileImageUrl?: string | null;
    timestamp?: string;
}

export interface QuoteTweetCardData {
    commentText: string;
    commentDisplayName: string;
    commentUsername: string;
    commentProfileImageUrl?: string | null;
    originalText: string;
    originalDisplayName: string;
    originalUsername: string;
    originalProfileImageUrl?: string | null;
    originalVerifiedType?: string;
    timestamp?: string;
}
