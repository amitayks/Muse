/**
 * X (Twitter) Service - Read & write operations, OAuth 1.0a
 */

import type { Env, DraftContent } from '../types';
import { getValidXAccessToken } from '../data/user-keys';

const X_API_V2 = 'https://api.twitter.com/2';
// v2 media upload (command-based INIT/APPEND/FINALIZE/STATUS). The legacy v1.1 endpoint
// (upload.twitter.com/1.1/media/upload.json) was sunset 2025-06-09; media IDs minted there are
// rejected by POST /2/tweets with "Your media IDs are invalid", so all uploads use v2.
const X_MEDIA_UPLOAD = 'https://api.twitter.com/2/media/upload';

// ==================== X API Types (used by poller) ====================

export interface XUser {
    id: string;
    name: string;
    username: string;
    description?: string;
    profile_image_url?: string;
    public_metrics?: {
        followers_count: number;
        following_count: number;
        tweet_count: number;
    };
}

// User data from API includes.users expansion
export type XUserExpansion = XUser;

export interface XTweet {
    id: string;
    text: string;
    author_id?: string;
    conversation_id?: string;
    in_reply_to_user_id?: string;
    created_at?: string;
    referenced_tweets?: Array<{
        type: 'retweeted' | 'quoted' | 'replied_to';
        id: string;
    }>;
    attachments?: { media_keys?: string[] };
    public_metrics?: {
        retweet_count: number;
        reply_count: number;
        like_count: number;
        quote_count: number;
        impression_count: number;
    };
}

export interface XMedia {
    media_key: string;
    type: 'photo' | 'video' | 'animated_gif';
    url?: string;
    preview_image_url?: string;
}

/**
 * Get the first relevant media URL for a tweet.
 * For photos: returns the photo URL. For videos/gifs: returns the thumbnail.
 */
export function getMediaUrl(media: XMedia[] | undefined, tweet: XTweet): string | null {
    if (!media || !tweet.attachments?.media_keys?.length) return null;

    const tweetMediaKeys = tweet.attachments.media_keys;
    const tweetMedia = media.filter(m => tweetMediaKeys.includes(m.media_key));

    const photo = tweetMedia.find(m => m.type === 'photo');
    if (photo?.url) return photo.url;

    const videoOrGif = tweetMedia.find(m => m.type === 'video' || m.type === 'animated_gif');
    if (videoOrGif?.preview_image_url) return videoOrGif.preview_image_url;

    return null;
}

/**
 * Sentinel error: the user must (re)connect their X account via OAuth 2.0.
 * Thrown when no usable bearer token is available (none stored, or refresh failed).
 * Callers surface this as a "needs_x_reconnect" signal instead of a generic failure.
 */
export class XReconnectError extends Error {
    constructor(message = 'X account must be reconnected') {
        super(message);
        this.name = 'XReconnectError';
    }
}

/**
 * OAuth 2.0 bearer-authenticated fetch wrapper for all X API calls.
 *
 * Sets `Authorization: Bearer <env.X_OAUTH2_ACCESS_TOKEN>`. If no access token is
 * present on the hydrated env, throws XReconnectError. On a 401, attempts a single
 * refresh via getValidXAccessToken (rotation-aware, persists the new tokens), updates
 * env.X_OAUTH2_ACCESS_TOKEN, and retries the request once; if refresh yields no token,
 * throws XReconnectError.
 */
async function xFetch(env: Env, url: string, init: RequestInit = {}): Promise<Response> {
    if (!env.X_OAUTH2_ACCESS_TOKEN) {
        throw new XReconnectError();
    }

    const buildInit = (token: string): RequestInit => ({
        ...init,
        headers: {
            ...(init.headers as Record<string, string> | undefined),
            Authorization: `Bearer ${token}`,
        },
    });

    let response = await fetch(url, buildInit(env.X_OAUTH2_ACCESS_TOKEN));

    if (response.status === 401) {
        const refreshed = await getValidXAccessToken(env, env.TELEGRAM_CHAT_ID);
        if (!refreshed) {
            throw new XReconnectError();
        }
        env.X_OAUTH2_ACCESS_TOKEN = refreshed;
        response = await fetch(url, buildInit(refreshed));
    }

    return response;
}

