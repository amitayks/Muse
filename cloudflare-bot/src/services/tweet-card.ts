/**
 * Tweet Card Renderer — Generates tweet-style images for Instagram publishing
 *
 * Uses Satori (JSX → SVG) + resvg-wasm (SVG → PNG) to create tweet card images.
 * Handles single tweets, threads (connected cards), and quote-tweet layouts.
 * Also generates 9:16 story images with blurred background treatment.
 */

import satori, { init as initSatori } from 'satori';
import { initWasm as initResvg, Resvg } from '@resvg/resvg-wasm';
// @ts-ignore — wasm import for Cloudflare Workers
import yogaWasm from 'satori/yoga.wasm';
// @ts-ignore — wasm import for Cloudflare Workers
import resvgWasm from '@resvg/resvg-wasm/index_bg.wasm';
import type { Env } from '../types';

// ==================== Initialization ====================

let initialized = false;

async function ensureInit(): Promise<void> {
    if (initialized) return;
    try {
        // Initialize yoga (layout engine for Satori)
        await initSatori(yogaWasm);
        // Initialize resvg (SVG → PNG converter)
        await initResvg(resvgWasm);
        initialized = true;
    } catch (error) {
        // May already be initialized from a previous request in the same isolate
        if (String(error).includes('Already initialized')) {
            initialized = true;
            return;
        }
        throw error;
    }
}

// ==================== Font Loading ====================

let fontCache: { regular: ArrayBuffer; bold: ArrayBuffer } | null = null;

async function loadFonts(env: Env): Promise<{ regular: ArrayBuffer; bold: ArrayBuffer }> {
    if (fontCache) return fontCache;

    const [regularObj, boldObj] = await Promise.all([
        env.IMAGES.get('fonts/inter-regular.woff2'),
        env.IMAGES.get('fonts/inter-bold.woff2'),
    ]);

    if (!regularObj || !boldObj) {
        throw new Error('Font files not found in R2. Upload inter-regular.woff2 and inter-bold.woff2 to fonts/');
    }

    fontCache = {
        regular: await regularObj.arrayBuffer(),
        bold: await boldObj.arrayBuffer(),
    };
    return fontCache;
}

// ==================== Emoji Replacement ====================

// Common emoji regex — matches most Unicode emoji sequences
const EMOJI_REGEX = /(?:\p{Emoji_Presentation}|\p{Extended_Pictographic})(?:\uFE0F)?(?:\u200D(?:\p{Emoji_Presentation}|\p{Extended_Pictographic})(?:\uFE0F)?)*/gu;

const TWEMOJI_CDN = 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg';

/**
 * Get the codepoint string for an emoji character (for Twemoji lookup).
 */
function emojiToCodepoints(emoji: string): string {
    return [...emoji]
        .map(char => char.codePointAt(0)!.toString(16))
        .filter(cp => cp !== 'fe0f') // Remove variation selector
        .join('-');
}

/**
 * Pre-resolve all emoji in a text to data URIs or CDN URLs.
 * Checks R2 cache first (emoji/{codepoint}.svg), falls back to jsDelivr CDN.
 * Caches fetched emojis in R2 for future reuse.
 */
async function resolveEmojiUrls(env: Env, text: string): Promise<Map<string, string>> {
    const emojiMap = new Map<string, string>();
    const matches = [...text.matchAll(EMOJI_REGEX)];
    if (matches.length === 0) return emojiMap;

    // Deduplicate emojis
    const uniqueEmojis = [...new Set(matches.map(m => m[0]))];

    await Promise.all(uniqueEmojis.map(async (emoji) => {
        const codepoints = emojiToCodepoints(emoji);
        const r2Key = `emoji/${codepoints}.svg`;

        // Check R2 cache
        try {
            const cached = await env.IMAGES.get(r2Key);
            if (cached) {
                const svgText = await cached.text();
                emojiMap.set(emoji, `data:image/svg+xml;base64,${btoa(svgText)}`);
                return;
            }
        } catch { /* fall through to CDN */ }

        // Fetch from CDN and cache in R2
        const cdnUrl = `${TWEMOJI_CDN}/${codepoints}.svg`;
        try {
            const response = await fetch(cdnUrl);
            if (response.ok) {
                const svgText = await response.text();
                // Cache in R2 (fire and forget)
                env.IMAGES.put(r2Key, svgText, {
                    httpMetadata: { contentType: 'image/svg+xml' },
                }).catch(() => {});
                emojiMap.set(emoji, `data:image/svg+xml;base64,${btoa(svgText)}`);
                return;
            }
        } catch { /* fall through to CDN URL */ }

        // Last resort: use CDN URL directly (Satori will fetch it during render)
        emojiMap.set(emoji, cdnUrl);
    }));

    return emojiMap;
}

