/**
 * AI Scoring Service — Batch tweet relevance scoring via Gemini
 */

import type { Env, TwitterTweet } from '../types';
import { updateTwitterTweet, getTwitterAccountOverview } from '../data/db';
import { buildScoringUserPrompt } from './scoring-prompt';
import { assembleSystemInstruction } from './prompts';
import { callGeminiText } from './gemini';

interface ScoringResult {
    scores: Array<{
        tweet_id: string;
        score: number;
        reason: string;
    }>;
}

/**
 * Score a batch of tweets for relevance using Gemini
 */
export async function scoreTweetBatch(env: Env, tweets: TwitterTweet[]): Promise<void> {
    if (tweets.length === 0) return;

    // Only score pending tweets
    const pendingTweets = tweets.filter(t => t.status === 'pending');
    if (pendingTweets.length === 0) return;

    console.log(`[scoring] Scoring ${pendingTweets.length} tweets`);

    // Scoring is admin-only — use first tweet's chatId for prompt resolution
    const chatId = pendingTweets[0]?.chat_id || '';

    // Load persona for each unique author in the batch
    const personaMap = new Map<string, string>();
    const uniqueAccountIds = [...new Set(pendingTweets.map(t => t.account_id))];
    for (const accountId of uniqueAccountIds) {
        try {
            const overview = await getTwitterAccountOverview(env, chatId, accountId);
            if (overview?.persona) {
                personaMap.set(accountId, overview.persona);
            }
        } catch {
            // Graceful degradation — score without persona
        }
    }

    const userPrompt = buildScoringUserPrompt(pendingTweets, personaMap);
    const scoringSystemPrompt = await assembleSystemInstruction(env, chatId, 'what-i-like', 'en');

    try {
        const text = await callGeminiText(env, scoringSystemPrompt, userPrompt, { temperature: 0.3 });
        const result = JSON.parse(text) as ScoringResult;

        // Update each tweet with its score
        for (const score of result.scores) {
            const tweet = pendingTweets.find(t => t.id === score.tweet_id);
            if (!tweet) continue;

            await updateTwitterTweet(env, score.tweet_id, {
                relevance_score: score.score,
                relevance_reason: score.reason,
                status: 'scored',
            });
        }

        console.log(`[scoring] Scored ${result.scores.length} tweets`);
    } catch (error) {
        console.error('[scoring] Failed to score tweets:', error);
    }
}
