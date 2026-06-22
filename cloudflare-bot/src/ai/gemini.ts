/**
 * AI Service - Content and image generation via Gemini + multi-provider routing
 *
 * SECURITY: Uses secure logging and sanitizes API error responses
 */

import type { Env, ContentSource, DraftContent, RepoOverview, OverviewPatch, ContentResponse, VideoScriptResponse, VideoScene, HeyGenEmotion } from '../types';
import { logInfo, logError, sanitizeContent } from '../infra/security';
import { getRepoOverview } from '../data/db';
import { getPrompt, assembleSystemInstruction } from './prompts';
import { buildPromptSections } from './prompt-utils';
import { callClaudeText } from './claude';

const GEMINI_API = 'https://generativelanguage.googleapis.com/v1beta';
const GEMINI_TEXT_MODEL = 'gemini-3.1-pro-preview';
const GEMINI_IMAGE_MODEL = 'gemini-3-pro-image-preview';

// System prompts are now stored in DB — resolved via getPrompt() from ai/prompts.ts

/**
 * Extract a structured overview from README + PR data
 */
export async function extractRepoOverview(
    env: Env,
    readmeText: string | null,
    prSummaries: { title: string; body: string }[],
    chatId?: string,
    language?: string,
): Promise<{
    summary: string | null;
    tech_stack: string | null;
    key_features: string[];
    target_audience: string | null;
    brand_voice: string | null;
    visual_theme: string | null;
    recent_changes: string[];
}> {
    const readmeSection = readmeText
        ? `## README\n\n${readmeText.substring(0, 8000)}`
        : '## README\n\nNo README available.';

    const prSection = prSummaries.length > 0
        ? `## Recent Merged PRs\n\n${prSummaries.map(pr => `- **${pr.title}**: ${pr.body.substring(0, 200)}`).join('\n')}`
        : '## Recent Merged PRs\n\nNo recent PRs available.';

    const userPrompt = `${readmeSection}\n\n${prSection}`;

    const overviewPrompt = await assembleSystemInstruction(env, chatId || '', 'know-my-project', language || 'en');
    const responseText = await callLLMText(env, overviewPrompt, userPrompt);

    try {
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error('No JSON in extraction response');

        const parsed = JSON.parse(jsonMatch[0]);
        return {
            summary: parsed.summary || null,
            tech_stack: parsed.tech_stack || null,
            key_features: Array.isArray(parsed.key_features) ? parsed.key_features.slice(0, 10) : [],
            target_audience: parsed.target_audience || null,
            brand_voice: parsed.brand_voice || null,
            visual_theme: parsed.visual_theme || null,
            recent_changes: Array.isArray(parsed.recent_changes) ? parsed.recent_changes.slice(0, 10) : [],
        };
    } catch (error) {
        logError('Overview extraction parse error:', error instanceof Error ? error.message : String(error));
        return {
            summary: null,
            tech_stack: null,
            key_features: [],
            target_audience: null,
            brand_voice: null,
            visual_theme: null,
            recent_changes: [],
        };
    }
}

/**
 * Options for generateContent — user context from compose mode
 */
export interface GenerateContentOptions {
    userTweets?: string[];
    instruction?: string;
    userImageParts?: ImagePart[];
}

/**
 * Generate tweet content from a content source (PR or commit)
 * If repoId is provided, fetches the repo overview from D1 to enrich the prompt.
 * Optional compose-mode options support user tweets, instructions, and image analysis.
 */
export async function generateContent(env: Env, source: ContentSource, repoId?: string, language?: string, chatId?: string, options?: GenerateContentOptions): Promise<ContentResponse> {
    // Fetch overview if repoId is provided
    let overview: RepoOverview | null = null;
    if (repoId) {
        try {
            overview = await getRepoOverview(env, repoId);
        } catch (e) {
            logError('Failed to fetch repo overview:', e instanceof Error ? e.message : String(e));
        }
    }

    const prompt = buildContentPrompt(source, overview, language, options);
    const contentSystemPrompt = await assembleSystemInstruction(env, chatId || '', 'work-progress', language || 'en');

    // Build multimodal prompt when user images are present
    let userPrompt: string | Array<{ text: string } | ImagePart>;
    if (options?.userImageParts && options.userImageParts.length > 0) {
        userPrompt = [
            { text: prompt },
            ...options.userImageParts,
            { text: '\nI\'m attaching these images as context for my content.' },
        ];
    } else {
        userPrompt = prompt;
    }

    const responseText = await callLLMText(env, contentSystemPrompt, userPrompt, {
        tools: [{ googleSearch: {} }],
    });
    const result = parseContentResponse(responseText);
    return result;
}

