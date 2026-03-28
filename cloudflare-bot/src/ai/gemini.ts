/**
 * AI Service - Content and image generation via Gemini + multi-provider routing
 *
 * SECURITY: Uses secure logging and sanitizes API error responses
 */

import type { Env, ContentSource, DraftContent, ImagePromptData, RepoOverview, OverviewPatch, ContentResponse, VideoScriptResponse, VideoScene, HeyGenEmotion } from '../types';
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
 * Validate that an object matches the ImagePromptData shape
 */
function isValidImagePromptData(obj: unknown): obj is ImagePromptData {
    if (!obj || typeof obj !== 'object') return false;
    const o = obj as Record<string, unknown>;
    return (
        typeof o.concept === 'object' && o.concept !== null &&
        typeof o.composition === 'object' && o.composition !== null &&
        typeof o.environment === 'object' && o.environment !== null &&
        typeof o.technical === 'object' && o.technical !== null
    );
}

/**
 * Build a fallback ImagePromptData from tweet content
 */
function buildImagePrompt(content: DraftContent): ImagePromptData {
    const topic = content.tweets[0]?.text || 'software development';

    return {
        concept: {
            main_subject: `Visual metaphor inspired by: ${topic.substring(0, 100)}`,
            symbolic_elements: 'Organic forms suggesting growth and transformation — unfurling leaves, branching patterns, crystalline structures forming',
            mood: 'The quiet confidence of something well-crafted — precision meeting elegance',
        },
        composition: {
            style: 'Editorial illustration with influences from mid-century scientific diagrams — clean linework with rich color fills',
            perspective: 'Centered composition with generous negative space, golden ratio proportions',
            focal_point: 'A single striking central element surrounded by purposeful whitespace',
        },
        environment: {
            setting: 'Warm workshop atmosphere — a craftsperson\'s bench with tools of precision, rich wood grain textures, soft natural materials',
            lighting: 'Warm golden hour light from the left (3200K key), with soft cool fill (5500K) creating gentle dimensional shadows',
            color_palette: 'Warm ivory (space, breath), deep indigo (depth, intelligence), burnished copper (craft, warmth), sage green (growth, balance)',
        },
        technical: {
            medium: 'Mixed media — ink line drawing with watercolor washes and subtle gold leaf accents',
            quality: 'Hand-crafted feel with visible material texture, slight paper grain, intentional imperfection that conveys human touch',
            negative: 'Avoid generic stock-photo aesthetics, no neon, no circuit boards, no holographic effects',
        },
    };
}

/**
 * Options for generateContent — user context from compose mode
 */
export interface GenerateContentOptions {
    userTweets?: string[];
    instruction?: string;
    userImageParts?: ImagePart[];
    generateImagePrompt?: boolean;
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
    const attachImageGen = options ? (options.generateImagePrompt !== false) : true;
    const contentSystemPrompt = await assembleSystemInstruction(env, chatId || '', 'work-progress', language || 'en', { attachImageGen });

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

    // Strip imagePrompt when generateImagePrompt is explicitly false
    if (options?.generateImagePrompt === false && result.content.imagePrompt) {
        delete result.content.imagePrompt;
    }

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
    const jsonMode = options?.jsonMode ?? true;

    const parts = typeof userPrompt === 'string' ? [{ text: userPrompt }] : userPrompt;

    const url = `${GEMINI_API}/models/${GEMINI_TEXT_MODEL}:generateContent?key=${env.GOOGLE_API_KEY}`;

