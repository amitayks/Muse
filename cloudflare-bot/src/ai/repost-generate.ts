/**
 * Repost Content Generation — Generates quote tweet content via Gemini
 *
 * Used by the content-bot for on-demand generation when user clicks [Generate]
 * on a batch notification tweet, and for compose mode repost pen down.
 */

import type { Env, DraftContent, TwitterTweet, TwitterAccountConfig } from '../types';
import { getTwitterAccountOverview } from '../data/db';
import { buildRepostUserPrompt } from './repost-prompt';
import { assembleSystemInstruction } from './prompts';
import { callLLMText } from './gemini';
import type { ImagePart } from './gemini';

export interface RepostOptions {
    personaOverride?: string | null;
    imageUrl?: string | null;
    language?: string;
    userTweets?: string[];
    instruction?: string;
    threadText?: string;
    userImageParts?: ImagePart[];
    relevanceReason?: string | null;
}

/**
 * Generate repost content for a tweet
 */
export async function generateRepostContent(
    env: Env,
    tweet: TwitterTweet,
    accountId: string,
    config: TwitterAccountConfig,
    options?: RepostOptions,
): Promise<DraftContent | null> {
    const {
        personaOverride, imageUrl, language,
        userTweets, instruction, threadText,
        userImageParts, relevanceReason,
    } = options || {};

    // Load persona context — use override if provided, else fetch from followed account only
    let persona: string | undefined;

    if (personaOverride) {
        persona = personaOverride;
    } else if (accountId) {
        const overview = await getTwitterAccountOverview(env, tweet.chat_id, accountId);
        persona = overview?.persona || undefined;
    }

    const userPrompt = buildRepostUserPrompt({
        originalTweet: tweet.text,
        authorUsername: tweet.author_username,
        isThread: tweet.is_thread === 1,
        language: language || 'en',
        persona,
        recentTweets: [],
        hasImage: !!imageUrl,
        threadText,
        userTweets,
        instruction,
        relevanceReason,
    });

    const repostSystemPrompt = await assembleSystemInstruction(env, tweet.chat_id, 'quote', language || 'en');

    try {
        // Build parts — text + optional source image + optional user images
        const parts: Array<{ text: string } | { inline_data: { mime_type: string; data: string } }> = [
            { text: userPrompt },
        ];

        // Fetch and attach source tweet image if available
        if (imageUrl) {
            try {
                const imgResponse = await fetch(imageUrl);
                if (imgResponse.ok) {
                    const imgBuffer = await imgResponse.arrayBuffer();
                    const base64 = btoa(String.fromCharCode(...new Uint8Array(imgBuffer)));
                    const contentType = imgResponse.headers.get('content-type') || 'image/jpeg';
                    parts.push({
                        inline_data: { mime_type: contentType, data: base64 },
                    });
                }
            } catch (error) {
                console.error('[repost-gen] Failed to fetch tweet image:', error);
            }
        }

        // Append user-attached image parts if provided
        if (userImageParts && userImageParts.length > 0) {
            for (const part of userImageParts) {
                parts.push(part);
            }
        }

        const text = await callLLMText(env, repostSystemPrompt, parts, { temperature: 0.8, tools: [{ googleSearch: {} }] });
        const content = JSON.parse(text) as DraftContent;

        if (!content.tweets || content.tweets.length === 0) {
            console.error('[repost-gen] Invalid content: no tweets');
            return null;
        }

        return content;
    } catch (error) {
        console.error('[repost-gen] Generation failed:', error);
        return null;
    }
}