export interface GeminiOptions {
    temperature?: number;
    jsonMode?: boolean;
    tools?: Array<Record<string, unknown>>;
}

/**
 * Call Gemini text model with system instruction and user prompt.
 * userPrompt accepts a string or an array of parts (for multimodal content).
 */
export async function callGeminiText(
    env: Env,
    systemPrompt: string,
    userPrompt: string | Array<{ text: string } | { inline_data: { mime_type: string; data: string } }>,
    options?: GeminiOptions,
): Promise<string> {
    const temperature = options?.temperature ?? 0.7;
    // Gemini does NOT allow responseMimeType:'application/json' (structured output) together with
    // tools like googleSearch (grounding) — the combination degrades the output (empty/truncated
    // JSON). When grounding is on, drop JSON mode and rely on the prompt-instructed format +
    // parseContentResponse's extraction/repair instead.
    const jsonMode = (options?.jsonMode ?? true) && !options?.tools?.length;

    const parts = typeof userPrompt === 'string' ? [{ text: userPrompt }] : userPrompt;

    const url = `${GEMINI_API}/models/${GEMINI_TEXT_MODEL}:generateContent?key=${env.GOOGLE_API_KEY}`;

    const body: Record<string, unknown> = {
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts }],
        generationConfig: {
            temperature,
            maxOutputTokens: 65536,
            ...(jsonMode ? { responseMimeType: 'application/json' } : {}),
            thinkingConfig: {
                thinkingBudget: 8000,
            },
        },
    };

    if (options?.tools) {
        body.tools = options.tools;
    }

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });

    if (!response.ok) {
        const errText = await response.text();
        logError('Gemini API failed:', response.status, errText.substring(0, 200));
        throw new Error('Content generation failed. Please try again.');
    }

    const data = await response.json() as {
        candidates?: Array<{
            content?: { parts?: Array<{ text?: string; thought?: boolean }> };
            finishReason?: string;
        }>;
        usageMetadata?: Record<string, unknown>;
    };

    const candidate = data.candidates?.[0];
    const allParts = candidate?.content?.parts || [];

    // Log full response structure for debugging
    logInfo('[gemini] finishReason:', candidate?.finishReason,
        'totalParts:', allParts.length,
        'partTypes:', allParts.map((p, i) => `${i}:${p.thought ? 'thought' : 'text'}(${p.text?.length || 0})`).join(', '),
        'usage:', JSON.stringify(data.usageMetadata));

    if (candidate?.finishReason === 'MAX_TOKENS') {
        logError('[gemini] ⚠️ Response TRUNCATED (MAX_TOKENS). Output may be incomplete.');
    }

    // Concatenate ALL non-thought text parts. Grounded responses (googleSearch tool) and long
    // outputs can be split across multiple text parts; taking only the FIRST truncates the answer
    // — commonly dropping the trailing closing brace, which then breaks JSON parsing downstream.
    const textParts = allParts.filter(p => !p.thought && typeof p.text === 'string');
    let text = textParts.map(p => p.text).join('');

    if (!text) {
        // Last resort: no non-thought text — join whatever text parts exist (may include thinking).
        text = allParts.filter(p => typeof p.text === 'string').map(p => p.text).join('');
        logError('[gemini] No non-thought text part found.',
            'thoughtParts:', allParts.filter(p => p.thought).length,
            'textParts:', textParts.length,
            'usingFallback:', !!text,
            'firstPartPreview:', allParts[0]?.text?.substring(0, 300));
    }

    if (!text) {
        throw new Error('No content generated');
    }

    logInfo('[gemini] response length:', text.length, 'preview:', text.substring(0, 500));

    return text;
}

/**
 * Multi-provider LLM text router.
 * Reads env.AI_PROVIDER and dispatches to the correct provider.
 * Translates tool specs between provider formats.
 */
