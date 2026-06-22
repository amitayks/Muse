/**
 * Instagram Publishing Service — Feed Posts, Carousels, and Stories
 *
 * Uses Meta Content Publishing API (Graph API v25.0).
 * Requires env.INSTAGRAM_ACCESS_TOKEN and env.INSTAGRAM_BUSINESS_ACCOUNT_ID
 * to be hydrated from per-user encrypted keys.
 */

import type { Env } from '../types';

const GRAPH_API = 'https://graph.instagram.com/v25.0';
const MAX_CAPTION_LENGTH = 2200;
const MAX_CAROUSEL_ITEMS = 10;

interface InstagramPublishResult {
    post_id: string;
    url: string | null;
}

/**
 * Structured Instagram publish failure. Carries the real Graph API reason so the
 * pipeline can show an actionable message (and a reconnect button for auth errors)
 * instead of a generic "publish failed".
 */
export class InstagramPublishError extends Error {
    readonly code?: number;
    readonly isAuthError: boolean;
    constructor(message: string, opts: { code?: number; isAuthError?: boolean } = {}) {
        super(message);
        this.name = 'InstagramPublishError';
        this.code = opts.code;
        this.isAuthError = opts.isAuthError ?? false;
    }
}

/** Auth-error classification: 190 = token expired/invalid; subcodes 463/467 = expired/invalid. */
export function isInstagramAuthError(code?: number, subcode?: number): boolean {
    return code === 190 || subcode === 463 || subcode === 467;
}

/** Parse a Graph API error body into a structured InstagramPublishError. */
export function parseGraphError(rawBody: string, fallback: string): InstagramPublishError {
    try {
        const body = JSON.parse(rawBody) as { error?: { message?: string; code?: number; error_subcode?: number } };
        const code = body.error?.code;
        const subcode = body.error?.error_subcode;
        return new InstagramPublishError(body.error?.message || fallback, { code, isAuthError: isInstagramAuthError(code, subcode) });
    } catch {
        return new InstagramPublishError(rawBody?.slice(0, 300) || fallback, {});
    }
}

/** Build an InstagramPublishError from a non-OK Response (reads its body once). */
async function igErrorFromResponse(response: Response, fallback: string): Promise<InstagramPublishError> {
    const text = await response.text().catch(() => '');
    console.error(`[ig-publish] ${fallback}:`, text);
    return parseGraphError(text, fallback);
}

/** Throw an auth-flagged error if Instagram credentials are not hydrated. */
function requireInstagramConfig(env: Env): void {
    if (!env.INSTAGRAM_ACCESS_TOKEN || !env.INSTAGRAM_BUSINESS_ACCOUNT_ID) {
        throw new InstagramPublishError('Instagram is not configured', { isAuthError: true });
    }
}

/** Poll a container to completion; throw if it fails or times out. */
async function ensureProcessed(env: Env, containerId: string): Promise<void> {
    const ready = await pollContainerStatus(env, containerId);
    if (!ready) throw new InstagramPublishError('Instagram media processing failed or timed out');
}

// ==================== Single Image Post ====================

/**
 * Publish a single image post to Instagram.
 * imageUrl must be publicly accessible (e.g. via WORKER_URL/media/).
 */
export async function publishToInstagramPost(
    env: Env,
    imageUrl: string,
    caption: string
): Promise<InstagramPublishResult> {
    requireInstagramConfig(env);

    // Step 1: Create media container
    const containerId = await createImageContainer(env, imageUrl, caption);
    // Step 2: Poll for processing
    await ensureProcessed(env, containerId);
    // Step 3: Publish
    return publishContainer(env, containerId);
}

// ==================== Single Video → Reel ====================

/** A media item for the feed: a public URL plus its kind. */
export interface InstagramMediaItem {
    url: string;
    type: 'photo' | 'video';
}

/**
 * Publish a single video to Instagram as a REEL. A standalone video on Instagram is a Reel, so this
 * uses a `REELS` container, polls to FINISHED (videos take longer), publishes, and returns a
 * `/reel/` URL. Used whenever the Instagram content reduces to exactly one video — regardless of
 * what other platforms or other media the thread carries.
 */
export async function publishToInstagramReel(
    env: Env,
    videoUrl: string,
    caption: string
): Promise<InstagramPublishResult> {
    requireInstagramConfig(env);
    console.log('[ig-publish] Single video for Instagram → publishing as Reel');
    const containerId = await createVideoContainer(env, videoUrl, caption, 'REELS');
    await ensureProcessed(env, containerId);
    const result = await publishContainer(env, containerId);
    // It's a Reel, not a feed post — reflect that in the URL.
    return { post_id: result.post_id, url: result.post_id ? `https://www.instagram.com/reel/${result.post_id}` : result.url };
}

