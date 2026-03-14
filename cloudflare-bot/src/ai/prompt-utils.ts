/**
 * Shared prompt section builders — reusable across repost and commit AI pipelines.
 *
 * Formats "MY INITIAL THOUGHTS" (user tweets) and "WHAT I'M GOING FOR" (instruction)
 * sections that are appended to AI prompts when compose mode provides user context.
 */

/**
 * Build the "MY INITIAL THOUGHTS" and "WHAT I'M GOING FOR" prompt sections.
 * Returns empty string if no user context is provided.
 */
export function buildPromptSections(options: {
    userTweets?: string[];
    instruction?: string;
}): string {
    const parts: string[] = [];

    if (options.userTweets && options.userTweets.length > 0) {
        parts.push('MY INITIAL THOUGHTS:');
        for (const tweet of options.userTweets) {
            parts.push(`- ${tweet}`);
        }
        parts.push('');
    }

    if (options.instruction) {
        parts.push("WHAT I'M GOING FOR:");
        parts.push(options.instruction);
        parts.push('');
    }

    return parts.join('\n');
}