export async function callLLMText(
    env: Env,
    systemPrompt: string,
    userPrompt: string | Array<{ text: string } | { inline_data: { mime_type: string; data: string } }>,
    options?: GeminiOptions,
): Promise<string> {
    const provider = env.AI_PROVIDER || 'gemini';
    logInfo('[llm-router] provider:', provider, 'hasTools:', !!(options?.tools?.length));

    if (provider === 'claude') {
        if (!env.CLAUDE_API_KEY) {
            throw new Error('Claude API key not configured. Please add your Claude API key in Settings → Platforms → API Keys.');
        }

        // Translate tools: googleSearch → web_search for Claude
        let translatedOptions = options;
        if (options?.tools) {
            const translatedTools = options.tools.map(tool => {
                if ('googleSearch' in tool) {
                    return { type: 'web_search_20250305', name: 'web_search' };
                }
                return tool;
            });
            translatedOptions = { ...options, tools: translatedTools };
        }

        return callClaudeText(env, systemPrompt, userPrompt, translatedOptions);
    }

    // Default: Gemini
    return callGeminiText(env, systemPrompt, userPrompt, options);
}

/**
 * Validate a Gemini API key by making a lightweight test call.
 */
export async function validateGeminiKey(key: string): Promise<boolean> {
    const url = `${GEMINI_API}/models/${GEMINI_TEXT_MODEL}:generateContent?key=${key}`;
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: 'Say "hello" in one word.' }] }] }),
    });
    return response.ok;
}

/**
 * Parse content response from Gemini into DraftContent and optional overviewUpdates
 */
/**
 * Append the closing brackets/braces needed to balance a truncated JSON string. Walks the string
 * tracking string literals/escapes so braces inside text aren't counted, then closes any still-open
 * `{`/`[` (and a dangling string). Best-effort recovery for LLM output cut off before it finished.
 */
function balanceBrackets(s: string): string {
    const stack: string[] = [];
    let inStr = false;
    let esc = false;
    for (let i = 0; i < s.length; i++) {
        const ch = s[i];
        if (inStr) {
            if (esc) esc = false;
            else if (ch === '\\') esc = true;
            else if (ch === '"') inStr = false;
        } else if (ch === '"') inStr = true;
        else if (ch === '{') stack.push('}');
        else if (ch === '[') stack.push(']');
        else if (ch === '}' || ch === ']') stack.pop();
    }
    let out = s;
    if (inStr) out += '"';
    while (stack.length) out += stack.pop();
    return out;
}

/**
 * Parse the extracted JSON; if that fails (commonly a truncated response missing trailing braces),
 * re-extract from the first `{` of the full cleaned text and balance the brackets before retrying.
 * Throws if neither parses, so the caller's fallback still runs.
 */
function parseJsonWithRepair(primary: string, full: string): any {
    try {
        return JSON.parse(primary);
    } catch {
        const start = full.indexOf('{');
        if (start === -1) throw new Error('no object start');
        const repaired = balanceBrackets(full.slice(start));
        const parsed = JSON.parse(repaired);
        logInfo('[parse] recovered truncated JSON via bracket balancing');
        return parsed;
    }
}

function parseContentResponse(content: string): ContentResponse {
    logInfo('[parse] input length:', content.length, 'preview:', content.substring(0, 300));

    // Strip markdown code fences before extraction
    let cleaned = content;
    const fenceMatch = content.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
    if (fenceMatch) {
        cleaned = fenceMatch[1];
        logInfo('[parse] stripped code fence, inner length:', cleaned.length);
    }

    // Extract JSON from response
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
        logError('[parse] No JSON found in response, first 500 chars:', content.substring(0, 500));
        const fallbackContent: DraftContent = {
            format: 'single',
            tweets: [{ text: content.replace(/```[\s\S]*?```/g, '').trim(), index: 0 }],
        };
        return { content: fallbackContent, overviewUpdates: null };
    }

    logInfo('[parse] JSON match length:', jsonMatch[0].length, 'starts:', jsonMatch[0].substring(0, 100));

    try {
        const parsed = parseJsonWithRepair(jsonMatch[0], cleaned);

        // Reject missing structure AND empty/all-blank generations (e.g. {"tweets":[]}) — those must
        // not become a silent empty draft; fall through to the raw-text fallback so something shows.
        const hasContent = Array.isArray(parsed.tweets)
            && parsed.tweets.some((t: { text?: string }) => typeof t?.text === 'string' && t.text.trim().length > 0);
        if (!parsed.format || !hasContent) {
            logError('[parse] Invalid/empty structure — format:', parsed.format, 'tweets type:', typeof parsed.tweets,
                'tweetCount:', Array.isArray(parsed.tweets) ? parsed.tweets.length : 'n/a',
                'top-level keys:', Object.keys(parsed).join(', '));
            throw new Error('Invalid content structure');
        }

        const draftContent: DraftContent = {
            format: parsed.format,
            tweets: parsed.tweets.map((t: { text: string }, i: number) => ({
                text: t.text,
                index: i,
            })),
        };

        logInfo('[parse] ✅ parsed OK — format:', parsed.format, 'tweets:', parsed.tweets.length,
            'hasOverviewUpdates:', !!parsed.overviewUpdates);

        // Extract overviewUpdates if present
        let overviewUpdates: OverviewPatch | null = null;
        if (parsed.overviewUpdates && typeof parsed.overviewUpdates === 'object') {
            overviewUpdates = parsed.overviewUpdates as OverviewPatch;
        }

        return { content: draftContent, overviewUpdates };
    } catch (parseError) {
        logError('[parse] ❌ JSON parse failed:', parseError instanceof Error ? parseError.message : String(parseError),
            'match length:', jsonMatch[0].length,
            'match start:', jsonMatch[0].substring(0, 200),
            'match end:', jsonMatch[0].substring(jsonMatch[0].length - 200));
        const fallbackContent: DraftContent = {
            format: 'single',
            tweets: [{ text: content.replace(/```[\s\S]*?```/g, '').trim(), index: 0 }],
        };
        return { content: fallbackContent, overviewUpdates: null };
    }
}