/**
 * Split text into segments of plain text and emoji images for Satori rendering.
 * Uses pre-resolved emoji URLs when available, falls back to CDN URLs.
 */
function textWithEmojis(text: string, fontSize: number, emojiUrls?: Map<string, string>): any[] {
    const parts: any[] = [];
    let lastIndex = 0;

    for (const match of text.matchAll(EMOJI_REGEX)) {
        const index = match.index!;
        // Add text before emoji
        if (index > lastIndex) {
            parts.push(text.slice(lastIndex, index));
        }
        // Add emoji as image — use pre-resolved URL or fall back to CDN
        const src = emojiUrls?.get(match[0]) || `${TWEMOJI_CDN}/${emojiToCodepoints(match[0])}.svg`;
        parts.push({
            type: 'img',
            props: {
                src,
                alt: match[0],
                width: fontSize,
                height: fontSize,
                style: { display: 'inline-block', verticalAlign: 'middle', margin: '0 2px' },
            },
        });
        lastIndex = index + match[0].length;
    }

    // Add remaining text
    if (lastIndex < text.length) {
        parts.push(text.slice(lastIndex));
    }

    return parts.length > 0 ? parts : [text];
}

// ==================== Profile Image Caching ====================

/**
 * Get a profile image, caching in R2 for reuse.
 * Returns the image as a base64 data URI for Satori.
 */
async function getProfileImageDataUri(
    env: Env,
    username: string,
    url: string
): Promise<string> {
    const r2Key = `profiles/${username.toLowerCase()}.jpg`;

    // Check R2 cache
    const cached = await env.IMAGES.get(r2Key);
    if (cached) {
        const buffer = await cached.arrayBuffer();
        const base64 = arrayBufferToBase64(buffer);
        return `data:image/jpeg;base64,${base64}`;
    }

    // Download and cache
    try {
        // Twitter serves _normal size (48x48). Use _bigger (73x73) — closest to spec's 96x96
        const highResUrl = url.replace('_normal', '_bigger');
        const response = await fetch(highResUrl);
        if (!response.ok) {
            // Fallback to original URL
            const fallback = await fetch(url);
            if (!fallback.ok) return getDefaultAvatarDataUri();
            const buffer = await fallback.arrayBuffer();
            await env.IMAGES.put(r2Key, buffer, { httpMetadata: { contentType: 'image/jpeg' } });
            return `data:image/jpeg;base64,${arrayBufferToBase64(buffer)}`;
        }
        const buffer = await response.arrayBuffer();
        await env.IMAGES.put(r2Key, buffer, { httpMetadata: { contentType: 'image/jpeg' } });
        return `data:image/jpeg;base64,${arrayBufferToBase64(buffer)}`;
    } catch {
        return getDefaultAvatarDataUri();
    }
}

function getDefaultAvatarDataUri(): string {
    // Simple gray circle SVG as fallback
    return 'data:image/svg+xml,' + encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48"><circle cx="24" cy="24" r="24" fill="#657786"/></svg>'
    );
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

// ==================== Card Layout Constants ====================

const CARD_WIDTH = 600;
const CARD_PADDING = 24;
const AVATAR_SIZE = 48;
const TEXT_FONT_SIZE = 18;
const NAME_FONT_SIZE = 16;
const USERNAME_FONT_SIZE = 14;
const BG_COLOR = '#15202B'; // Twitter dark mode background
const TEXT_COLOR = '#E7E9EA';
const SECONDARY_COLOR = '#8B98A5';
const BORDER_COLOR = '#38444D';

// Story dimensions (9:16)
const STORY_WIDTH = 1080;
const STORY_HEIGHT = 1920;

// ==================== Single Tweet Card ====================

interface TweetCardData {
    displayName: string;
    username: string;
    text: string;
    profileImageUrl?: string | null;
    timestamp?: string;
}

/**
 * Render a single tweet card as a PNG buffer.
 */