/**
 * Generate HMAC-SHA1 signature using Web Crypto API
 */
async function hmacSha1(key: string, message: string): Promise<string> {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(key);
    const messageData = encoder.encode(message);

    const cryptoKey = await crypto.subtle.importKey(
        'raw',
        keyData,
        { name: 'HMAC', hash: 'SHA-1' },
        false,
        ['sign']
    );

    const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
    return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

/**
 * Percent encode for OAuth (RFC 3986)
 */
function percentEncode(str: string): string {
    return encodeURIComponent(str)
        .replace(/!/g, '%21')
        .replace(/\*/g, '%2A')
        .replace(/'/g, '%27')
        .replace(/\(/g, '%28')
        .replace(/\)/g, '%29');
}

/**
 * Generate OAuth 1.0a signature for X API requests
 */
export async function generateOAuthHeader(
    env: Env,
    method: string,
    url: string,
    bodyParams: Record<string, string> = {}
): Promise<string> {
    const oauthParams: Record<string, string> = {
        oauth_consumer_key: env.X_API_KEY,
        oauth_token: env.X_ACCESS_TOKEN,
        oauth_signature_method: 'HMAC-SHA1',
        oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
        oauth_nonce: crypto.randomUUID().replace(/-/g, ''),
        oauth_version: '1.0',
    };

    // Combine OAuth params with body params for signature
    const allParams = { ...oauthParams, ...bodyParams };
    const sortedKeys = Object.keys(allParams).sort();
    const paramString = sortedKeys
        .map((k) => `${percentEncode(k)}=${percentEncode(allParams[k])}`)
        .join('&');

    // Create signature base string
    const signatureBase = `${method.toUpperCase()}&${percentEncode(url)}&${percentEncode(paramString)}`;

    // Create signing key
    const signingKey = `${percentEncode(env.X_API_SECRET)}&${percentEncode(env.X_ACCESS_SECRET)}`;

    // Generate HMAC-SHA1 signature
    const signature = await hmacSha1(signingKey, signatureBase);
    oauthParams.oauth_signature = signature;

    // Build Authorization header
    const headerParts = Object.entries(oauthParams)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => `${percentEncode(k)}="${percentEncode(v)}"`)
        .join(', ');

    return `OAuth ${headerParts}`;
}

/**
 * Verify X API credentials by getting account info
 */
export async function verifyCredentials(env: Env): Promise<boolean> {
    const url = 'https://api.twitter.com/1.1/account/verify_credentials.json';
    const authHeader = await generateOAuthHeader(env, 'GET', url);

    const response = await fetch(url, {
        method: 'GET',
        headers: { Authorization: authHeader },
    });

    if (!response.ok) {
        const error = await response.text();
        console.error('X credential verification failed:', response.status, error);
        return false;
    }

    const data = await response.json() as { screen_name: string };
    console.log('X credentials valid for:', data.screen_name);
    return true;
}

/**
 * Post a single tweet
 */
export async function postTweet(
    env: Env,
    text: string,
    options: { replyToId?: string; mediaIds?: string[] } = {}
): Promise<string> {
    const body: Record<string, unknown> = { text };

    if (options.replyToId) {
        body.reply = { in_reply_to_tweet_id: options.replyToId };
    }

    if (options.mediaIds && options.mediaIds.length > 0) {
        body.media = { media_ids: options.mediaIds };
    }

    const url = `${X_API_V2}/tweets`;

    const response = await xFetch(env, url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    });

    if (!response.ok) {
        const error = await response.text();
        console.error('X postTweet failed:', response.status, error);
        throw new Error(`X API error ${response.status}: ${error}`);
    }

    const data = await response.json() as { data: { id: string } };
    console.log('Posted tweet:', data.data.id);
    return data.data.id;
}

/**
 * Post a thread (multiple tweets)
 * @param mediaId - Single media ID for first tweet (legacy auto-generated drafts)
 * @param perTweetMediaIds - Per-tweet media ID arrays (handwritten drafts). null entries = no media for that tweet.
 */