/**
 * Unified refine/edit — handles both "rewrite in my voice" (no instruction)
 * and "change it like [instruction]" (with instruction) modes.
 * Also handles optional image-gen attachment.
 */
export type ImagePart = { inline_data: { mime_type: string; data: string } };

export async function refineContent(
    env: Env,
    content: DraftContent,
    options: {
        instruction?: string;
        chatId?: string;
        language?: string;
        imageParts?: ImagePart[];
    },
): Promise<DraftContent> {
    const lang = options.language || 'en';
    const cId = options.chatId || '';
    const tweetsText = content.tweets.map((t, i) => `Tweet ${i + 1}: ${t.text}`).join('\n');

    // Build system instruction with identity (text refinement only — image generation is per-slot)
    const systemPrompt = await assembleSystemInstruction(env, cId, 'refine', lang);

    // Build user prompt — instruction framed as self-directed if present
    let userPromptText: string;
    if (options.instruction && content.tweets.length === 0) {
        userPromptText = `I want to create content like this: ${options.instruction}`;
    } else if (options.instruction) {
        userPromptText = `Here's a draft. I want to change it like this: ${options.instruction}\n\n${tweetsText}`;
    } else {
        userPromptText = `Here's a draft. I want to rewrite it in my own voice.\n\n${tweetsText}`;
    }

    // Force the output language explicitly (the loaded prompt version alone doesn't guarantee it).
    userPromptText += languageDirective(lang);

    // If image parts provided, build multimodal prompt with tweet-image mapping
    let userPrompt: string | Array<{ text: string } | ImagePart>;
    if (options.imageParts && options.imageParts.length > 0) {
        const mapping = buildImageMapping(content.tweets);
        if (mapping) userPromptText += `\n\n${mapping}`;
        userPromptText += '\n\nI\'m attaching these images as reference for my refinement.';
        userPrompt = [{ text: userPromptText }, ...options.imageParts];
    } else {
        userPrompt = userPromptText;
    }

    const responseText = await callLLMText(env, systemPrompt, userPrompt, {
        tools: [{ googleSearch: {} }],
    });
    const result = parseContentResponse(responseText).content;
    return result;
}

/** Map which images belong to which tweets for the multimodal prompt */
function buildImageMapping(tweets: DraftContent['tweets']): string {
    const lines: string[] = [];
    let imageIndex = 1;
    for (let i = 0; i < tweets.length; i++) {
        const photoCount = tweets[i].media?.filter(m => m.type === 'photo').length || 0;
        if (photoCount > 0) {
            const refs = Array.from({ length: photoCount }, (_, j) => `Image ${imageIndex + j}`).join(', ');
            lines.push(`Tweet ${i + 1} has attached: ${refs}`);
            imageIndex += photoCount;
        }
    }
    return lines.length > 0 ? `Image-tweet mapping:\n${lines.join('\n')}` : '';
}

/**
 * Build multimodal image parts from tweet media for Gemini analysis.
 * Fetches images from R2, base64-encodes them, and returns inline_data parts.
 */