export async function renderTweetCard(
    env: Env,
    data: TweetCardData
): Promise<Uint8Array> {
    await ensureInit();
    const fonts = await loadFonts(env);

    const avatarSrc = data.profileImageUrl
        ? await getProfileImageDataUri(env, data.username, data.profileImageUrl)
        : getDefaultAvatarDataUri();

    const emojiUrls = await resolveEmojiUrls(env, data.text);
    const element = buildTweetCardElement(data, avatarSrc, emojiUrls);

    const svg = await satori(element, {
        width: CARD_WIDTH,
        fonts: [
            { name: 'Inter', data: fonts.regular, weight: 400, style: 'normal' },
            { name: 'Inter', data: fonts.bold, weight: 700, style: 'normal' },
        ],
    });

    const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: CARD_WIDTH } });
    const png = resvg.render();
    return png.asPng();
}

function buildTweetCardElement(data: TweetCardData, avatarSrc: string, emojiUrls?: Map<string, string>): any {
    const textSegments = textWithEmojis(data.text, TEXT_FONT_SIZE, emojiUrls);

    return {
        type: 'div',
        props: {
            style: {
                display: 'flex',
                flexDirection: 'column',
                backgroundColor: BG_COLOR,
                padding: `${CARD_PADDING}px`,
                borderRadius: '16px',
                border: `1px solid ${BORDER_COLOR}`,
                width: '100%',
            },
            children: [
                // Header: avatar + name/username
                {
                    type: 'div',
                    props: {
                        style: {
                            display: 'flex',
                            alignItems: 'center',
                            marginBottom: '12px',
                        },
                        children: [
                            {
                                type: 'img',
                                props: {
                                    src: avatarSrc,
                                    width: AVATAR_SIZE,
                                    height: AVATAR_SIZE,
                                    style: {
                                        borderRadius: '50%',
                                        marginRight: '12px',
                                    },
                                },
                            },
                            {
                                type: 'div',
                                props: {
                                    style: { display: 'flex', flexDirection: 'column' },
                                    children: [
                                        {
                                            type: 'span',
                                            props: {
                                                style: {
                                                    color: TEXT_COLOR,
                                                    fontSize: `${NAME_FONT_SIZE}px`,
                                                    fontWeight: 700,
                                                },
                                                children: data.displayName,
                                            },
                                        },
                                        {
                                            type: 'span',
                                            props: {
                                                style: {
                                                    color: SECONDARY_COLOR,
                                                    fontSize: `${USERNAME_FONT_SIZE}px`,
                                                },
                                                children: `@${data.username}`,
                                            },
                                        },
                                    ],
                                },
                            },
                        ],
                    },
                },
                // Tweet text
                {
                    type: 'div',
                    props: {
                        style: {
                            color: TEXT_COLOR,
                            fontSize: `${TEXT_FONT_SIZE}px`,
                            lineHeight: '1.5',
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word',
                        },
                        children: textSegments,
                    },
                },
            ],
        },
    };
}

// ==================== Thread Cards ====================

/**
 * Render multiple tweet cards connected by a vertical line (thread).
 * Returns an array of individual PNGs — one per tweet — suitable for Instagram carousel.
 * Each card has connecting-line indicators above/below the avatar to show thread continuity.
 */
export async function renderThreadCards(
    env: Env,
    tweets: TweetCardData[]
): Promise<Uint8Array[]> {
    await ensureInit();
    const fonts = await loadFonts(env);

    // Use same avatar for all cards (thread is same author)
    const firstTweet = tweets[0];
    const avatarSrc = firstTweet.profileImageUrl
        ? await getProfileImageDataUri(env, firstTweet.username, firstTweet.profileImageUrl)
        : getDefaultAvatarDataUri();

    // Pre-resolve all emojis across all tweet texts at once
    const allText = tweets.map(t => t.text).join(' ');
    const emojiUrls = await resolveEmojiUrls(env, allText);

    const results: Uint8Array[] = [];
    const fontData = [
        { name: 'Inter', data: fonts.regular, weight: 400 as const, style: 'normal' as const },
        { name: 'Inter', data: fonts.bold, weight: 700 as const, style: 'normal' as const },
    ];

    for (let i = 0; i < tweets.length; i++) {
        const isFirst = i === 0;
        const isLast = i === tweets.length - 1;
        const cardContent = buildThreadCardElement(tweets[i], avatarSrc, isFirst, isLast, emojiUrls);

        // Wrap in standalone card container with background and border
        const element = {
            type: 'div',
            props: {
                style: {
                    display: 'flex',
                    flexDirection: 'column',
                    backgroundColor: BG_COLOR,
                    borderRadius: '16px',
                    border: `1px solid ${BORDER_COLOR}`,
                    width: '100%',
                    overflow: 'hidden',
                },
                children: [cardContent],
            },
        };

        const svg = await satori(element, { width: CARD_WIDTH, fonts: fontData });
        const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: CARD_WIDTH } });
        const png = resvg.render();
        results.push(png.asPng());
    }

    return results;
}

