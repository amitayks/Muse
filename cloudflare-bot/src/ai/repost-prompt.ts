/**
 * Repost Content Generation Prompt — User prompt builder
 *
 * System prompt is now stored in DB (resolved via getPrompt from ai/prompts.ts).
 * This file only exports the user prompt builder function.
 */

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
}): string {
    const parts: string[] = [];

    parts.push(`ORIGINAL TWEET by @${params.authorUsername}${params.isThread ? ' (Thread)' : ''}:`);
    parts.push(params.originalTweet);
    parts.push('');

    parts.push(`SETTINGS:`);
    parts.push(`- Language: ${params.language === 'he' ? 'Hebrew' : 'English'}`);
    parts.push('');

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

    if (params.hasImage) {
        parts.push('NOTE: The original tweet includes an attached image (shown above). Consider the image content when crafting your response — reference what you see if relevant.');
        parts.push('');
    }

    parts.push('Generate a quote tweet response that adds genuine value.');

    return parts.join('\n');
}