export async function buildImageParts(
    env: Env,
    tweets: DraftContent['tweets'],
): Promise<ImagePart[]> {
    const parts: ImagePart[] = [];

    for (const tweet of tweets) {
        for (const media of tweet.media || []) {
            if (media.type !== 'photo') continue;
            try {
                const obj = await env.IMAGES.get(media.key);
                if (!obj) continue;
                const buffer = await obj.arrayBuffer();
                const bytes = new Uint8Array(buffer);
                let binary = '';
                for (let i = 0; i < bytes.length; i++) {
                    binary += String.fromCharCode(bytes[i]);
                }
                const base64 = btoa(binary);
                const mimeType = obj.httpMetadata?.contentType || 'image/jpeg';
                parts.push({ inline_data: { mime_type: mimeType, data: base64 } });
            } catch (err) {
                logError('buildImageParts: failed to fetch image:', media.key, err instanceof Error ? err.message : String(err));
            }
        }
    }

    return parts;
}

/** @deprecated Use refineContent() instead */
export async function editContent(
    env: Env,
    currentContent: DraftContent,
    instruction: string,
    chatId?: string,
    language?: string,
): Promise<DraftContent> {
    return refineContent(env, currentContent, { instruction, chatId, language });
}

// ==================== RESILIENT GEMINI IMAGE GENERATION ====================

/** A request part for Gemini image generation: a text part or an inline image. */
export type GeminiImagePart = { text: string } | { inline_data: { mime_type: string; data: string } };

/** Decoded final image returned by the resilient helper. */
export interface GeminiImageResult { data: Uint8Array<ArrayBuffer>; mimeType: string; }

/** Error thrown when image generation fails (after retries, or on a terminal client error). */
export class GeminiImageError extends Error {
    status?: number;
    detail: string;
    constructor(message: string, status: number | undefined, detail: string) {
        super(message);
        this.name = 'GeminiImageError';
        this.status = status;
        this.detail = detail;
    }
}

/** Response part shape from v1beta REST (camelCase `inlineData`, optional `thought` flag). */
interface GeminiResponsePart {
    text?: string;
    thought?: boolean;
    inlineData?: { mimeType: string; data: string };
}

const TRANSIENT_IMAGE_STATUSES = new Set([429, 500, 502, 503]);
const DEFAULT_IMAGE_ATTEMPTS = 3;

function isTransientStatus(status: number): boolean {
    return TRANSIENT_IMAGE_STATUSES.has(status);
}

/**
 * Pick the FINAL image from a Gemini response. Gemini 3 image responses may include
 * intermediate "thinking"/draft frames (`thought: true`); the intended result is the last
 * non-thought image part. Falls back to the last image part overall when no thought flags
 * are present. Returns decoded bytes + normalized MIME, or null if no image part exists.
 */
function extractFinalImage(parts: GeminiResponsePart[]): GeminiImageResult | null {
    const imageParts = parts.filter(p => p.inlineData);
    if (imageParts.length === 0) return null;
    const nonThought = imageParts.filter(p => p.thought !== true);
    const pool = nonThought.length > 0 ? nonThought : imageParts;
    const inlineData = pool[pool.length - 1].inlineData!;

    const binaryStr = atob(inlineData.data);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
    }
    let mimeType = inlineData.mimeType || 'image/jpeg';
    if (mimeType === 'application/octet-stream') mimeType = 'image/jpeg';
    return { data: bytes, mimeType };
}