function buildThreadCardElement(
    data: TweetCardData,
    avatarSrc: string,
    isFirst: boolean,
    isLast: boolean,
    emojiUrls?: Map<string, string>
): any {
    const textSegments = textWithEmojis(data.text, TEXT_FONT_SIZE, emojiUrls);

    return {
        type: 'div',
        props: {
            style: {
                display: 'flex',
                padding: `${CARD_PADDING}px`,
                paddingBottom: isLast ? `${CARD_PADDING}px` : '8px',
                paddingTop: isFirst ? `${CARD_PADDING}px` : '8px',
            },
            children: [
                // Avatar column with connecting line
                {
                    type: 'div',
                    props: {
                        style: {
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            marginRight: '12px',
                            width: `${AVATAR_SIZE}px`,
                        },
                        children: [
                            // Line above avatar (if not first)
                            ...(!isFirst ? [{
                                type: 'div',
                                props: {
                                    style: {
                                        width: '2px',
                                        height: '8px',
                                        backgroundColor: BORDER_COLOR,
                                    },
                                },
                            }] : []),
                            // Avatar
                            {
                                type: 'img',
                                props: {
                                    src: avatarSrc,
                                    width: AVATAR_SIZE,
                                    height: AVATAR_SIZE,
                                    style: { borderRadius: '50%' },
                                },
                            },
                            // Line below avatar (if not last)
                            ...(!isLast ? [{
                                type: 'div',
                                props: {
                                    style: {
                                        width: '2px',
                                        flexGrow: 1,
                                        backgroundColor: BORDER_COLOR,
                                        marginTop: '4px',
                                    },
                                },
                            }] : []),
                        ],
                    },
                },
                // Content column
                {
                    type: 'div',
                    props: {
                        style: {
                            display: 'flex',
                            flexDirection: 'column',
                            flexGrow: 1,
                        },
                        children: [
                            // Name row (only on first card)
                            ...(isFirst ? [{
                                type: 'div',
                                props: {
                                    style: {
                                        display: 'flex',
                                        alignItems: 'center',
                                        marginBottom: '4px',
                                    },
                                    children: [
                                        {
                                            type: 'span',
                                            props: {
                                                style: {
                                                    color: TEXT_COLOR,
                                                    fontSize: `${NAME_FONT_SIZE}px`,
                                                    fontWeight: 700,
                                                    marginRight: '8px',
                                                },
                                                children: data.displayName,
                                            },
                                        },
                                        {
                                            type: 'span',
                                            props: {
                                                style: {
                                                    color: SECONDARY_COLOR,
                                                    fontSize: `${USERNAME_FONT_SIZE}px`,
                                                },
                                                children: `@${data.username}`,
                                            },
                                        },
                                    ],
                                },
                            }] : []),
                            // Tweet text
                            {
                                type: 'div',
                                props: {
                                    style: {
                                        color: TEXT_COLOR,
                                        fontSize: `${TEXT_FONT_SIZE}px`,
                                        lineHeight: '1.5',
                                        whiteSpace: 'pre-wrap',
                                        wordBreak: 'break-word',
                                    },
                                    children: textSegments,
                                },
                            },
                        ],
                    },
                },
            ],
        },
    };
}

// ==================== Quote Tweet Card ====================

interface QuoteTweetCardData {
    /** The user's commentary */
    commentText: string;
    commentDisplayName: string;
    commentUsername: string;
    commentProfileImageUrl?: string | null;
    /** The original tweet being quoted */
    originalText: string;
    originalDisplayName: string;
    originalUsername: string;
    originalProfileImageUrl?: string | null;
}

/**
 * Render a quote-tweet card: user's commentary at top with embedded original tweet below.
 */
