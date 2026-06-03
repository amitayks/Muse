/**
 * AI Scoring System Prompt — User prompt builder
 *
 * System prompt is now stored in DB (resolved via getPrompt from ai/prompts.ts).
 * This file only exports the user prompt builder function.
 */

/**
 * Build the user prompt for batch scoring
 */
export function buildScoringUserPrompt(
    tweets: Array<{ id: string; text: string; author_username: string; is_thread: number; account_id: string; metrics?: string | null }>,
    personaMap?: Map<string, string>,
): string {
    const tweetList = tweets.map((t, i) => {
        const metrics = t.metrics ? JSON.parse(t.metrics) : null;
        const metricsStr = metrics
            ? ` | likes: ${metrics.like_count || 0}, RTs: ${metrics.retweet_count || 0}, replies: ${metrics.reply_count || 0}`
            : '';
        const threadLabel = t.is_thread ? ' [THREAD]' : '';
        const persona = personaMap?.get(t.account_id);
        const personaLine = persona ? `\nAuthor context: ${persona}` : '';

        return `[${i + 1}] @${t.author_username} (id: ${t.id})${threadLabel}${metricsStr}${personaLine}\n${t.text}`;
    }).join('\n\n---\n\n');

    return `Score the following ${tweets.length} tweet(s) for repost potential:\n\n${tweetList}`;
}