/** Short exponential backoff, honoring a `Retry-After` header (seconds) when present, both clamped. */
async function imageBackoff(attempt: number, retryAfter?: string | null): Promise<void> {
    let ms = Math.min(500 * 2 ** (attempt - 1), 4000);
    if (retryAfter) {
        const secs = Number.parseInt(retryAfter, 10);
        if (!Number.isNaN(secs) && secs > 0) ms = Math.min(secs * 1000, 5000);
    }
    await new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Resilient Gemini image generation — the single entry point for every image call site.
 * Retries transient failures (429/500/502/503 and fetch errors) with bounded backoff,
 * downgrades 4K→2K on the first retry (cheaper + more likely to succeed), fails fast on
 * client errors, and returns the final (non-draft) image. Throws GeminiImageError on failure.
 */
export async function generateGeminiImage(
    env: Env,
    parts: GeminiImagePart[],
    opts?: { imageSize?: '4K' | '2K' | '1K'; maxAttempts?: number },
): Promise<GeminiImageResult> {
    const maxAttempts = opts?.maxAttempts ?? DEFAULT_IMAGE_ATTEMPTS;
    let size: '4K' | '2K' | '1K' = opts?.imageSize ?? '4K';
    const url = `${GEMINI_API}/models/${GEMINI_IMAGE_MODEL}:generateContent?key=${env.GOOGLE_API_KEY}`;
    let lastStatus: number | undefined;
    let lastDetail = '';

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        // Downgrade heavy 4K to 2K on retries (never below 2K, never back up to 4K)
        if (attempt >= 2 && size === '4K') size = '2K';

        let response: Response;
        try {
            response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts }],
                    generationConfig: {
                        responseModalities: ['IMAGE', 'TEXT'],
                        imageConfig: { imageSize: size },
                    },
                }),
            });
        } catch (fetchErr) {
            // Network/fetch failure — transient
            lastStatus = undefined;
            lastDetail = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
            logError('Gemini image fetch error (attempt', attempt, 'of', maxAttempts, '):', lastDetail);
            if (attempt < maxAttempts) { await imageBackoff(attempt); continue; }
            break;
        }

        if (response.ok) {
            const result = await response.json() as { candidates?: [{ content?: { parts?: GeminiResponsePart[] } }] };
            const respParts = result.candidates?.[0]?.content?.parts ?? [];
            const image = extractFinalImage(respParts);
            if (image) {
                logInfo('Gemini image generated (attempt', attempt, 'size', size, 'bytes', image.data.length, ')');
                return image;
            }
            // OK response but no image part (e.g. text-only/safety) — won't improve on retry
            const textParts = respParts.filter(p => p.text).map(p => p.text).join(' ');
            throw new GeminiImageError('No image in Gemini response', response.status, textParts || 'No image in response');
        }

        lastStatus = response.status;
        lastDetail = (await response.text()).substring(0, 300);
        if (isTransientStatus(response.status)) {
            logError('Gemini image transient error (attempt', attempt, 'of', maxAttempts, '):', response.status, lastDetail.substring(0, 200));
            if (attempt < maxAttempts) { await imageBackoff(attempt, response.headers.get('Retry-After')); continue; }
            break;
        }
        // Terminal client error (400/401/403/404/...) — fail fast, no retry
        throw new GeminiImageError(`Gemini image generation failed: ${response.status}`, response.status, lastDetail);
    }

    throw new GeminiImageError(`Gemini image generation failed after ${maxAttempts} attempts`, lastStatus, lastDetail);
}

/**
 * Refine handwritten content (text only). Image generation is no longer part of
 * this path — it is a per-slot action (see ai/tweet-image.ts). When refineText is
 * false there is nothing to do and the content is returned unchanged.
 */
export async function refineHandwrittenContent(
    env: Env,
    content: DraftContent,
    options: { refineText: boolean; instruction?: string; imageParts?: ImagePart[] },
    language?: string,
    chatId?: string,
): Promise<DraftContent> {
    if (!options.refineText) return content;

    return refineContent(env, content, {
        instruction: options.instruction,
        imageParts: options.imageParts,
        chatId,
        language,
    });
}

/**
 * Build the prompt for content generation
 * SECURITY: Sanitizes input content to prevent prompt injection and excessive size
 * Sends ONLY commit messages and file names — no title, body, author, or stats
 */
/**
 * Explicit output-language directive, written in self-address (first person) to match the rest of
 * the prompts and the identity voice. The selected language only chooses which prompt VERSION loads
 * (identity/skill); without this the model writes in whatever language the identity or the source
 * content is in (so a Hebrew commit stayed Hebrew even when English was selected). Stated in the
 * target language and at the end so it's the strongest, freshest rule.
 */
export function languageDirective(language?: string): string {
    const isHebrew = (language || 'en').toLowerCase().startsWith('he');
    return isHebrew
        ? '\n\nאני כותב את כל הפוסט הזה בעברית בלבד — לא משנה באיזו שפה כתובים הקומיטים, הקבצים, הזהות שלי או כל הקשר אחר.'
        : '\n\nI write this entire post in English only — no matter what language the commits, files, my identity, or any other context are in.';
}

