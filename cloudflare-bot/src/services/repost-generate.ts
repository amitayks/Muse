/**
 * Repost Content Generation — Generates quote tweet content via Gemini
 *
 * Used by the content-bot for on-demand generation when user clicks [Generate]
 * on a batch notification tweet.
 */

import type { Env, DraftContent, TwitterTweet, TwitterAccountConfig } from '../types';
import { getTwitterAccountOverview, getRecentTweetsByAccount } from './db';
import { buildRepostUserPrompt } from './repost-prompt';
import { getPrompt } from './prompts';
import { callGeminiText } from './gemini';

/**
 * Generate repost content for a tweet
 */
export async function generateRepostContent(
    env: Env,
    tweet: TwitterTweet,
    accountId: string,
    config: TwitterAccountConfig,
    personaOverride?: string | null,
    imageUrl?: string | null,
    language?: string,
): Promise<DraftContent | null> {
    // Load persona context — use override if provided, else fetch from account
    let persona: string | undefined;
    let recentTweets: TwitterTweet[] = [];

    if (personaOverride) {
        persona = personaOverride;
    } else if (accountId) {
        const overview = await getTwitterAccountOverview(env, tweet.chat_id, accountId);
        persona = overview?.persona || undefined;
        recentTweets = await getRecentTweetsByAccount(env, tweet.chat_id, accountId, 20);
    }

    const userPrompt = buildRepostUserPrompt({
        originalTweet: tweet.text,
        authorUsername: tweet.author_username,
        isThread: tweet.is_thread === 1,
        tone: config.tone,
        language: language || 'en',
        includeHashtags: config.includeHashtags,
        persona,
        recentTweets: recentTweets.map(t => t.text),
        hasImage: !!imageUrl,
    });

    const repostSystemPrompt = await getPrompt(env, tweet.chat_id, 'repost', language || 'en');

    try {
        // Build parts — text + optional image
        const parts: Array<{ text: string } | { inline_data: { mime_type: string; data: string } }> = [
            { text: userPrompt },
        ];

        // Fetch and attach image if available
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

        const text = await callGeminiText(env, repostSystemPrompt, parts, { temperature: 0.8 });
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