export async function renderQuoteTweetCard(
    env: Env,
    data: QuoteTweetCardData
): Promise<Uint8Array> {
    await ensureInit();
    const fonts = await loadFonts(env);

    const commentAvatarSrc = data.commentProfileImageUrl
        ? await getProfileImageDataUri(env, data.commentUsername, data.commentProfileImageUrl)
        : getDefaultAvatarDataUri();

    const originalAvatarSrc = data.originalProfileImageUrl
        ? await getProfileImageDataUri(env, data.originalUsername, data.originalProfileImageUrl)
        : getDefaultAvatarDataUri();

    // Pre-resolve all emojis across both texts
    const allText = `${data.commentText} ${data.originalText}`;
    const emojiUrls = await resolveEmojiUrls(env, allText);

    const commentTextSegments = textWithEmojis(data.commentText, TEXT_FONT_SIZE, emojiUrls);
    const originalTextSegments = textWithEmojis(data.originalText, 15, emojiUrls);

    const element = {
        type: 'div',
        props: {
            style: {
                display: 'flex',
                flexDirection: 'column',
                backgroundColor: BG_COLOR,
                padding: `${CARD_PADDING}px`,
                borderRadius: '16px',
                border: `1px solid ${BORDER_COLOR}`,
                width: '100%',
            },
            children: [
                // User's comment header
                {
                    type: 'div',
                    props: {
                        style: { display: 'flex', alignItems: 'center', marginBottom: '12px' },
                        children: [
                            {
                                type: 'img',
                                props: {
                                    src: commentAvatarSrc,
                                    width: AVATAR_SIZE,
                                    height: AVATAR_SIZE,
                                    style: { borderRadius: '50%', marginRight: '12px' },
                                },
                            },
                            {
                                type: 'div',
                                props: {
                                    style: { display: 'flex', flexDirection: 'column' },
                                    children: [
                                        {
                                            type: 'span',
                                            props: {
                                                style: { color: TEXT_COLOR, fontSize: `${NAME_FONT_SIZE}px`, fontWeight: 700 },
                                                children: data.commentDisplayName,
                                            },
                                        },
                                        {
                                            type: 'span',
                                            props: {
                                                style: { color: SECONDARY_COLOR, fontSize: `${USERNAME_FONT_SIZE}px` },
                                                children: `@${data.commentUsername}`,
                                            },
                                        },
                                    ],
                                },
                            },
                        ],
                    },
                },
                // User's commentary text
                {
                    type: 'div',
                    props: {
                        style: {
                            color: TEXT_COLOR,
                            fontSize: `${TEXT_FONT_SIZE}px`,
                            lineHeight: '1.5',
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word',
                            marginBottom: '12px',
                        },
                        children: commentTextSegments,
                    },
                },
                // Embedded original tweet (bordered box)
                {
                    type: 'div',
                    props: {
                        style: {
                            display: 'flex',
                            flexDirection: 'column',
                            border: `1px solid ${BORDER_COLOR}`,
                            borderRadius: '12px',
                            padding: '16px',
                        },
                        children: [
                            // Original author header
                            {
                                type: 'div',
                                props: {
                                    style: { display: 'flex', alignItems: 'center', marginBottom: '8px' },
                                    children: [
                                        {
                                            type: 'img',
                                            props: {
                                                src: originalAvatarSrc,
                                                width: 32,
                                                height: 32,
                                                style: { borderRadius: '50%', marginRight: '8px' },
                                            },
                                        },
                                        {
                                            type: 'span',
                                            props: {
                                                style: { color: TEXT_COLOR, fontSize: '14px', fontWeight: 700, marginRight: '6px' },
                                                children: data.originalDisplayName,
                                            },
                                        },
                                        {
                                            type: 'span',
                                            props: {
                                                style: { color: SECONDARY_COLOR, fontSize: '13px' },
                                                children: `@${data.originalUsername}`,
                                            },
                                        },
                                    ],
                                },
                            },
                            // Original tweet text
                            {
                                type: 'div',
                                props: {
                                    style: {
                                        color: TEXT_COLOR,
                                        fontSize: '15px',
                                        lineHeight: '1.4',
                                        whiteSpace: 'pre-wrap',
                                        wordBreak: 'break-word',
                                    },
                                    children: originalTextSegments,
                                },
                            },
                        ],
                    },
                },
            ],
        },
    };

    const svg = await satori(element, {
        width: CARD_WIDTH,
        fonts: [
            { name: 'Inter', data: fonts.regular, weight: 400, style: 'normal' },
            { name: 'Inter', data: fonts.bold, weight: 700, style: 'normal' },
        ],
    });

    const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: CARD_WIDTH } });
    const png = resvg.render();
    return png.asPng();
}