function buildContentPrompt(source: ContentSource, overview?: RepoOverview | null, language?: string, options?: GenerateContentOptions): string {
    const { data } = source;

    // Send the FULL message of every commit, uncapped (sanitized, not truncated),
    // so the AI sees everything. For a single commit that's one full message;
    // for a PR it's every commit's full message, separated so commit boundaries
    // stay distinguishable. Works the same for the Fast and Edit/compose paths
    // since both carry the messages via `commitMessages`.
    const safeCommitMessages = data.commitMessages
        .map(msg => sanitizeContent(msg, Number.MAX_SAFE_INTEGER))
        .join('\n\n- ');

    // Sanitize file names
    const safeFileNames = data.fileNames
        .map(f => sanitizeContent(f, 200))
        .join('\n- ');

    // Build overview section if available
    let overviewSection = '';
    if (overview) {
        const parts: string[] = ['## PROJECT OVERVIEW'];
        if (overview.summary) parts.push(`**Summary:** ${overview.summary}`);
        if (overview.tech_stack) parts.push(`**Tech Stack:** ${overview.tech_stack}`);
        if (overview.key_features.length > 0) parts.push(`**Key Features:** ${overview.key_features.join(', ')}`);
        if (overview.target_audience) parts.push(`**Target Audience:** ${overview.target_audience}`);
        if (overview.brand_voice) parts.push(`**Brand Voice:** ${overview.brand_voice}`);
        if (overview.visual_theme) parts.push(`**Visual Theme:** ${overview.visual_theme}`);
        if (overview.recent_changes.length > 0) parts.push(`**Recent Changes:** ${overview.recent_changes.slice(-5).join('; ')}`);
        overviewSection = parts.join('\n') + '\n\n';
    }

    // Build user context sections (initial thoughts + instruction) from compose mode
    const userSections = options ? buildPromptSections({
        userTweets: options.userTweets,
        instruction: options.instruction,
    }) : '';

    return `${overviewSection}**Commits:**
- ${safeCommitMessages || 'No commit messages available'}

**Changed Files:**
- ${safeFileNames || 'No file names available'}

${userSections}${languageDirective(language)}`;
}

// ==================== VIDEO SCRIPT GENERATION ====================

/**
 * Length setting → target word count and scene count
 */
const LENGTH_CALIBRATION: Record<string, { words: number; minScenes: number; maxScenes: number }> = {
    '30s': { words: 70, minScenes: 1, maxScenes: 1 },
    '60s': { words: 160, minScenes: 1, maxScenes: 2 },
    '90s': { words: 240, minScenes: 2, maxScenes: 3 },
    '2m': { words: 320, minScenes: 2, maxScenes: 4 },
    '3m': { words: 480, minScenes: 3, maxScenes: 6 },
    '5m': { words: 800, minScenes: 5, maxScenes: 10 },
};

// VIDEO_SCRIPT_SYSTEM_PROMPT moved to DB — resolved via getPrompt()

interface VideoScriptOptions {
    overview?: RepoOverview | null;
    commitMessages?: string[];
    fileNames?: string[];
    tone: string;
    length: string;
    manualInstructions?: string;
    characterPersonality?: string;
    emotion: string;
    textOverlayEnabled: boolean;
}

/**
 * Generate a multi-scene video script via Gemini
 */
