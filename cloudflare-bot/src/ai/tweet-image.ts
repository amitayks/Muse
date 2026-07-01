/**
 * Per-tweet image generation — the unified, skill-based pipeline.
 *
 * For a given draft + tweet index, assemble the `/image-gen` skill + identity +
 * the tweet (and source-derived context), ask the LLM for a single JSON image
 * prompt, send that JSON to the Gemini image model AS-IS, store the bytes in R2,
 * and append the result to that tweet's `media[]`. Used by both the webapp
 * per-slot endpoint and the bot fast flows.
 *
 * The image AI receives ONLY: the `/image-gen` skill, the user's identity, the
 * tweet text, and the source context (commit/repo facts for commits, original
 * tweet for reposts). No visual-theme or other styling steering is injected —
 * the model decides the image.
 */

import type { Env, Draft, DraftContent, TweetMedia, RepoOverview } from '../types';
import { assembleSystemInstruction } from './prompts';
import { callLLMText, generateGeminiImage, GeminiImageError } from './gemini';
import { getDraft, appendTweetMedia, resolveTweetIndex, ensureStableTweetId } from '../data/draft-db';
import { getContentSource } from '../integrations/github';
import { getRepoByOwnerRepo, getRepoOverview } from '../data/repo-db';
import { getTweetById } from '../integrations/x';
import { getUserLanguage } from '../data/user-settings-db';
import { logInfo, logError, isValidImageContentType, isValidFileSize } from '../infra/security';

/** Error carrying an HTTP-ish status so the route can map it cleanly. */
export class TweetImageError extends Error {
    status: number;
    constructor(message: string, status: number) {
        super(message);
        this.name = 'TweetImageError';
        this.status = status;
    }
}

export interface GeneratedTweetImage {
    /** The new media reference appended to the tweet. */
    media: TweetMedia;
    /** The updated draft content (with media appended), already persisted. */
    content: DraftContent;
    /** The resolved STABLE tweet id the image was attached to (never a numeric index string), so the
     *  editor binds the generated media to a durable id instead of a position. */
    tweetId: string;
}

/**
 * Generate an AI image for a tweet in `draftId`, attach it to that tweet's media, persist the draft,
 * and return the new media + updated content. `tweetRef` keys the tweet by stable `id` (string) OR a
 * legacy array index (number for internal callers, numeric-string accepted via resolveTweetIndex) —
 * media binds to tweet identity, so the slot is resolved to an index internally.
 * Throws TweetImageError (with status) on missing draft, unresolvable tweet, malformed model output,
 * or image-model failure. Does NOT drive bot sync — the caller (webapp route) fires syncBotMessage.
 */
export async function generateTweetImage(
    env: Env,
    chatId: string,
    draftId: string,
    tweetRef: string | number,
): Promise<GeneratedTweetImage> {
    // 1. Load + own the draft
    const draft = await getDraft(env, draftId, chatId);
    if (!draft) throw new TweetImageError('Draft not found', 404);

    // 2. Parse content + resolve the tweet slot by id (or legacy index)
    let content: DraftContent;
    try {
        content = JSON.parse(draft.content) as DraftContent;
    } catch {
        throw new TweetImageError('Draft content is not valid JSON', 500);
    }
    if (!Array.isArray(content.tweets)) {
        throw new TweetImageError('Invalid tweet index', 400);
    }
    const tweetIndex = typeof tweetRef === 'number'
        ? (Number.isInteger(tweetRef) && tweetRef >= 0 && tweetRef < content.tweets.length ? tweetRef : -1)
        : resolveTweetIndex(content, tweetRef);
    if (tweetIndex < 0) {
        throw new TweetImageError('Invalid tweet index', 400);
    }
    const tweet = content.tweets[tweetIndex];

    // Resolve (and persist for legacy id-less tweets) the STABLE tweet id up front — before the
    // expensive prompt/image calls — so we can return it. Without this the image endpoint would echo
    // back the client's raw ref (possibly a numeric-index string), the editor would adopt that as the
    // tweet's id, and a later text save would mis-reconcile and drop the freshly generated image.
    const tweetId = await ensureStableTweetId(env, draft, content, tweetIndex, chatId);
    if (!tweetId) throw new TweetImageError('Invalid tweet index', 400);

    // 3. Resolve language and assemble the inputs (skill + identity, tweet + source context)
    const lang = await getUserLanguage(env, chatId);
    const systemInstruction = await assembleSystemInstruction(env, chatId, 'image-gen', lang);
    const userPrompt = await buildImageUserPrompt(env, chatId, draft, tweet.text ?? '');

    // 4. LLM → a single JSON image prompt
    logInfo('[tweet-image] requesting image prompt — draft', draftId, 'tweet', tweetIndex);
    const responseText = await callLLMText(env, systemInstruction, userPrompt);
    const promptObject = parseImagePromptJson(responseText);

    // 5. Send the JSON prompt to the image model AS-IS (no prose flattening).
    //    Generate at 2K (~2-3MB): sharp enough for social, and under Telegram's 5MB
    //    sendPhoto-by-URL limit so the bot-message sync can attach it (4K is ~9MB).
    const promptJson = JSON.stringify(promptObject);
    let image;
    try {
        image = await generateGeminiImage(env, [{ text: promptJson }], { imageSize: '2K' });
    } catch (err) {
        if (err instanceof GeminiImageError) {
            const detail = err.detail?.substring(0, 300) || err.message;
            throw new TweetImageError(`Image generation failed: ${detail}`, err.status ?? 502);
        }
        throw new TweetImageError(
            `Image generation failed: ${err instanceof Error ? err.message : String(err)}`,
            502,
        );
    }

    // 6. Validate + store in R2 under the webapp media key convention
    if (!isValidImageContentType(image.mimeType)) {
        throw new TweetImageError(`Invalid generated image type: ${image.mimeType}`, 502);
    }
    if (!isValidFileSize(image.data.byteLength)) {
        throw new TweetImageError('Generated image exceeds the size limit', 502);
    }
    const ext = image.mimeType.includes('png') ? 'png' : image.mimeType.includes('webp') ? 'webp' : 'jpg';
    const key = `webapp/${chatId}/${Date.now()}-${crypto.randomUUID().substring(0, 8)}.${ext}`;
    await env.IMAGES.put(key, image.data, { httpMetadata: { contentType: image.mimeType } });
    logInfo('[tweet-image] stored image in R2:', key, 'bytes', image.data.byteLength);

    // 7. Append to the tweet's media[] and persist (never writes draft.image_url).
    // Persist via an ATOMIC single-statement append (json_set/json_insert) rather than a
    // read-whole-content / write-whole-content cycle, so two generations overlapping in time
    // cannot clobber each other's media (see appendTweetMedia for the concurrency rationale).
    // No `targets` ⇒ all-on (isMediaTargeted defaults to true). A freshly generated image should
    // go everywhere by default; the user narrows it via the per-media pills in the composer.
    const media: TweetMedia = { key, type: 'photo' };
    const persisted = await appendTweetMedia(env, draftId, chatId, tweetIndex, media);
    if (!persisted) throw new TweetImageError('Draft not found', 404);

    // Mirror the append onto our in-memory copy for the return value only — callers use `content`
    // for local editor state / bot render; the persisted source of truth was written atomically
    // above (this copy may lag on OTHER tweets touched concurrently, which is fine for that use).
    tweet.media = [...(tweet.media ?? []), media];
    content.tweets[tweetIndex] = tweet;

    return { media, content, tweetId };
}