// ==================== Story Image (9:16) ====================

/**
 * Create a 1080x1920 story image with the card centered on a blurred background.
 * Since Satori doesn't support CSS blur, we approximate by stretching the source
 * image to fill the background and applying a heavy dark overlay on top.
 * The original card is centered at its native aspect ratio over this dimmed background.
 */
export async function createStoryImage(
    env: Env,
    cardPng: Uint8Array
): Promise<Uint8Array> {
    await ensureInit();
    const fonts = await loadFonts(env);

    // Convert card PNG to base64 data URI for embedding
    const cardBase64 = arrayBufferToBase64(cardPng.buffer as ArrayBuffer);
    const cardDataUri = `data:image/png;base64,${cardBase64}`;

    // Card aspect ratio: 600px wide, height varies. Scale to fit story width with padding.
    const cardDisplayWidth = STORY_WIDTH - 120; // 60px padding each side

    const element = {
        type: 'div',
        props: {
            style: {
                display: 'flex',
                width: `${STORY_WIDTH}px`,
                height: `${STORY_HEIGHT}px`,
                position: 'relative' as const,
            },
            children: [
                // Layer 1: Source image stretched to fill background (simulates blur)
                {
                    type: 'img',
                    props: {
                        src: cardDataUri,
                        width: STORY_WIDTH,
                        height: STORY_HEIGHT,
                        style: {
                            position: 'absolute' as const,
                            top: 0,
                            left: 0,
                        },
                    },
                },
                // Layer 2: Dark overlay to dim the stretched background
                {
                    type: 'div',
                    props: {
                        style: {
                            position: 'absolute' as const,
                            top: 0,
                            left: 0,
                            width: `${STORY_WIDTH}px`,
                            height: `${STORY_HEIGHT}px`,
                            backgroundColor: 'rgba(10, 22, 40, 0.85)',
                        },
                    },
                },
                // Layer 3: Original card centered at native aspect ratio
                {
                    type: 'div',
                    props: {
                        style: {
                            position: 'absolute' as const,
                            top: 0,
                            left: 0,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: `${STORY_WIDTH}px`,
                            height: `${STORY_HEIGHT}px`,
                        },
                        children: [
                            {
                                type: 'img',
                                props: {
                                    src: cardDataUri,
                                    width: cardDisplayWidth,
                                    style: {
                                        borderRadius: '16px',
                                        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                                    },
                                },
                            },
                        ],
                    },
                },
            ],
        },
    };

    const svg = await satori(element, {
        width: STORY_WIDTH,
        height: STORY_HEIGHT,
        fonts: [
            { name: 'Inter', data: fonts.regular, weight: 400, style: 'normal' },
        ],
    });

    const resvg = new Resvg(svg, {
        fitTo: { mode: 'width', value: STORY_WIDTH },
    });
    const png = resvg.render();
    return png.asPng();
}

// ==================== R2 Storage ====================

/**
 * Store a rendered tweet card in R2, or return existing if already rendered.
 */
export async function storeTweetCard(
    env: Env,
    draftId: string,
    index: number,
    png: Uint8Array
): Promise<string> {
    const key = `tweet-cards/${draftId}/${index}.png`;

    await env.IMAGES.put(key, png, {
        httpMetadata: { contentType: 'image/png' },
    });

    return key;
}

/**
 * Get an existing tweet card from R2.
 */
export async function getTweetCard(
    env: Env,
    draftId: string,
    index: number
): Promise<Uint8Array | null> {
    const key = `tweet-cards/${draftId}/${index}.png`;
    const obj = await env.IMAGES.get(key);
    if (!obj) return null;
    return new Uint8Array(await obj.arrayBuffer());
}

/**
 * Store a story image in R2.
 */
export async function storeStoryImage(
    env: Env,
    draftId: string,
    png: Uint8Array
): Promise<string> {
    const key = `tweet-cards/${draftId}/story.png`;

    await env.IMAGES.put(key, png, {
        httpMetadata: { contentType: 'image/png' },
    });

    return key;
}
