/**
 * Identity Analysis Service — Generates Identity Documents from user tweets via Gemini
 */

import type { Env } from '../types';
import type { ClassifiedTweet } from '../integrations/x';
import { fetchUserTweets } from '../integrations/x';
import { getDefaultPromptText, saveUserPrompt } from './prompts';
import { callGeminiText } from './gemini';

/**
 * Run the full identity analysis flow:
 * 1. Fetch the user's tweets via X API
 * 2. Send to Gemini with the /who-am-i analysis skill
 * 3. Store the resulting Identity Document in user_prompts
 *
 * The env must be hydrated with the user's X API credentials.
 * Returns the generated Identity Document text, or null on failure.
 */
export async function analyzeIdentity(env: Env, chatId: string, lang: string): Promise<string | null> {
    // 1. Fetch tweets
    let tweets: ClassifiedTweet[];
    try {
        tweets = await fetchUserTweets(env);
    } catch (error) {
        console.error('[identity] Failed to fetch tweets:', error);
        return null;
    }

    if (tweets.length === 0) {
        console.log('[identity] No tweets found for user');
        return null;
    }

    // 2. Build the user prompt with classified tweets
    const tweetLines = tweets.map((t, i) => {
        const tag = t.kind === 'quote' ? '[QUOTE]' : t.kind === 'reply' ? '[REPLY]' : '[POST]';
        return `${i + 1}. ${tag} ${t.text}`;
    }).join('\n');

    const userPrompt = `Here are ${tweets.length} of my recent tweets. Analyze them and build my Identity Document.\n\n${tweetLines}`;

    // 3. Call Gemini with the /who-am-i analysis skill (from default_prompts)
    const analysisSkill = await getDefaultPromptText(env, 'who-am-i', lang);
    const identityDocument = await callGeminiText(env, analysisSkill, userPrompt, { jsonMode: false });

    // 4. Store in user_prompts
    await saveUserPrompt(env, chatId, 'who-am-i', lang, identityDocument);
    console.log(`[identity] Stored identity document for user ${chatId} (${identityDocument.length} chars)`);

    return identityDocument;
}

/**
 * Store the default skeleton identity for a user who skips analysis.
 */
export async function storeDefaultIdentity(env: Env, chatId: string, lang: string): Promise<void> {
    const skeleton = await getDefaultPromptText(env, 'who-am-i', lang);
    await saveUserPrompt(env, chatId, 'who-am-i', lang, skeleton);
    console.log(`[identity] Stored default skeleton identity for user ${chatId}`);
}