export async function postThread(
    env: Env,
    content: DraftContent,
    mediaId?: string,
    perTweetMediaIds?: (string[] | null)[]
): Promise<{ tweetIds: string[]; url: string }> {
    const tweetIds: string[] = [];
    let previousId: string | undefined;

    for (let i = 0; i < content.tweets.length; i++) {
        const tweet = content.tweets[i];

        // Add delay between tweets
        if (i > 0) {
            await new Promise((resolve) => setTimeout(resolve, 1000));
        }

        // Determine media for this tweet
        let mediaIds: string[] | undefined;
        if (perTweetMediaIds && perTweetMediaIds[i]) {
            mediaIds = perTweetMediaIds[i]!;
        } else if (i === 0 && mediaId) {
            mediaIds = [mediaId];
        }

        const tweetId = await postTweet(env, tweet.text, {
            replyToId: previousId,
            mediaIds,
        });

        tweetIds.push(tweetId);
        previousId = tweetId;

        console.log(`Posted tweet ${i + 1}/${content.tweets.length}:`, tweetId);
    }

    const url = `https://x.com/i/status/${tweetIds[0]}`;
    return { tweetIds, url };
}

/**
 * Upload media to X from URL
 */
export async function uploadMedia(env: Env, imageUrl: string): Promise<string> {
    // Download the image
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
        throw new Error('Failed to download image');
    }

    const imageBuffer = await imageResponse.arrayBuffer();
    return uploadMediaFromBuffer(env, imageBuffer);
}

/**
 * Upload media to X from ArrayBuffer (for R2 images)
 */
export async function uploadMediaFromBuffer(env: Env, imageBuffer: ArrayBuffer): Promise<string> {
    // v2 simple upload: multipart/form-data with the raw binary in the `media` field. v2 returns
    // the media id at `data.id` (not the v1.1 top-level `media_id_string`).
    const form = new FormData();
    form.append('media', new Blob([imageBuffer]), 'media');
    form.append('media_category', 'tweet_image');

    const response = await xFetch(env, X_MEDIA_UPLOAD, {
        method: 'POST',
        body: form,
    });

    if (!response.ok) {
        const error = await response.text();
        console.error('X Media Upload failed:', response.status, error);
        throw new Error(`X Media Upload error: ${error}`);
    }

    const data = await response.json() as { data?: { id: string; media_key?: string } };
    const mediaId = data.data?.id;
    if (!mediaId) {
        throw new Error(`X Media Upload returned no media id: ${JSON.stringify(data)}`);
    }
    // /2/tweets media.media_ids requires the bare numeric id (^[0-9]{1,19}$), not the media_key.
    console.log('Uploaded media:', mediaId, 'media_key:', data.data?.media_key ?? 'none');
    return mediaId;
}

/**
 * Upload a video to X via the chunked media upload flow (INIT → APPEND → FINALIZE → STATUS).
 * Reads the video object from R2 by key and returns the resulting `media_id`.
 * Throws on any step failure or a `failed` processing state so callers can record a
 * per-platform error. Shared by the Video Studio (`publishVideoToTwitter`) and the
 * per-tweet publish flow (`core/publish.ts`).
 */