export async function generateVideoScript(
    env: Env,
    options: VideoScriptOptions,
    chatId?: string,
    language?: string,
): Promise<VideoScriptResponse> {
    const calibration = LENGTH_CALIBRATION[options.length] || LENGTH_CALIBRATION['60s'];

    const promptParts: string[] = [];

    // Project context
    if (options.overview) {
        const ov = options.overview;
        promptParts.push('## PROJECT CONTEXT');
        if (ov.summary) promptParts.push(`**Project:** ${ov.summary}`);
        if (ov.tech_stack) promptParts.push(`**Tech Stack:** ${ov.tech_stack}`);
        if (ov.key_features.length > 0) promptParts.push(`**Key Features:** ${ov.key_features.join(', ')}`);
        if (ov.target_audience) promptParts.push(`**Target Audience:** ${ov.target_audience}`);
        if (ov.brand_voice) promptParts.push(`**Brand Voice:** ${ov.brand_voice}`);
        promptParts.push('');
    }

    // Commit data
    if (options.commitMessages && options.commitMessages.length > 0) {
        promptParts.push('## RECENT CHANGES');
        promptParts.push('**Commits:**');
        for (const msg of options.commitMessages.slice(0, 20)) {
            promptParts.push(`- ${sanitizeContent(msg, 200)}`);
        }
        if (options.fileNames && options.fileNames.length > 0) {
            promptParts.push('**Changed Files:**');
            for (const f of options.fileNames.slice(0, 30)) {
                promptParts.push(`- ${sanitizeContent(f, 200)}`);
            }
        }
        promptParts.push('');
    }

    // Configuration
    promptParts.push('## VIDEO CONFIGURATION');
    promptParts.push(`**Tone:** ${options.tone}`);
    promptParts.push(`**Target Length:** ${options.length} (~${calibration.words} words)`);
    promptParts.push(`**Scene Count:** ${calibration.minScenes}-${calibration.maxScenes} scenes`);
    promptParts.push(`**Default Emotion:** ${options.emotion}`);
    promptParts.push(`**Text Overlays:** ${options.textOverlayEnabled ? 'Include short key phrases per scene' : 'Do NOT include text overlays'}`);
    if (options.characterPersonality) {
        promptParts.push(`**Presenter Personality:** ${options.characterPersonality}`);
    }
    promptParts.push('');

    // Manual instructions
    if (options.manualInstructions) {
        promptParts.push('## ADDITIONAL INSTRUCTIONS');
        promptParts.push(options.manualInstructions);
        promptParts.push('');
    }

    promptParts.push(`I want ${calibration.minScenes}-${calibration.maxScenes} scenes, targeting ~${calibration.words} total spoken words. Each scene should have 50-120 words.`);

    const userPrompt = promptParts.join('\n');
    const videoSystemPrompt = await assembleSystemInstruction(env, chatId || '', 'video', language || 'en');
    const responseText = await callLLMText(env, videoSystemPrompt, userPrompt);

    return parseAndValidateVideoScript(responseText, options, calibration);
}

/**
 * Parse and validate a video script response from Gemini
 */
function parseAndValidateVideoScript(
    responseText: string,
    options: VideoScriptOptions,
    calibration: { words: number; minScenes: number; maxScenes: number }
): VideoScriptResponse {
    // Extract JSON
    let jsonStr = responseText;
    const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) jsonStr = jsonMatch[1].trim();
    const braceStart = jsonStr.indexOf('{');
    const braceEnd = jsonStr.lastIndexOf('}');
    if (braceStart !== -1 && braceEnd > braceStart) {
        jsonStr = jsonStr.substring(braceStart, braceEnd + 1);
    }

    let parsed: any;
    try {
        parsed = JSON.parse(jsonStr);
    } catch {
        logError('Failed to parse video script JSON');
        throw new Error('Failed to parse video script response');
    }

    // Validate scenes
    if (!Array.isArray(parsed.scenes) || parsed.scenes.length === 0) {
        throw new Error('Video script has no scenes');
    }

    const validEmotions = ['Excited', 'Friendly', 'Serious', 'Soothing', 'Broadcaster'];
    const defaultEmotion = (options.emotion || 'Friendly') as HeyGenEmotion;

    const scenes: VideoScene[] = parsed.scenes.map((scene: any) => ({
        scriptText: String(scene.scriptText || ''),
        emotion: validEmotions.includes(scene.emotion) ? scene.emotion : defaultEmotion,
        motionPrompt: String(scene.motionPrompt || 'Avatar speaks naturally with subtle gestures'),
        textOverlay: options.textOverlayEnabled ? (scene.textOverlay || undefined) : undefined,
    }));

    // Validate non-empty scriptText
    for (const scene of scenes) {
        if (!scene.scriptText.trim()) {
            throw new Error('Video script contains empty scene');
        }
    }

    // Calculate word count
    const totalWordCount = scenes.reduce((sum, s) => sum + s.scriptText.split(/\s+/).length, 0);

    // Warn if word count deviates >30% from target
    const deviation = Math.abs(totalWordCount - calibration.words) / calibration.words;
    if (deviation > 0.3) {
        logInfo(`Video script word count deviation: ${totalWordCount} words vs ${calibration.words} target (${Math.round(deviation * 100)}%)`);
    }

    // Validate captions
    let caption = String(parsed.caption || '');
    if (caption.length > 2200) caption = caption.substring(0, 2200);

    const twitterCaption = String(parsed.twitterCaption || '');

    return {
        title: String(parsed.title || 'Untitled Video'),
        scenes,
        caption,
        twitterCaption,
        totalWordCount,
    };
}