    const body: Record<string, unknown> = {
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts }],
        generationConfig: {
            temperature,
            ...(jsonMode ? { responseMimeType: 'application/json' } : {}),
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
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };

    const text = data.candidates?.[0]?.content?.parts?.find(p => p.text)?.text;
    if (!text) {
        throw new Error('No content generated');
    }

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
function parseContentResponse(content: string): ContentResponse {
    // Extract JSON from response (model may wrap in code fences)
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
        logError('No JSON found in response, first 200 chars:', content.substring(0, 200));
        const fallbackContent: DraftContent = {
            format: 'single',
            tweets: [{ text: content.replace(/```[\s\S]*?```/g, '').trim(), index: 0 }],
        };
        fallbackContent.imagePrompt = buildImagePrompt(fallbackContent);
        return { content: fallbackContent, overviewUpdates: null };
    }

    try {
        const parsed = JSON.parse(jsonMatch[0]);

        if (!parsed.format || !Array.isArray(parsed.tweets)) {
            throw new Error('Invalid content structure');
        }

        const draftContent: DraftContent = {
            format: parsed.format,
            tweets: parsed.tweets.map((t: { text: string }, i: number) => ({
                text: t.text,
                index: i,
            })),
        };

        logInfo('Response has imagePrompt:', !!parsed.imagePrompt, 'type:', typeof parsed.imagePrompt);

        if (parsed.imagePrompt && isValidImagePromptData(parsed.imagePrompt)) {
            draftContent.imagePrompt = parsed.imagePrompt;
        } else {
            if (parsed.imagePrompt) logInfo('imagePrompt failed validation, using fallback');
            else logInfo('No imagePrompt in response, generating fallback');
            draftContent.imagePrompt = buildImagePrompt(draftContent);
        }

        // Extract overviewUpdates if present
        let overviewUpdates: OverviewPatch | null = null;
        if (parsed.overviewUpdates && typeof parsed.overviewUpdates === 'object') {
            overviewUpdates = parsed.overviewUpdates as OverviewPatch;
        }

        return { content: draftContent, overviewUpdates };
    } catch (parseError) {
        logError('JSON parse error:', parseError instanceof Error ? parseError.message : String(parseError));
        const fallbackContent: DraftContent = {
            format: 'single',
            tweets: [{ text: content.replace(/```[\s\S]*?```/g, '').trim(), index: 0 }],
        };
        fallbackContent.imagePrompt = buildImagePrompt(fallbackContent);
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
        generateImagePrompt?: boolean;
        chatId?: string;
        language?: string;
        imageParts?: ImagePart[];
    },
): Promise<DraftContent> {
    const lang = options.language || 'en';
    const cId = options.chatId || '';
    const tweetsText = content.tweets.map((t, i) => `Tweet ${i + 1}: ${t.text}`).join('\n');

    // Build system instruction with identity + optional image-gen
    const systemPrompt = await assembleSystemInstruction(env, cId, 'refine', lang, {
        attachImageGen: options.generateImagePrompt,
    });

    // Build user prompt — instruction framed as self-directed if present
    let userPromptText: string;
    if (options.instruction && content.tweets.length === 0) {
        userPromptText = `I want to create content like this: ${options.instruction}`;
    } else if (options.instruction) {
        userPromptText = `Here's a draft. I want to change it like this: ${options.instruction}\n\n${tweetsText}`;
    } else {
        userPromptText = `Here's a draft. I want to rewrite it in my own voice.\n\n${tweetsText}`;
    }

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

    // Strip imagePrompt if not requested
    if (!options.generateImagePrompt) {
        delete result.imagePrompt;
    }

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

/**
 * Build a natural language prompt string from ImagePromptData.
 * Joins all fields into a flowing description for the image model.
 */
function consolidateImagePrompt(data: ImagePromptData): string {
    return [
        data.concept.main_subject,
        data.concept.symbolic_elements,
        data.concept.mood,
        data.composition.style,
        data.composition.perspective,
        data.environment.setting,
        data.environment.lighting,
        data.environment.color_palette,
        data.technical.medium,
        data.technical.quality,
        data.technical.negative,
    ].join('. ');
}

/**
 * Generate an image using Gemini image generation.
 * Returns the raw image data as ArrayBuffer, or null if failed.
 */
export async function generateImage(env: Env, content: DraftContent): Promise<{ data: ArrayBuffer; mimeType: string } | null> {
    try {
        // Build the prompt string
        let promptStr: string;

        if (content.imagePrompt) {
            if (typeof content.imagePrompt === 'string') {
                promptStr = content.imagePrompt;
            } else {
                promptStr = consolidateImagePrompt(content.imagePrompt);
            }
        } else {
            promptStr = consolidateImagePrompt(buildImagePrompt(content));
        }

        logInfo('Generating image with Gemini, prompt length:', promptStr.length);

        const url = `${GEMINI_API}/models/${GEMINI_IMAGE_MODEL}:generateContent?key=${env.GOOGLE_API_KEY}`;
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: `Generate an image: ${promptStr}` }] }],
                generationConfig: {
                    responseModalities: ['IMAGE', 'TEXT'],
                },
            }),
        });

        logInfo('Gemini image API response status:', response.status);

        if (!response.ok) {
            const errText = await response.text();
            logError('Gemini image generation failed:', response.status, errText.substring(0, 200));
            return null;
        }

        const result = await response.json() as {
            candidates?: [{
                content?: {
                    parts?: Array<{
                        text?: string;
                        inlineData?: { mimeType: string; data: string };
                    }>;
                };
            }];
        };

        // Find the image part in the response
        const parts = result.candidates?.[0]?.content?.parts || [];
        const imagePart = parts.find(p => p.inlineData);

        if (!imagePart?.inlineData) {
            logError('No image data in Gemini response, parts count:', parts.length);
            return null;
        }

        // Decode base64 to ArrayBuffer
        const binaryStr = atob(imagePart.inlineData.data);
        const bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) {
            bytes[i] = binaryStr.charCodeAt(i);
        }

        logInfo('Image generated successfully, size:', bytes.length);
        return { data: bytes.buffer, mimeType: imagePart.inlineData.mimeType };
    } catch (error) {
        logError('Image generation error:', error instanceof Error ? error.message : String(error));
        return null;
    }
}