export async function uploadVideoToX(env: Env, r2Key: string): Promise<string> {
    const obj = await env.IMAGES.get(r2Key);
    if (!obj) {
        throw new Error(`Video not found in R2: ${r2Key}`);
    }

    const videoData = await obj.arrayBuffer();
    const totalBytes = videoData.byteLength;

    // X's command-based `POST /2/media/upload` is the single-shot IMAGE endpoint (its schema rejects
    // `command`/`total_bytes` and only allows image media types). Chunked VIDEO uses the dedicated
    // path-based endpoints: POST .../initialize (JSON) → POST .../{id}/append (multipart) → POST
    // .../{id}/finalize → GET /2/media/upload?command=STATUS. All authenticate with the OAuth 2.0
    // user-context bearer (media.write scope) via xFetch.

    // Step 1: INITIALIZE — JSON body; returns the media id at data.id.
    const initUrl = `${X_MEDIA_UPLOAD}/initialize`;
    const initResponse = await xFetch(env, initUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            media_type: 'video/mp4',
            total_bytes: totalBytes,
            // 'tweet_video' is the correct category for an organic post. 'amplify_video' is for ads
            // and requires X Ads/Amplify partner permissions (it uploads but is not a valid organic
            // post media). Whether POST /2/tweets accepts the resulting media is then governed by the
            // posting account's video eligibility (Premium/verified/standing), not by the API code.
            media_category: 'tweet_video',
        }),
    });
    if (!initResponse.ok) {
        throw new Error(`X video INIT failed (${initResponse.status} ${initResponse.statusText}): ${await initResponse.text() || '<empty body>'}`);
    }
    const initResult = await initResponse.json() as { data?: { id: string; media_key?: string } };
    const mediaId = initResult.data?.id;
    const mediaKey = initResult.data?.media_key;
    if (!mediaId) {
        throw new Error(`X video INIT returned no media id: ${JSON.stringify(initResult)}`);
    }
    console.log(`X video INIT ok: media_id=${mediaId} media_key=${mediaKey ?? 'none'} total_bytes=${totalBytes}`);

    // Step 2: APPEND — POST .../{id}/append (media id is in the PATH). Multipart body with the raw
    // chunk in `media` and the `segment_index`. Raw `media` (not base64 `media_data`) keeps each
    // segment's byte count exact so they sum to total_bytes at finalize (and avoids base64 overhead).
    const appendUrl = `${X_MEDIA_UPLOAD}/${mediaId}/append`;
    // The v2 /append endpoint caps each chunk at ~1MB (a 5MB chunk — the old v1.1 size — returns
    // 413 Payload Too Large). segment_index allows 0–999, so 1MB chunks cover videos up to ~1GB;
    // ours are ≤50MB (≤50 segments).
    const chunkSize = 1024 * 1024;
    let segmentIndex = 0;
    for (let offset = 0; offset < totalBytes; offset += chunkSize) {
        const chunk = videoData.slice(offset, Math.min(offset + chunkSize, totalBytes));

        const appendForm = new FormData();
        appendForm.append('segment_index', String(segmentIndex));
        appendForm.append('media', new Blob([chunk]), 'chunk');

        const appendResponse = await xFetch(env, appendUrl, {
            method: 'POST',
            body: appendForm,
        });
        if (!appendResponse.ok) {
            const body = await appendResponse.text();
            const ct = appendResponse.headers.get('content-type') || '';
            throw new Error(`X video APPEND failed (${appendResponse.status} ${appendResponse.statusText}; ct=${ct}; url=${appendUrl}; seg=${segmentIndex}; chunkBytes=${chunk.byteLength}): ${body || '<empty body>'}`);
        }
        segmentIndex++;
    }

    // Step 3: FINALIZE — POST .../{id}/finalize, no body. Returns data.processing_info.
    const finalizeUrl = `${X_MEDIA_UPLOAD}/${mediaId}/finalize`;
    const finalizeResponse = await xFetch(env, finalizeUrl, {
        method: 'POST',
    });
    if (!finalizeResponse.ok) {
        throw new Error(`X video FINALIZE failed (${finalizeResponse.status} ${finalizeResponse.statusText}): ${await finalizeResponse.text() || '<empty body>'}`);
    }
    const finalResult = await finalizeResponse.json() as {
        data?: { id: string; processing_info?: { state: string; check_after_secs?: number; error?: { message: string } } };
    };
    const finalizeProcessing = finalResult.data?.processing_info;
    console.log(`X video FINALIZE ok: state=${finalizeProcessing?.state ?? 'none'} check_after=${finalizeProcessing?.check_after_secs ?? '-'}`);

    // Step 4: poll STATUS until processing reports `succeeded`. Attaching a still-processing video
    // to POST /2/tweets fails with "Your media IDs are invalid", so unless FINALIZE already reported
    // `succeeded` we MUST poll (even when FINALIZE returns no processing_info — we do not assume
    // "missing => ready"). Status uses the base endpoint with command=STATUS (GET → params signed).
    let state = finalizeProcessing?.state ?? 'pending';
    let checkAfterSecs = finalizeProcessing?.check_after_secs ?? 1;
    let checkCount = 0;
    const maxChecks = 30;

    while (state !== 'succeeded' && checkCount < maxChecks) {
        if (state === 'failed') {
            throw new Error(`X video processing failed: ${finalizeProcessing?.error?.message || 'unknown'}`);
        }
        await new Promise(r => setTimeout(r, Math.min(Math.max(checkAfterSecs, 1) * 1000, 15000)));

        const statusQueryParams = { command: 'STATUS', media_id: mediaId };
        const statusResponse = await xFetch(env, `${X_MEDIA_UPLOAD}?${new URLSearchParams(statusQueryParams)}`, {
            method: 'GET',
        });
        if (!statusResponse.ok) {
            throw new Error(`X video STATUS failed (${statusResponse.status} ${statusResponse.statusText}): ${await statusResponse.text() || '<empty body>'}`);
        }
        const statusResult = await statusResponse.json() as {
            data?: { processing_info?: { state: string; check_after_secs?: number; error?: { message: string } } };
        };
        const statusProcessing = statusResult.data?.processing_info;
        if (!statusProcessing) {
            // STATUS reports no processing info → media is finished and ready to attach.
            state = 'succeeded';
            break;
        }
        state = statusProcessing.state;
        checkAfterSecs = statusProcessing.check_after_secs || 5;
        if (state === 'failed') {
            throw new Error(`X video processing failed: ${statusProcessing.error?.message || 'unknown'}`);
        }
        checkCount++;
    }

    if (state !== 'succeeded') {
        throw new Error('X video processing timed out');
    }

    // NOTE: X media needs ~10–60s after `succeeded` before it is attachable to POST /2/tweets
    // (images are instant). We cannot wait inline here — the publish runs in a Cloudflare
    // `waitUntil` task whose ~30s budget is already mostly consumed by the upload+processing poll,
    // and a longer sleep gets the whole task cancelled. A proper delayed post needs decoupling
    // (Durable Object alarm / Queue / cron retry). See the add-x-oauth2-media design notes.

    // /2/tweets media.media_ids requires the bare numeric id (^[0-9]{1,19}$) — the media_key
    // ("7_<id>") fails that regex. Return the id.
    console.log('Uploaded video to X:', mediaId, 'media_key:', mediaKey ?? 'none', 'final state:', state);
    return mediaId;
}

