/**
 * Persona Bootstrap Service — Generates account overview using Gemini with web search
 *
 * Fetches profile info, recent tweets, then calls Gemini to build a persona overview
 * that will be used as context for all future repost generation.
 */

import type { Env } from '../types';
import { getTwitterAccount, getRecentTweetsByAccount, upsertTwitterAccountOverview } from './db';
import { buildPersonaUserPrompt } from './persona-prompt';
import { getPrompt } from './prompts';
import { callGeminiText } from './gemini';

interface PersonaResult {
    persona: string;
    topics: string[];
    communication_style: string;
    notable_context: string;
    recent_themes: string[];
}

/**
 * Bootstrap persona overview for a Twitter account
 */
export async function bootstrapPersona(env: Env, accountId: string, chatId: string): Promise<boolean> {
    const account = await getTwitterAccount(env, accountId, chatId);
    if (!account) {
        console.error(`[persona] Account ${accountId} not found`);
        return false;
    }

    // Get recent tweets for context
    const recentTweets = await getRecentTweetsByAccount(env, chatId, accountId, 30);

    const userPrompt = buildPersonaUserPrompt({
        username: account.username,
        displayName: account.display_name,
        recentTweets: recentTweets.map(t => t.text),
    });

    const personaSystemPrompt = await getPrompt(env, chatId, 'persona', 'en');

    try {
        const responseText = await callGeminiText(env, personaSystemPrompt, userPrompt, {
            temperature: 0.5,
            jsonMode: false,
            tools: [{ googleSearch: {} }],
        });

        // Extract JSON from freeform response (may be wrapped in ```json blocks)
        const jsonMatch = responseText.match(/```json\s*([\s\S]*?)```/) || responseText.match(/(\{[\s\S]*\})/);
        if (!jsonMatch) {
            console.error('[persona] Could not extract JSON from Gemini response:', responseText.substring(0, 200));
            return false;
        }

        const result = JSON.parse(jsonMatch[1]) as PersonaResult;

        // Store the persona overview
        await upsertTwitterAccountOverview(env, accountId, {
            persona: result.persona,
            topics: JSON.stringify(result.topics),
            communication_style: result.communication_style,
            notable_context: result.notable_context,
            recent_themes: JSON.stringify(result.recent_themes),
        });

        console.log(`[persona] Bootstrapped persona for @${account.username}`);
        return true;
    } catch (error) {
        console.error('[persona] Bootstrap failed:', error);
        return false;
    }
}
