/**
 * Identity Analysis Service — Generates Identity Documents from user tweets via Gemini
 */

import type { Env } from '../types';
import type { ClassifiedTweet } from '../integrations/x';
import { fetchUserTweets, getMyProfile, XReconnectError } from '../integrations/x';
import { updateOwnProfileData } from '../data/user-db';
import { getIdentityTweetCount } from '../data/db';
import { getDefaultPromptText, saveUserPrompt } from './prompts';
import { callLLMText } from './gemini';

/**
 * Run the full identity analysis flow:
 * 1. Fetch the user's tweets via X API
 * 2. Send to Gemini with the /who-am-i analysis skill
 * 3. Store the resulting Identity Document in user_prompts
 *
 * The env must be hydrated with the user's X API credentials.
 * Returns the generated Identity Document text, or null on failure.
 */
export async function analyzeIdentity(env: Env, chatId: string, lang: string): Promise<{ document: string; tweetCount: number } | null> {
    // 1. Fetch tweets (depth configured per-user: 100, 200, or 400)
    const count = await getIdentityTweetCount(env, chatId);
    let tweets: ClassifiedTweet[];
    try {
        tweets = await fetchUserTweets(env, count);
    } catch (error) {
        // A missing/dead OAuth 2.0 bearer surfaces as XReconnectError — propagate it so
        // callers can show an honest "reconnect your X" prompt instead of "no tweets".
        if (error instanceof XReconnectError) throw error;
        console.error('[identity] Failed to fetch tweets:', error);
        return null;
    }

    if (tweets.length === 0) {
        console.log('[identity] No tweets found for user');
        return null;
    }

    // 1b. Fetch and store the user's own X profile data (for tweet card rendering)
    try {
        const profile = await getMyProfile(env);
        if (profile && profile.profile_image_url) {
            await updateOwnProfileData(env, chatId, {
                profileImageUrl: profile.profile_image_url,
                username: profile.username,
                displayName: profile.name,
            });
        }
    } catch (error) {
        console.error('[identity] Failed to store own profile data:', error);
        // Non-fatal — continue with identity analysis
    }

    // 2. Build the user prompt with classified tweets
    const tweetLines = tweets.map((t, i) => {
        const n = i + 1;
        let tag: string;
        if (t.kind === 'reply') {
            tag = t.refAuthorUsername !== undefined && t.refText !== undefined
                ? `[REPLY to @${t.refAuthorUsername}: "${t.refText}"]`
                : '[REPLY]';
        } else if (t.kind === 'quote') {
            tag = t.refAuthorUsername !== undefined && t.refText !== undefined
                ? `[QUOTE of @${t.refAuthorUsername}: "${t.refText}"]`
                : '[QUOTE]';
        } else {
            tag = '[POST]';
        }
        return `${n}. ${tag} ${t.text}`;
    }).join('\n');

    const userPrompt = `Here are ${tweets.length} of my recent tweets. Analyze them and build my Identity Document.\n\n${tweetLines}`;

    // 3. Call Gemini with the /who-am-i analysis skill (from default_prompts)
    const analysisSkill = await getDefaultPromptText(env, 'who-am-i', lang);
    const identityDocument = await callLLMText(env, analysisSkill, userPrompt, { jsonMode: false });

    // 4. Store in user_prompts as 'identity' (not 'who-am-i' which is the analysis skill)
    await saveUserPrompt(env, chatId, 'identity', lang, identityDocument);
    console.log(`[identity] Stored identity document for user ${chatId} (${identityDocument.length} chars)`);

    return { document: identityDocument, tweetCount: tweets.length };
}

/**
 * Check if a user has an analyzed (non-default) identity document.
 * Returns info about which languages have custom identity rows.
 */
export async function getIdentityStatus(env: Env, chatId: string): Promise<{ hasAny: boolean; langs: string[] }> {
    const rows = await env.DB.prepare(
        'SELECT language FROM user_prompts WHERE chat_id = ? AND prompt_type = ?'
    ).bind(chatId, 'identity').all<{ language: string }>();
    const langs = rows.results.map(r => r.language);
    return { hasAny: langs.length > 0, langs };
}