export async function refineHandwrittenContent(
    env: Env,
    content: DraftContent,
    options: { refineText: boolean; generateImagePrompt: boolean; instruction?: string; imageParts?: ImagePart[] },
    language?: string,
    chatId?: string,
): Promise<DraftContent> {
    if (!options.refineText && options.generateImagePrompt) {
        // Image-only mode: image-gen skill + identity (no refine skill)
        const lang = language || 'en';
        const systemPrompt = await assembleSystemInstruction(env, chatId || '', 'image-gen', lang);
        const tweetsText = content.tweets.map((t, i) => `Tweet ${i + 1}: ${t.text}`).join('\n');
        let userPromptText = options.instruction
            ? `I don't want to change the tweet text. I want an image for this direction: ${options.instruction}\n\n${tweetsText}`
            : `I don't want to change the tweet text. I want an image that captures the theme.\n\n${tweetsText}`;

        let userPrompt: string | Array<{ text: string } | ImagePart>;
        if (options.imageParts && options.imageParts.length > 0) {
            const mapping = buildImageMapping(content.tweets);
            if (mapping) userPromptText += `\n\n${mapping}`;
            userPromptText += '\n\nI\'m attaching these images as reference.';
            userPrompt = [{ text: userPromptText }, ...options.imageParts];
        } else {
            userPrompt = userPromptText;
        }

        const responseText = await callLLMText(env, systemPrompt, userPrompt);
        return parseContentResponse(responseText).content;
    }

    return refineContent(env, content, {
        instruction: options.instruction,
        generateImagePrompt: options.generateImagePrompt,
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
function buildContentPrompt(source: ContentSource, overview?: RepoOverview | null, _language?: string, options?: GenerateContentOptions): string {
    const { data } = source;

    // Sanitize commit messages
    const safeCommitMessages = data.commitMessages
        .map(msg => sanitizeContent(msg, 200))
        .join('\n- ');

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

${userSections}`;
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
