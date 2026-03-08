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

// ==================== Single Image Post ====================

/**
 * Publish a single image post to Instagram.
 * imageUrl must be publicly accessible (e.g. via WORKER_URL/media/).
 */
export async function publishToInstagramPost(
    env: Env,
    imageUrl: string,
    caption: string
): Promise<InstagramPublishResult | null> {
    if (!env.INSTAGRAM_ACCESS_TOKEN || !env.INSTAGRAM_BUSINESS_ACCOUNT_ID) {
        console.error('[ig-publish] Instagram not configured');
        return null;
    }

    try {
        // Step 1: Create media container
        const containerId = await createImageContainer(env, imageUrl, caption);
        if (!containerId) return null;

        // Step 2: Poll for processing
        const ready = await pollContainerStatus(env, containerId);
        if (!ready) return null;

        // Step 3: Publish
        return await publishContainer(env, containerId);
    } catch (error) {
        console.error('[ig-publish] publishToInstagramPost error:', error instanceof Error ? error.message : String(error));
        return null;
    }
}

// ==================== Carousel Post ====================

/**
 * Publish a carousel post (multiple images) to Instagram.
 * All imageUrls must be publicly accessible.
 * Handles partial child failures — falls back to single if <2 succeed.
 */
export async function publishToInstagramCarousel(
    env: Env,
    imageUrls: string[],
    caption: string
): Promise<InstagramPublishResult | null> {
    if (!env.INSTAGRAM_ACCESS_TOKEN || !env.INSTAGRAM_BUSINESS_ACCOUNT_ID) {
        console.error('[ig-publish] Instagram not configured');
        return null;
    }

    const urls = imageUrls.slice(0, MAX_CAROUSEL_ITEMS);

    if (urls.length === 1) {
        return publishToInstagramPost(env, urls[0], caption);
    }

    try {
        // Step 1: Create child containers for each image, tracking which URL succeeded
        const children: Array<{ id: string; url: string }> = [];
        for (const url of urls) {
            const childId = await createCarouselChildContainer(env, url);
            if (childId) {
                children.push({ id: childId, url });
            } else {
                console.error('[ig-publish] Failed to create child container for:', url);
            }
        }

        if (children.length === 0) {
            console.error('[ig-publish] All carousel children failed');
            return null;
        }

        // Fallback to single post if only one child succeeded — use its URL
        if (children.length === 1) {
            console.log('[ig-publish] Only one carousel child, falling back to single post');
            return publishToInstagramPost(env, children[0].url, caption);
        }

        // Step 2: Poll each child for processing, keep only successful ones
        const readyChildIds: string[] = [];
        for (const child of children) {
            const ready = await pollContainerStatus(env, child.id);
            if (ready) {
                readyChildIds.push(child.id);
            } else {
                console.error('[ig-publish] Child container processing failed:', child.id);
            }
        }

        if (readyChildIds.length === 0) {
            console.error('[ig-publish] All carousel children failed processing');
            return null;
        }

        // If only one child processed successfully, fall back to single post
        if (readyChildIds.length === 1) {
            const successUrl = children.find(c => c.id === readyChildIds[0])!.url;
            console.log('[ig-publish] Only one carousel child processed, falling back to single post');
            return publishToInstagramPost(env, successUrl, caption);
        }

        // Step 3: Create carousel container with only successful children
        const carouselId = await createCarouselContainer(env, readyChildIds, caption);
        if (!carouselId) return null;

        // Step 4: Poll carousel container
        const ready = await pollContainerStatus(env, carouselId);
        if (!ready) return null;

        // Step 5: Publish
        return await publishContainer(env, carouselId);
    } catch (error) {
        console.error('[ig-publish] publishToInstagramCarousel error:', error instanceof Error ? error.message : String(error));
        return null;
    }
}

// ==================== Story ====================

/**
 * Publish an image story to Instagram.
 * imageUrl must be publicly accessible.
 * Stories have no URL after publishing.
 */
export async function publishToInstagramStory(
    env: Env,
    imageUrl: string
): Promise<InstagramPublishResult | null> {
    if (!env.INSTAGRAM_ACCESS_TOKEN || !env.INSTAGRAM_BUSINESS_ACCOUNT_ID) {
        console.error('[ig-publish] Instagram not configured');
        return null;
    }

    try {
        // Create story container
        const containerUrl = `${GRAPH_API}/${env.INSTAGRAM_BUSINESS_ACCOUNT_ID}/media`;
        const response = await fetch(containerUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                image_url: imageUrl,
                media_type: 'STORIES',
                access_token: env.INSTAGRAM_ACCESS_TOKEN,
            }),
        });

        if (!response.ok) {
            console.error('[ig-publish] Story container creation failed:', await response.text());
            return null;
        }

        const result = await response.json() as { id: string };
        const containerId = result.id;

        // Poll for processing
        const ready = await pollContainerStatus(env, containerId);
        if (!ready) return null;

        // Publish
        return await publishContainer(env, containerId, true);
    } catch (error) {
        console.error('[ig-publish] publishToInstagramStory error:', error instanceof Error ? error.message : String(error));
        return null;
    }
}

// ==================== Internal Helpers ====================

async function createImageContainer(
    env: Env,
    imageUrl: string,
    caption: string
): Promise<string | null> {
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
        console.error('[ig-publish] Image container creation failed:', await response.text());
        return null;
    }

    const result = await response.json() as { id: string };
    return result.id;
}

async function createCarouselChildContainer(
    env: Env,
    imageUrl: string
): Promise<string | null> {
    const url = `${GRAPH_API}/${env.INSTAGRAM_BUSINESS_ACCOUNT_ID}/media`;
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            image_url: imageUrl,
            is_carousel_item: true,
            access_token: env.INSTAGRAM_ACCESS_TOKEN,
        }),
    });

    if (!response.ok) {
        console.error('[ig-publish] Carousel child creation failed:', await response.text());
        return null;
    }

    const result = await response.json() as { id: string };
    return result.id;
}

async function createCarouselContainer(
    env: Env,
    childIds: string[],
    caption: string
): Promise<string | null> {
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
        console.error('[ig-publish] Carousel container creation failed:', await response.text());
        return null;
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
): Promise<InstagramPublishResult | null> {
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
        console.error('[ig-publish] Publish failed:', await response.text());
        return null;
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
