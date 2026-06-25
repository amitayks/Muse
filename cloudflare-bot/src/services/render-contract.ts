/**
 * Render contract (bot-side mirror).
 *
 * Mirrors `render-worker/src/contract.ts`. The render-worker is a separate Cloudflare
 * Worker with its own build, so its types can't be imported across the package boundary
 * without dragging satori/resvg into the bot's type graph. We therefore duplicate the
 * small data shapes here and describe the RPC surface as `RenderServiceBinding`.
 * KEEP IN SYNC with render-worker/src/contract.ts and render-worker/src/index.ts.
 */

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

/**
 * RPC surface of the render-worker's `RenderService` entrypoint, as seen through the
 * `RENDER` service binding. Each method runs in the render-worker and returns PNG bytes.
 */
export interface RenderServiceBinding {
    renderTweetCard(data: TweetCardData): Promise<Uint8Array>;
    renderThreadCards(tweets: TweetCardData[]): Promise<Uint8Array[]>;
    renderQuoteTweetCard(data: QuoteTweetCardData): Promise<Uint8Array>;
    createStoryImage(cardPng: Uint8Array): Promise<Uint8Array>;
}
