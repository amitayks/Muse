/**
 * Tweet Card — bot-side client + R2 storage
 *
 * The heavy Satori/resvg rendering now lives in the dedicated `render-worker` (kept out
 * of this Worker's bundle so cold starts on the conversational path stay fast). The render
 * functions below are thin delegators to the `RENDER` service binding; the R2 storage
 * helpers (store/get/storeStory) stay here because they're plain R2 ops with no Satori
 * dependency and the bot owns the output lifecycle.
 *
 * Public function names and signatures are unchanged, so callers are unaffected.
 */

import type { Env } from '../types';
import type { TweetCardData, QuoteTweetCardData } from './render-contract';

// Re-export the data shapes so existing/future callers can import them from here.
export type { TweetCardData, QuoteTweetCardData } from './render-contract';

// ==================== Rendering (delegated to render-worker via RENDER binding) ====================

/** Render a single tweet card → PNG (runs in render-worker). */
export function renderTweetCard(env: Env, data: TweetCardData): Promise<Uint8Array> {
    return env.RENDER.renderTweetCard(data);
}

/** Render a connected thread → one PNG per tweet (runs in render-worker). */
export function renderThreadCards(env: Env, tweets: TweetCardData[]): Promise<Uint8Array[]> {
    return env.RENDER.renderThreadCards(tweets);
}

/** Render a quote/repost card → PNG (runs in render-worker). */
export function renderQuoteTweetCard(env: Env, data: QuoteTweetCardData): Promise<Uint8Array> {
    return env.RENDER.renderQuoteTweetCard(data);
}

/** Wrap a card PNG into a 9:16 story PNG (runs in render-worker). */
export function createStoryImage(env: Env, cardPng: Uint8Array): Promise<Uint8Array> {
    return env.RENDER.createStoryImage(cardPng);
}

// ==================== R2 Storage (bot-side, no Satori) ====================

export async function storeTweetCard(
    env: Env,
    draftId: string,
    index: number,
    png: Uint8Array
): Promise<string> {
    const key = `tweet-cards/${draftId}/${index}.png`;

    await env.IMAGES.put(key, png, {
        httpMetadata: { contentType: 'image/png' },
    });

    return key;
}

export async function getTweetCard(
    env: Env,
    draftId: string,
    index: number
): Promise<Uint8Array | null> {
    const key = `tweet-cards/${draftId}/${index}.png`;
    const obj = await env.IMAGES.get(key);
    if (!obj) return null;
    return new Uint8Array(await obj.arrayBuffer());
}

export async function storeStoryImage(
    env: Env,
    draftId: string,
    png: Uint8Array
): Promise<string> {
    const key = `tweet-cards/${draftId}/story.png`;

    await env.IMAGES.put(key, png, {
        httpMetadata: { contentType: 'image/png' },
    });

    return key;
}