/** Publish a single feed item by kind — image post, or a lone video as a Reel. */
function publishSingleFeedItem(env: Env, item: InstagramMediaItem, caption: string): Promise<InstagramPublishResult> {
    return item.type === 'video'
        ? publishToInstagramReel(env, item.url, caption)
        : publishToInstagramPost(env, item.url, caption);
}

// ==================== Carousel Post ====================

/**
 * Publish a carousel post to Instagram. Items may MIX photos and videos. All URLs must be publicly
 * accessible. Handles partial child failures — falls back to a single post (image or video) if <2
 * children succeed.
 */
export async function publishToInstagramCarousel(
    env: Env,
    items: InstagramMediaItem[],
    caption: string
): Promise<InstagramPublishResult> {
    requireInstagramConfig(env);

    const list = items.slice(0, MAX_CAROUSEL_ITEMS);
    if (items.length > MAX_CAROUSEL_ITEMS) {
        console.log(`[ig-publish] Carousel truncated to ${MAX_CAROUSEL_ITEMS} items (had ${items.length})`);
    }

    if (list.length === 1) {
        return publishSingleFeedItem(env, list[0], caption);
    }

    // Step 1: Create child containers — tolerate per-item failures, but abort on auth errors
    const children: Array<{ id: string; item: InstagramMediaItem }> = [];
    for (const item of list) {
        try {
            const childId = await createCarouselChildContainer(env, item);
            children.push({ id: childId, item });
        } catch (error) {
            if (error instanceof InstagramPublishError && error.isAuthError) throw error;
            console.error('[ig-publish] Failed to create child container for:', item.url, error instanceof Error ? error.message : String(error));
        }
    }

    if (children.length === 0) {
        throw new InstagramPublishError('All carousel items failed to upload');
    }

    // Fallback to single post if only one child succeeded — by its kind
    if (children.length === 1) {
        console.log('[ig-publish] Only one carousel child, falling back to single post');
        return publishSingleFeedItem(env, children[0].item, caption);
    }

    // Step 2: Poll each child for processing, keep only successful ones (videos take longer)
    const ready: Array<{ id: string; item: InstagramMediaItem }> = [];
    for (const child of children) {
        if (await pollContainerStatus(env, child.id)) {
            ready.push(child);
        } else {
            console.error('[ig-publish] Child container processing failed:', child.id);
        }
    }

    if (ready.length === 0) {
        throw new InstagramPublishError('All carousel items failed processing');
    }

    // If only one child processed successfully, fall back to single post by its kind
    if (ready.length === 1) {
        console.log('[ig-publish] Only one carousel child processed, falling back to single post');
        return publishSingleFeedItem(env, ready[0].item, caption);
    }

    // Step 3-5: Create carousel container, poll, publish
    const carouselId = await createCarouselContainer(env, ready.map(c => c.id), caption);
    await ensureProcessed(env, carouselId);
    return publishContainer(env, carouselId);
}

// ==================== Story ====================

/**
 * Publish a story to Instagram. Accepts an image or a video (both via `media_type: STORIES`,
 * keyed by `image_url` or `video_url`). A bare string is treated as an image URL for back-compat.
 * Stories have no URL after publishing.
 */
export async function publishToInstagramStory(
    env: Env,
    media: string | InstagramMediaItem
): Promise<InstagramPublishResult> {
    requireInstagramConfig(env);

    const item: InstagramMediaItem = typeof media === 'string' ? { url: media, type: 'photo' } : media;

    // Create story container — image_url for photos, video_url for videos
    const containerUrl = `${GRAPH_API}/${env.INSTAGRAM_BUSINESS_ACCOUNT_ID}/media`;
    const response = await fetch(containerUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            ...(item.type === 'video' ? { video_url: item.url } : { image_url: item.url }),
            media_type: 'STORIES',
            access_token: env.INSTAGRAM_ACCESS_TOKEN,
        }),
    });

    if (!response.ok) {
        throw await igErrorFromResponse(response, 'Story container creation failed');
    }

    const result = await response.json() as { id: string };
    // Poll for processing, then publish
    await ensureProcessed(env, result.id);
    return publishContainer(env, result.id, true);
}

// ==================== Internal Helpers ====================

async function createImageContainer(
    env: Env,
    imageUrl: string,
    caption: string
): Promise<string> {
    const url = `${GRAPH_API}/${env.INSTAGRAM_BUSINESS_ACCOUNT_ID}/media`;
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            image_url: imageUrl,
            caption: caption.substring(0, MAX_CAPTION_LENGTH),
            access_token: env.INSTAGRAM_ACCESS_TOKEN,
        }),
    });

    if (!response.ok) {
        throw await igErrorFromResponse(response, 'Image container creation failed');
    }

    const result = await response.json() as { id: string };
    return result.id;
}