/**
 * Delete a tweet
 */
export async function deleteTweet(env: Env, tweetId: string): Promise<void> {
    const url = `${X_API_V2}/tweets/${tweetId}`;

    const response = await xFetch(env, url, {
        method: 'DELETE',
    });

    // 404 means already deleted - that's ok
    if (!response.ok && response.status !== 404) {
        const error = await response.text();
        throw new Error(`X delete error: ${error}`);
    }

    console.log('Deleted tweet:', tweetId);
}

/**
 * Post a quote tweet (repost)
 */
export async function postQuoteTweet(
    env: Env,
    text: string,
    quoteTweetId: string,
    options: { mediaIds?: string[]; originalTweetUrl?: string } = {}
): Promise<string> {
    const body: Record<string, unknown> = {
        text,
        quote_tweet_id: quoteTweetId,
    };

    if (options.mediaIds && options.mediaIds.length > 0) {
        body.media = { media_ids: options.mediaIds };
    }

    const url = `${X_API_V2}/tweets`;

    const response = await xFetch(env, url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    });

    if (!response.ok) {
        const error = await response.text();

        // Fallback: on 403 (quote not allowed), retry as regular tweet with URL appended
        if (response.status === 403 && options.originalTweetUrl) {
            console.log('Quote tweet 403, falling back to URL embed:', options.originalTweetUrl);
            const fallbackText = `${options.originalTweetUrl}\n${text}`;
            return postTweetWithUrl(env, fallbackText, options.mediaIds);
        }

        console.error('X postQuoteTweet failed:', response.status, error);
        throw new Error(`X API error ${response.status}: ${error}`);
    }

    const data = await response.json() as { data: { id: string } };
    console.log('Posted quote tweet:', data.data.id);
    return data.data.id;
}

