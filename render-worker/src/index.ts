/**
 * render-worker — entry point
 *
 * Internal-only Cloudflare Worker that performs Satori/resvg image rendering.
 * The content-bot invokes the `RenderService` methods over a service binding (RPC);
 * there is no public HTTP surface (the default fetch handler returns 404, and
 * workers.dev is disabled in wrangler.toml).
 */

import { WorkerEntrypoint } from 'cloudflare:workers';
import type { RenderEnv, TweetCardData, QuoteTweetCardData } from './contract';
import {
    renderTweetCard as renderTweetCardImpl,
    renderThreadCards as renderThreadCardsImpl,
    renderQuoteTweetCard as renderQuoteTweetCardImpl,
    createStoryImage as createStoryImageImpl,
} from './renderer';

export class RenderService extends WorkerEntrypoint<RenderEnv> {
    /** Render a single tweet card → PNG. */
    renderTweetCard(data: TweetCardData): Promise<Uint8Array> {
        return renderTweetCardImpl(this.env, data);
    }

    /** Render a connected thread → one PNG per tweet. */
    renderThreadCards(tweets: TweetCardData[]): Promise<Uint8Array[]> {
        return renderThreadCardsImpl(this.env, tweets);
    }

    /** Render a quote/repost card → PNG. */
    renderQuoteTweetCard(data: QuoteTweetCardData): Promise<Uint8Array> {
        return renderQuoteTweetCardImpl(this.env, data);
    }

    /** Wrap a card PNG into a 9:16 story PNG. */
    createStoryImage(cardPng: Uint8Array): Promise<Uint8Array> {
        return createStoryImageImpl(this.env, cardPng);
    }
}

// No public surface: this Worker is reached only via the RENDER service binding.
export default {
    async fetch(): Promise<Response> {
        return new Response('Not found', { status: 404 });
    },
};