async function createCarouselChildContainer(
    env: Env,
    item: InstagramMediaItem
): Promise<string> {
    const url = `${GRAPH_API}/${env.INSTAGRAM_BUSINESS_ACCOUNT_ID}/media`;
    // A video carousel child uses media_type=VIDEO + video_url (NOT REELS — REELS is standalone only);
    // a photo child uses image_url. Both are flagged is_carousel_item.
    const body = item.type === 'video'
        ? { media_type: 'VIDEO', video_url: item.url, is_carousel_item: true, access_token: env.INSTAGRAM_ACCESS_TOKEN }
        : { image_url: item.url, is_carousel_item: true, access_token: env.INSTAGRAM_ACCESS_TOKEN };
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });

    if (!response.ok) {
        throw await igErrorFromResponse(response, 'Carousel child creation failed');
    }

    const result = await response.json() as { id: string };
    return result.id;
}

/** Create a video container (feed Reel or carousel video) and return its id. */
async function createVideoContainer(
    env: Env,
    videoUrl: string,
    caption: string,
    mediaType: 'REELS'
): Promise<string> {
    const url = `${GRAPH_API}/${env.INSTAGRAM_BUSINESS_ACCOUNT_ID}/media`;
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            media_type: mediaType,
            video_url: videoUrl,
            caption: caption.substring(0, MAX_CAPTION_LENGTH),
            access_token: env.INSTAGRAM_ACCESS_TOKEN,
        }),
    });

    if (!response.ok) {
        throw await igErrorFromResponse(response, 'Video container creation failed');
    }

    const result = await response.json() as { id: string };
    return result.id;
}

async function createCarouselContainer(
    env: Env,
    childIds: string[],
    caption: string
): Promise<string> {
    const url = `${GRAPH_API}/${env.INSTAGRAM_BUSINESS_ACCOUNT_ID}/media`;
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            media_type: 'CAROUSEL',
            children: childIds,
            caption: caption.substring(0, MAX_CAPTION_LENGTH),
            access_token: env.INSTAGRAM_ACCESS_TOKEN,
        }),
    });

    if (!response.ok) {
        throw await igErrorFromResponse(response, 'Carousel container creation failed');
    }

    const result = await response.json() as { id: string };
    return result.id;
}

/**
 * Poll container status until FINISHED or ERROR (max 5 minutes).
 */
async function pollContainerStatus(
    env: Env,
    containerId: string
): Promise<boolean> {
    const maxWait = 5 * 60 * 1000;
    const startTime = Date.now();
    const pollInterval = 5000; // 5 seconds

    while (Date.now() - startTime < maxWait) {
        await new Promise(r => setTimeout(r, pollInterval));

        const statusUrl = `${GRAPH_API}/${containerId}?fields=status_code,status&access_token=${env.INSTAGRAM_ACCESS_TOKEN}`;
        const response = await fetch(statusUrl);

        if (!response.ok) {
            console.error('[ig-publish] Status poll failed:', response.status);
            continue;
        }

        const result = await response.json() as { status_code: string; status?: string };

        if (result.status_code === 'FINISHED') return true;
        if (result.status_code === 'ERROR') {
            console.error('[ig-publish] Container processing failed:', result.status);
            return false;
        }
        // IN_PROGRESS — keep polling
    }

    console.error('[ig-publish] Container processing timed out');
    return false;
}

/**
 * Publish a processed container.
 */
async function publishContainer(
    env: Env,
    containerId: string,
    isStory = false
): Promise<InstagramPublishResult> {
    const url = `${GRAPH_API}/${env.INSTAGRAM_BUSINESS_ACCOUNT_ID}/media_publish`;
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            creation_id: containerId,
            access_token: env.INSTAGRAM_ACCESS_TOKEN,
        }),
    });

    if (!response.ok) {
        throw await igErrorFromResponse(response, 'Publish failed');
    }

    const result = await response.json() as { id: string };

    // Stories don't have a permanent URL
    const postUrl = isStory ? null : `https://www.instagram.com/p/${result.id}`;

    return {
        post_id: result.id,
        url: postUrl,
    };
}

/**
 * Trim and format text for Instagram caption.
 * Joins multiple tweet texts with line breaks.
 */
export function formatInstagramCaption(texts: string[]): string {
    return texts.join('\n\n').substring(0, MAX_CAPTION_LENGTH);
}