async function postTweetWithUrl(
    env: Env,
    text: string,
    mediaIds?: string[],
): Promise<string> {
    const body: Record<string, unknown> = { text };
    if (mediaIds && mediaIds.length > 0) {
        body.media = { media_ids: mediaIds };
    }

    const url = `${X_API_V2}/tweets`;

    const response = await xFetch(env, url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    });

    if (!response.ok) {
        const error = await response.text();
        console.error('X postTweetWithUrl failed:', response.status, error);
        throw new Error(`X API error ${response.status}: ${error}`);
    }

    const data = await response.json() as { data: { id: string } };
    console.log('Posted fallback tweet with URL:', data.data.id);
    return data.data.id;
}

/**
 * Lookup a user by username
 * GET /2/users/by/username/:username
 */
export async function lookupUserByUsername(
    env: Env,
    username: string
): Promise<XUser | null> {
    const cleanUsername = username.replace(/^@/, '');
    const baseUrl = `${X_API_V2}/users/by/username/${cleanUsername}`;
    const queryParams: Record<string, string> = {
        'user.fields': 'id,name,username,description,profile_image_url,public_metrics',
    };

    const queryString = Object.entries(queryParams)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join('&');
    const fullUrl = `${baseUrl}?${queryString}`;

    const response = await xFetch(env, fullUrl, {
        method: 'GET',
    });

    if (!response.ok) {
        console.error(`X lookupUser failed for @${cleanUsername}:`, response.status);
        return null;
    }

    const data = await response.json() as { data?: XUser; errors?: unknown[] };
    if (data.errors || !data.data) {
        console.error(`[x] User @${cleanUsername} not found`);
        return null;
    }
    return data.data;
}

/**
 * Fetch a single tweet by ID with author expansions
 * Returns tweet data + expanded author profile + media
 */
export interface TweetMedia {
    media_key: string;
    type: 'photo' | 'video' | 'animated_gif';
    url?: string;
    preview_image_url?: string;
    alt_text?: string;
}

export interface TweetWithAuthor {
    tweet: {
        id: string;
        text: string;
        author_id?: string;
        conversation_id?: string;
        in_reply_to_user_id?: string;
        created_at?: string;
        referenced_tweets?: Array<{ type: string; id: string }>;
        attachments?: { media_keys?: string[] };
        public_metrics?: {
            retweet_count: number;
            reply_count: number;
            like_count: number;
            quote_count: number;
            impression_count?: number;
        };
    };
    author: {
        id: string;
        name: string;
        username: string;
        description?: string;
        profile_image_url?: string;
        verified_type?: 'blue' | 'business' | 'government' | 'none';
        public_metrics?: {
            followers_count: number;
            following_count: number;
            tweet_count: number;
        };
    } | null;
    media?: TweetMedia[];
}

export async function getTweetById(env: Env, tweetId: string): Promise<TweetWithAuthor | null> {
    const baseUrl = `${X_API_V2}/tweets/${tweetId}`;
    const queryParams: Record<string, string> = {
        'tweet.fields': 'text,author_id,conversation_id,in_reply_to_user_id,created_at,referenced_tweets,public_metrics,attachments',
        'expansions': 'author_id,attachments.media_keys',
        'user.fields': 'id,name,username,description,profile_image_url,public_metrics,verified_type',
        'media.fields': 'media_key,type,url,preview_image_url,alt_text',
    };

    const queryString = Object.entries(queryParams)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join('&');
    const fullUrl = `${baseUrl}?${queryString}`;

    const response = await xFetch(env, fullUrl, {
        method: 'GET',
    });

    if (!response.ok) {
        const errBody = await response.text();
        console.error(`[x] getTweetById failed for ${tweetId}: ${response.status} ${errBody.substring(0, 500)}`);
        if (response.status === 429) {
            throw new Error('rate_limit');
        }
        if (response.status === 402) {
            throw new Error('credits_depleted');
        }
        throw new Error(`x_api_${response.status}`);
    }

    const data = await response.json() as {
        data?: TweetWithAuthor['tweet'];
        includes?: { users?: TweetWithAuthor['author'][]; media?: TweetMedia[] };
        errors?: unknown[];
    };

    if (!data.data) return null;

    const author = data.includes?.users?.[0] || null;
    const media = data.includes?.media;

    return { tweet: data.data, author, media };
}

