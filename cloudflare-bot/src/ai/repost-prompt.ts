/**
 * Repost Content Generation Prompt — User prompt builder
 *
 * System prompt is now stored in DB (resolved via getPrompt from ai/prompts.ts).
 * This file only exports the user prompt builder function.
 */

import { buildPromptSections } from './prompt-utils';

/**
 * Build the user prompt for repost content generation
 */
export function buildRepostUserPrompt(params: {
    originalTweet: string;
    authorUsername: string;
    isThread: boolean;
    language: string;
    persona?: string | null;
    recentTweets?: string[];
    hasImage?: boolean;
    threadText?: string;
    userTweets?: string[];
    instruction?: string;
    relevanceReason?: string | null;
}): string {
    const parts: string[] = [];

    parts.push(`ORIGINAL TWEET by @${params.authorUsername}${params.isThread ? ' (Thread)' : ''}:`);
    parts.push(params.originalTweet);
    parts.push('');

    // Scoring reason as emotional entry point context
    if (params.relevanceReason) {
        parts.push('WHAT CAUGHT MY ATTENTION:');
        parts.push(params.relevanceReason);
        parts.push('');
    }

    // Full thread context (when available)
    if (params.threadText) {
        parts.push('FULL THREAD CONTEXT:');
        parts.push(params.threadText);
        parts.push('');
    }


    if (params.persona) {
        parts.push(`PERSONA CONTEXT (about @${params.authorUsername}):`);
        parts.push(params.persona);
        parts.push('');
    }

    if (params.recentTweets && params.recentTweets.length > 0) {
        parts.push(`RECENT TWEETS BY POSTER (for voice/style reference, last ${params.recentTweets.length}):`);
        for (const tweet of params.recentTweets.slice(0, 10)) {
            parts.push(`- ${tweet.substring(0, 100)}`);
        }
        parts.push('');
    }

    // User's initial thoughts and instruction (shared with commit pipeline)
    const userSections = buildPromptSections({
        userTweets: params.userTweets,
        instruction: params.instruction,
    });
    if (userSections) {
        parts.push(userSections);
    }

    return parts.join('\n');
}