/**
 * Build the user message: the tweet text plus source-derived context.
 * - handwrite: tweet text only
 * - commit:    + commit message + repo overview (factual fields), reconstructed from commit_sha
 * - repost:    + original tweet text, reconstructed from original_tweet_id
 * Context reconstruction is best-effort: failures are logged and skipped, never fatal.
 */
async function buildImageUserPrompt(
    env: Env,
    chatId: string,
    draft: Draft,
    tweetText: string,
): Promise<string> {
    const parts: string[] = [`Tweet:\n${tweetText}`];

    if (draft.source === 'commit' && draft.commit_sha) {
        try {
            const source = await getContentSource(env, draft.commit_sha);
            if (source.type === 'commit') {
                const c = source.data;
                const message = [c.title, c.body].filter(Boolean).join('\n').trim();
                if (message) parts.push(`Commit message:\n${message}`);
                else if (c.commitMessages?.length) parts.push(`Commit messages:\n${c.commitMessages.join('\n')}`);
            }
            const overviewText = await loadRepoOverviewContext(env, chatId, source.repo);
            if (overviewText) parts.push(`Repository overview:\n${overviewText}`);
        } catch (err) {
            logError('[tweet-image] commit context reconstruction failed:', err instanceof Error ? err.message : String(err));
        }
    } else if (draft.source === 'repost' && draft.original_tweet_id) {
        try {
            const original = await getTweetById(env, draft.original_tweet_id);
            if (original?.tweet.text) parts.push(`Original tweet being reposted:\n${original.tweet.text}`);
        } catch (err) {
            logError('[tweet-image] repost context reconstruction failed:', err instanceof Error ? err.message : String(err));
        }
    }

    return parts.join('\n\n');
}

/** Resolve a repo overview from a commit's `owner/repo` full name and format its factual fields. */
async function loadRepoOverviewContext(env: Env, chatId: string, repoFullName?: string): Promise<string | null> {
    if (!repoFullName) return null;
    const [owner, repo] = repoFullName.split('/');
    if (!owner || !repo) return null;
    const watched = await getRepoByOwnerRepo(env, chatId, owner, repo);
    if (!watched) return null;
    const overview = await getRepoOverview(env, watched.id);
    if (!overview) return null;
    return formatOverviewFacts(overview);
}

/**
 * Format the factual subject fields of a repo overview (what the project IS).
 * Deliberately excludes `visual_theme` and `brand_voice` — those are "how it
 * should look/sound" styling directives, and image styling is owned by the
 * skill + identity, not injected here.
 */
function formatOverviewFacts(overview: RepoOverview): string {
    const lines: string[] = [];
    if (overview.summary) lines.push(`Summary: ${overview.summary}`);
    if (overview.tech_stack) lines.push(`Tech stack: ${overview.tech_stack}`);
    if (overview.key_features?.length) lines.push(`Key features: ${overview.key_features.join(', ')}`);
    if (overview.target_audience) lines.push(`Target audience: ${overview.target_audience}`);
    return lines.join('\n');
}

/**
 * Parse the LLM response into an opaque JSON object. Strips a markdown code
 * fence if present, extracts the first object, and requires a non-array object.
 * Throws TweetImageError(422) on anything malformed — no typed-fallback prompt.
 */
function parseImagePromptJson(text: string): Record<string, unknown> {
    let cleaned = text;
    const fence = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
    if (fence) cleaned = fence[1];

    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) throw new TweetImageError('Model did not return a JSON image prompt', 422);

    let parsed: unknown;
    try {
        parsed = JSON.parse(match[0]);
    } catch {
        throw new TweetImageError('Model returned a malformed JSON image prompt', 422);
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new TweetImageError('Model image prompt is not a JSON object', 422);
    }
    return parsed as Record<string, unknown>;
}