/**
 * Get tweet URL
 */
export function getTweetUrl(tweetId: string): string {
    return `https://x.com/i/status/${tweetId}`;
}

// ==================== Read Functions (from twitter-poller) ====================

/**
 * Get a user's recent tweets
 * GET /2/users/:id/tweets
 */
export async function getUserTweets(
    env: Env,
    userId: string,
    sinceId?: string,
    maxResults = 10,
    paginationToken?: string
): Promise<{ tweets: XTweet[]; newestId: string | null; media?: XMedia[]; users?: XUserExpansion[]; nextToken: string | null; referencedTweets: XTweet[] }> {
    const baseUrl = `${X_API_V2}/users/${userId}/tweets`;
    const queryParams: Record<string, string> = {
        'tweet.fields': 'id,text,author_id,conversation_id,in_reply_to_user_id,created_at,referenced_tweets,public_metrics,attachments',
        'expansions': 'author_id,attachments.media_keys,referenced_tweets.id,referenced_tweets.id.author_id',
        'user.fields': 'id,name,username,profile_image_url',
        'media.fields': 'media_key,type,url,preview_image_url',
        'max_results': String(Math.min(Math.max(maxResults, 5), 100)),
        'exclude': 'retweets',
    };

    if (sinceId) {
        queryParams.since_id = sinceId;
    }

    if (paginationToken) {
        queryParams.pagination_token = paginationToken;
    }

    const queryString = Object.entries(queryParams)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join('&');
    const fullUrl = `${baseUrl}?${queryString}`;

    const response = await xFetch(env, fullUrl, {
        method: 'GET',
    });

    if (!response.ok) {
        const error = await response.text();
        console.error(`[x] getUserTweets failed for user ${userId}:`, response.status, error);
        return { tweets: [], newestId: null, nextToken: null, referencedTweets: [] };
    }

    const data = await response.json() as {
        data?: XTweet[];
        includes?: { media?: XMedia[]; users?: XUserExpansion[]; tweets?: XTweet[] };
        meta?: { newest_id?: string; result_count?: number; next_token?: string };
    };

    const tweets = data.data || [];
    const newestId = data.meta?.newest_id || (tweets.length > 0 ? tweets[0].id : null);
    const media = data.includes?.media;
    const users = data.includes?.users;
    const nextToken = data.meta?.next_token ?? null;
    const referencedTweets = data.includes?.tweets ?? [];

    return { tweets, newestId, media, users, nextToken, referencedTweets };
}

/**
 * Search for tweets in a conversation (for full thread fetch)
 * GET /2/tweets/search/recent
 */
export async function searchConversation(
    env: Env,
    conversationId: string,
    username: string
): Promise<{ tweets: XTweet[]; media?: XMedia[] }> {
    const baseUrl = `${X_API_V2}/tweets/search/recent`;
    const queryParams: Record<string, string> = {
        'query': `conversation_id:${conversationId} from:${username}`,
        'tweet.fields': 'id,text,author_id,conversation_id,in_reply_to_user_id,created_at,referenced_tweets,public_metrics,attachments',
        'expansions': 'attachments.media_keys',
        'media.fields': 'media_key,type,url,preview_image_url',
        'max_results': '100',
    };

    const queryString = Object.entries(queryParams)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join('&');
    const fullUrl = `${baseUrl}?${queryString}`;

    const response = await xFetch(env, fullUrl, {
        method: 'GET',
    });

    if (!response.ok) {
        const error = await response.text();
        console.error(`[x] searchConversation failed for ${conversationId}:`, response.status, error);
        return { tweets: [] };
    }

    const data = await response.json() as { data?: XTweet[]; includes?: { media?: XMedia[] } };
    return { tweets: data.data || [], media: data.includes?.media };
}

// ==================== Identity: Fetch User's Own Tweets ====================

export type TweetKind = 'original' | 'quote' | 'reply';

export interface ClassifiedTweet {
    text: string;
    kind: TweetKind;
    created_at?: string;
    refText?: string;
    refAuthorUsername?: string;
    refAuthorName?: string;
}

/**
 * Get the authenticated user's Twitter user ID via /2/users/me
 */
