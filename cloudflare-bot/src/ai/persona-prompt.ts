/**
 * Persona Bootstrap Prompt — User prompt builder
 *
 * System prompt is now stored in DB (resolved via getPrompt from ai/prompts.ts).
 * This file only exports the user prompt builder function.
 */

/**
 * Build the user prompt for persona bootstrap
 */
export function buildPersonaUserPrompt(params: {
    username: string;
    displayName?: string | null;
    bio?: string | null;
    recentTweets?: string[];
}): string {
    const parts: string[] = [];

    parts.push(`Research this Twitter/X account and build a persona overview:`);
    parts.push('');
    parts.push(`Username: @${params.username}`);

    if (params.displayName) {
        parts.push(`Display Name: ${params.displayName}`);
    }
    if (params.bio) {
        parts.push(`Bio: ${params.bio}`);
    }

    parts.push('');
    parts.push(`Search the web for information about @${params.username} to build a comprehensive persona.`);

    if (params.recentTweets && params.recentTweets.length > 0) {
        parts.push('');
        parts.push(`RECENT TWEETS (for topic/style analysis):`);
        for (const tweet of params.recentTweets.slice(0, 15)) {
            parts.push(`- ${tweet.substring(0, 150)}`);
        }
    }

    return parts.join('\n');
}