async function getMyUserId(env: Env): Promise<string | null> {
    const profile = await getMyProfile(env);
    return profile?.id ?? null;
}

/**
 * Get the authenticated user's full profile from /2/users/me
 */
export async function getMyProfile(env: Env): Promise<XUser | null> {
    const baseUrl = `${X_API_V2}/users/me`;
    const queryParams: Record<string, string> = {
        'user.fields': 'id,name,username,description,profile_image_url,public_metrics',
    };

    const queryString = Object.entries(queryParams)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join('&');
    const fullUrl = `${baseUrl}?${queryString}`;

    const response = await xFetch(env, fullUrl, {
        method: 'GET',
    });

    if (!response.ok) {
        console.error('[x] getMyProfile failed:', response.status);
        return null;
    }

    const data = await response.json() as { data?: XUser };
    return data.data ?? null;
}

/**
 * Classify a tweet as original, quote, or reply based on referenced_tweets.
 */
function classifyTweet(tweet: XTweet): TweetKind {
    if (!tweet.referenced_tweets?.length) return 'original';
    if (tweet.referenced_tweets.some(r => r.type === 'quoted')) return 'quote';
    if (tweet.referenced_tweets.some(r => r.type === 'replied_to')) return 'reply';
    return 'original';
}

/**
 * Fetch the authenticated user's recent tweets for identity analysis.
 * Uses the user's OAuth credentials from the hydrated env.
 * Paginates across multiple pages (100 per page) up to `count` tweets,
 * with retweets excluded, classified by type, and reply/quote references
 * enriched with the referenced tweet's text and author.
 */
export async function fetchUserTweets(env: Env, count = 200): Promise<ClassifiedTweet[]> {
    const userId = await getMyUserId(env);
    if (!userId) {
        throw new Error('Could not resolve authenticated user ID');
    }

    const allTweets: XTweet[] = [];
    const allReferencedTweets: XTweet[] = [];
    const allUsers: XUserExpansion[] = [];

    const pageCap = Math.min(8, Math.ceil(count / 100) + 2);
    let token: string | undefined = undefined;

    for (let page = 0; page < pageCap; page++) {
        let result: Awaited<ReturnType<typeof getUserTweets>>;
        try {
            result = await getUserTweets(env, userId, undefined, 100, token);
        } catch (err) {
            console.error('[x] fetchUserTweets page failed, proceeding with collected tweets:', err);
            break;
        }

        allTweets.push(...result.tweets);
        allReferencedTweets.push(...result.referencedTweets);
        if (result.users) {
            allUsers.push(...result.users);
        }

        if (allTweets.length >= count) break;
        if (!result.nextToken) break;
        token = result.nextToken;
    }

    // Trim to at most `count` tweets.
    const tweets = allTweets.slice(0, count);

    // Build lookup maps across ALL collected pages.
    const refTweetById = new Map<string, XTweet>();
    for (const rt of allReferencedTweets) {
        refTweetById.set(rt.id, rt);
    }
    const userById = new Map<string, XUserExpansion>();
    for (const u of allUsers) {
        userById.set(u.id, u);
    }

    return tweets.map(t => {
        const kind = classifyTweet(t);
        const result: ClassifiedTweet = {
            text: t.text,
            kind,
            created_at: t.created_at,
        };

        let refId: string | undefined;
        if (kind === 'reply') {
            refId = t.referenced_tweets?.find(r => r.type === 'replied_to')?.id;
        } else if (kind === 'quote') {
            refId = t.referenced_tweets?.find(r => r.type === 'quoted')?.id;
        }

        if (refId) {
            const refTweet = refTweetById.get(refId);
            if (refTweet) {
                const collapsed = refTweet.text.trim().replace(/\s*\n\s*/g, ' ');
                result.refText = collapsed.length > 200
                    ? collapsed.slice(0, 200) + '…'
                    : collapsed;

                const refAuthor = refTweet.author_id ? userById.get(refTweet.author_id) : undefined;
                if (refAuthor) {
                    result.refAuthorUsername = refAuthor.username;
                    result.refAuthorName = refAuthor.name;
                }
            }
        }

        return result;
    });
}
