/**
 * Tweet Card Renderer — Generates tweet-style images for Instagram publishing
 *
 * Uses Satori (JSX → SVG) + resvg-wasm (SVG → PNG) to create tweet card images.
 * Handles single tweets, threads (connected cards), and quote-tweet layouts.
 * Also generates 9:16 story images with blurred background treatment.
 *
 * Font: Rubik (covers Latin + Hebrew + Arabic)
 */

import satori, { init as initSatori } from 'satori';
import { initWasm as initResvg, Resvg } from '@resvg/resvg-wasm';
// @ts-ignore — wasm import for Cloudflare Workers
import yogaWasm from 'satori/yoga.wasm';
// @ts-ignore — wasm import for Cloudflare Workers
import resvgWasm from '@resvg/resvg-wasm/index_bg.wasm';
// @ts-ignore — no type declarations for bidi-js
import bidiFactory from 'bidi-js';
import type { Env } from '../types';

const bidi = bidiFactory();

// ==================== Initialization ====================

let initialized = false;

async function ensureInit(): Promise<void> {
    if (initialized) return;
    try {
        await initSatori(yogaWasm);
        await initResvg(resvgWasm);
        initialized = true;
    } catch (error) {
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
        env.IMAGES.get('fonts/rubik-regular.ttf'),
        env.IMAGES.get('fonts/rubik-bold.ttf'),
    ]);

    if (!regularObj || !boldObj) {
        throw new Error('Font files not found in R2. Upload rubik-regular.ttf and rubik-bold.ttf to fonts/');
    }

    fontCache = {
        regular: await regularObj.arrayBuffer(),
        bold: await boldObj.arrayBuffer(),
    };
    return fontCache;
}

const FONT_CONFIG = (fonts: { regular: ArrayBuffer; bold: ArrayBuffer }) => [
    { name: 'Rubik', data: fonts.regular, weight: 400 as const, style: 'normal' as const },
    { name: 'Rubik', data: fonts.bold, weight: 700 as const, style: 'normal' as const },
];

// ==================== Emoji Replacement ====================

const EMOJI_REGEX = /(?:\p{Emoji_Presentation}|\p{Extended_Pictographic})(?:\uFE0F)?(?:\u200D(?:\p{Emoji_Presentation}|\p{Extended_Pictographic})(?:\uFE0F)?)*/gu;

const TWEMOJI_CDN = 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg';

function emojiToCodepoints(emoji: string): string {
    return [...emoji]
        .map(char => char.codePointAt(0)!.toString(16))
        .filter(cp => cp !== 'fe0f')
        .join('-');
}

async function resolveEmojiUrls(env: Env, text: string): Promise<Map<string, string>> {
    const emojiMap = new Map<string, string>();
    const matches = [...text.matchAll(EMOJI_REGEX)];
    if (matches.length === 0) return emojiMap;

    const uniqueEmojis = [...new Set(matches.map(m => m[0]))];

    await Promise.all(uniqueEmojis.map(async (emoji) => {
        const codepoints = emojiToCodepoints(emoji);
        const r2Key = `emoji/${codepoints}.svg`;

        try {
            const cached = await env.IMAGES.get(r2Key);
            if (cached) {
                const svgText = await cached.text();
                emojiMap.set(emoji, `data:image/svg+xml;base64,${btoa(svgText)}`);
                return;
            }
        } catch { /* fall through to CDN */ }

        const cdnUrl = `${TWEMOJI_CDN}/${codepoints}.svg`;
        try {
            const response = await fetch(cdnUrl);
            if (response.ok) {
                const svgText = await response.text();
                env.IMAGES.put(r2Key, svgText, {
                    httpMetadata: { contentType: 'image/svg+xml' },
                }).catch(() => {});
                emojiMap.set(emoji, `data:image/svg+xml;base64,${btoa(svgText)}`);
                return;
            }
        } catch { /* fall through to CDN URL */ }

        emojiMap.set(emoji, cdnUrl);
    }));

    return emojiMap;
}

/**
 * Split already-reordered text into segments of plain text and emoji images.
 * Does NOT apply BiDi — caller must pass pre-reordered text.
 */
function textWithEmojisRaw(text: string, fontSize: number, emojiUrls?: Map<string, string>): any[] {
    const parts: any[] = [];
    let lastIndex = 0;

    for (const match of text.matchAll(EMOJI_REGEX)) {
        const index = match.index!;
        if (index > lastIndex) {
            parts.push(text.slice(lastIndex, index));
        }
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

    if (lastIndex < text.length) {
        parts.push(text.slice(lastIndex));
    }

    return parts.length > 0 ? parts : [text];
}

// ==================== Profile Image Caching ====================

async function getProfileImageDataUri(
    env: Env,
    username: string,
    url: string
): Promise<string> {
    const r2Key = `profiles/${username.toLowerCase()}.jpg`;

    const cached = await env.IMAGES.get(r2Key);
    if (cached) {
        const buffer = await cached.arrayBuffer();
        const base64 = arrayBufferToBase64(buffer);
        return `data:image/jpeg;base64,${base64}`;
    }

    try {
        const highResUrl = url.replace('_normal', '_bigger');
        const response = await fetch(highResUrl);
        if (!response.ok) {
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
    // Dark gray circle with white user silhouette — visible on black background
    return 'data:image/svg+xml,' + encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40">' +
        '<circle cx="20" cy="20" r="20" fill="#2F3336"/>' +
        '<circle cx="20" cy="16" r="6" fill="#71767B"/>' +
        '<ellipse cx="20" cy="32" rx="10" ry="8" fill="#71767B"/>' +
        '</svg>'
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

const CARD_WIDTH = 1080;      // Native Instagram resolution
const CARD_MIN_HEIGHT = 1080; // 1:1 — Instagram minimum
const CARD_MAX_HEIGHT = 1350; // 4:5 — Instagram portrait max
const CARD_PADDING = 28;
const AVATAR_SIZE = 72;
const TEXT_FONT_SIZE = 30;
const NAME_FONT_SIZE = 27;
const USERNAME_FONT_SIZE = 25;
const TIMESTAMP_FONT_SIZE = 25;
const BG_COLOR = '#000000';
const TEXT_COLOR = '#E7E9EA';
const SECONDARY_COLOR = '#71767B';
const BORDER_COLOR = '#333639';

// Story dimensions (9:16) — 720p to stay within CPU limits
const STORY_WIDTH = 720;
const STORY_HEIGHT = 1280;

// ==================== Verified Badge & Grok Logo ====================

const VERIFIED_BADGE_SVG = 'data:image/svg+xml,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 22 22" width="22" height="22">' +
    '<path d="M20.396 11c-.018-.646-.215-1.275-.57-1.816-.354-.54-.852-.972-1.438-1.246.223-.607.27-1.264.14-1.897-.131-.634-.437-1.218-.882-1.687-.47-.445-1.053-.75-1.687-.882-.633-.13-1.29-.083-1.897.14-.273-.587-.704-1.086-1.245-1.44S11.647 1.62 11 1.604c-.646.017-1.273.213-1.813.568s-.969.854-1.24 1.44c-.608-.223-1.267-.272-1.902-.14-.635.13-1.22.436-1.69.882-.445.47-.749 1.055-.878 1.688-.13.633-.08 1.29.144 1.896-.587.274-1.087.705-1.443 1.245-.356.54-.555 1.17-.574 1.817.02.647.218 1.276.574 1.817.356.54.856.972 1.443 1.245-.224.606-.274 1.263-.144 1.896.13.634.433 1.218.877 1.688.47.443 1.054.747 1.687.878.633.132 1.29.084 1.897-.136.274.586.705 1.084 1.246 1.439.54.354 1.17.551 1.816.569.647-.016 1.276-.213 1.817-.567s.972-.854 1.245-1.44c.604.239 1.266.296 1.903.164.636-.132 1.22-.447 1.68-.907.46-.46.776-1.044.908-1.681s.075-1.299-.165-1.903c.586-.274 1.084-.705 1.439-1.246.354-.54.551-1.17.569-1.816zM9.662 14.85l-3.429-3.428 1.293-1.302 2.072 2.072 4.4-4.794 1.347 1.246z" fill="#1D9BF0"/>' +
    '</svg>'
);

const GROK_LOGO_SVG = 'data:image/svg+xml,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 33 32" width="33" height="32">' +
    '<path d="M12.745 20.54l10.97-8.19c.539-.4 1.307-.244 1.564.38 1.349 3.288.746 7.241-1.938 9.955-2.683 2.714-6.417 3.31-9.83 1.954l-3.728 1.745c5.347 3.697 11.84 2.782 15.898-1.324 3.219-3.255 4.216-7.692 3.284-11.693l.008.009c-1.351-5.878.332-8.227 3.782-13.031L33 0l-4.54 4.59v-.014L12.743 20.544" fill="#71767B"/>' +
    '<path d="M10.48 22.527c-3.837-3.707-3.175-9.446.1-12.755 2.42-2.449 6.388-3.448 9.852-1.979l3.72-1.737c-.67-.49-1.53-1.017-2.515-1.387-4.455-1.854-9.789-.931-13.41 2.728-3.483 3.523-4.579 8.94-2.697 13.561 1.405 3.454-.899 5.898-3.22 8.364C1.49 30.2.666 31.074 0 32l10.478-9.466" fill="#71767B"/>' +
    '</svg>'
);

// Badge color by verified_type
const BADGE_COLORS: Record<string, string> = {
    blue: '#1D9BF0',
    business: '#E2B719',    // gold
    government: '#829AAB',  // gray
};

const BADGE_PATH = 'M20.396 11c-.018-.646-.215-1.275-.57-1.816-.354-.54-.852-.972-1.438-1.246.223-.607.27-1.264.14-1.897-.131-.634-.437-1.218-.882-1.687-.47-.445-1.053-.75-1.687-.882-.633-.13-1.29-.083-1.897.14-.273-.587-.704-1.086-1.245-1.44S11.647 1.62 11 1.604c-.646.017-1.273.213-1.813.568s-.969.854-1.24 1.44c-.608-.223-1.267-.272-1.902-.14-.635.13-1.22.436-1.69.882-.445.47-.749 1.055-.878 1.688-.13.633-.08 1.29.144 1.896-.587.274-1.087.705-1.443 1.245-.356.54-.555 1.17-.574 1.817.02.647.218 1.276.574 1.817.356.54.856.972 1.443 1.245-.224.606-.274 1.263-.144 1.896.13.634.433 1.218.877 1.688.47.443 1.054.747 1.687.878.633.132 1.29.084 1.897-.136.274.586.705 1.084 1.246 1.439.54.354 1.17.551 1.816.569.647-.016 1.276-.213 1.817-.567s.972-.854 1.245-1.44c.604.239 1.266.296 1.903.164.636-.132 1.22-.447 1.68-.907.46-.46.776-1.044.908-1.681s.075-1.299-.165-1.903c.586-.274 1.084-.705 1.439-1.246.354-.54.551-1.17.569-1.816zM9.662 14.85l-3.429-3.428 1.293-1.302 2.072 2.072 4.4-4.794 1.347 1.246z';

function getVerifiedBadgeSvg(verifiedType?: string): string | null {
    const color = BADGE_COLORS[verifiedType || 'blue'];
    if (!color && verifiedType === 'none') return null;
    return 'data:image/svg+xml,' + encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 22 22" width="22" height="22"><path d="${BADGE_PATH}" fill="${color || '#1D9BF0'}"/></svg>`
    );
}

// ==================== Reaction Bar Icons (SVG data URIs) ====================

const ICON_SIZE = 32;
const ICON_COLOR = '#71767B';

const ICON_COMMENT = 'data:image/svg+xml,' + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="${ICON_COLOR}" stroke-width="1.5"><path d="M1.751 10c0-4.42 3.58-8 8-8h4.5c4.42 0 8 3.58 8 8s-3.58 8-8 8h-1.5l-4.5 4v-4h-0.5c-1.38 0-2.66-.35-3.78-.96L1.751 18V10z"/></svg>`
);

const ICON_RETWEET = 'data:image/svg+xml,' + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="${ICON_COLOR}"><path d="M4.5 3.88l4.432 4.14-1.364 1.46L5.5 7.55V16c0 1.1.896 2 2 2h4v2h-4c-2.21 0-4-1.79-4-4V7.55L1.432 9.48.068 8.02 4.5 3.88zM19.5 20.12l-4.432-4.14 1.364-1.46 2.068 1.93V8c0-1.1-.896-2-2-2h-4V4h4c2.21 0 4 1.79 4 4v8.45l2.068-1.93 1.364 1.46-4.432 4.14z"/></svg>`
);

const ICON_HEART = 'data:image/svg+xml,' + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="${ICON_COLOR}" stroke-width="1.5"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.27 2 8.5 2 5.41 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.08C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.41 22 8.5c0 3.77-3.4 6.86-8.55 11.53L12 21.35z"/></svg>`
);

const ICON_BOOKMARK = 'data:image/svg+xml,' + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="${ICON_COLOR}" stroke-width="1.5"><path d="M4 4.5C4 3.12 5.119 2 6.5 2h11C18.881 2 20 3.12 20 4.5v18.44l-8-5.71-8 5.71V4.5z"/></svg>`
);

const ICON_SHARE = 'data:image/svg+xml,' + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="${ICON_COLOR}"><path d="M12 2.59l5.7 5.7-1.41 1.41L13 6.41V16h-2V6.41L7.71 9.7 6.3 8.29 12 2.59zM21 15l-.02 3.51c0 1.38-1.12 2.49-2.5 2.49H5.5C4.11 21 3 19.88 3 18.5V15h2v3.5c0 .28.22.5.5.5h12.98c.28 0 .5-.22.5-.5L19 15h2z"/></svg>`
);

// ==================== RTL Detection ====================

function isRtlText(text: string): boolean {
    return /[\u0590-\u05FF\u0600-\u06FF]/.test(text);
}

/**
 * Detect direction of a single line based on its first "strong" character.
 * Matches X/Twitter behavior: first Hebrew/Arabic char → RTL, first Latin/digit → LTR.
 */
function getLineDirection(line: string): 'rtl' | 'ltr' {
    const match = line.match(/[\u0590-\u05FF\u0600-\u06FF]|[a-zA-Z0-9]/);
    if (!match) return 'ltr';
    return /[\u0590-\u05FF\u0600-\u06FF]/.test(match[0]) ? 'rtl' : 'ltr';
}

/**
 * Reorder a single line for visual display using the Unicode BiDi algorithm.
 * Satori doesn't implement BiDi, so we reorder the string ourselves.
 */
function bidiReorderLine(line: string, direction: 'rtl' | 'ltr'): string {
    if (!line || !isRtlText(line)) return line; // Skip only if no RTL chars at all
    const embedLevels = bidi.getEmbeddingLevels(line, direction);
    return bidi.getReorderedString(line, embedLevels);
}

/**
 * Reorder full text (used by textWithEmojis for the overall string).
 * Processes line-by-line, applying BiDi only to RTL lines.
 */
function bidiReorder(text: string): string {
    return text.split('\n').map(line => {
        const dir = getLineDirection(line);
        return bidiReorderLine(line, dir);
    }).join('\n');
}

// ==================== Shared Element Builders ====================

function buildHeaderRow(displayName: string, username: string, avatarSrc: string, avatarSize = AVATAR_SIZE, verifiedType?: string): any {
    const badgeSvg = getVerifiedBadgeSvg(verifiedType);
    return {
        type: 'div',
        props: {
            style: {
                display: 'flex',
                alignItems: 'center',
                marginBottom: '20px',
                width: '100%',
            },
            children: [
                // Avatar
                {
                    type: 'img',
                    props: {
                        src: avatarSrc,
                        width: avatarSize,
                        height: avatarSize,
                        style: { borderRadius: '50%', marginRight: '14px' },
                    },
                },
                // Name + username stacked
                {
                    type: 'div',
                    props: {
                        style: {
                            display: 'flex',
                            flexDirection: 'column',
                            flexGrow: 1,
                        },
                        children: [
                            // Name row with verified badge
                            {
                                type: 'div',
                                props: {
                                    style: {
                                        display: 'flex',
                                        alignItems: 'center',
                                    },
                                    children: [
                                        {
                                            type: 'span',
                                            props: {
                                                style: {
                                                    color: TEXT_COLOR,
                                                    fontSize: `${NAME_FONT_SIZE}px`,
                                                    fontWeight: 700,
                                                    marginRight: '6px',
                                                },
                                                children: displayName,
                                            },
                                        },
                                        ...(badgeSvg ? [{
                                            type: 'img',
                                            props: {
                                                src: badgeSvg,
                                                width: 28,
                                                height: 28,
                                            },
                                        }] : []),
                                    ],
                                },
                            },
                            // @username
                            {
                                type: 'span',
                                props: {
                                    style: {
                                        color: SECONDARY_COLOR,
                                        fontSize: `${USERNAME_FONT_SIZE}px`,
                                    },
                                    children: `@${username}`,
                                },
                            },
                        ],
                    },
                },
                // Grok logo (right side)
                {
                    type: 'img',
                    props: {
                        src: GROK_LOGO_SVG,
                        width: 36,
                        height: 36,
                    },
                },
            ],
        },
    };
}

/**
 * Estimate max characters per visual line based on font size.
 * Conservative to avoid overflow — satori will right-align short lines.
 */
function estimateCharsPerLine(fontSize: number): number {
    const contentWidth = CARD_WIDTH - (CARD_PADDING * 2);
    const avgCharWidth = fontSize * 0.55; // conservative average for Rubik
    return Math.floor(contentWidth / avgCharWidth);
}

/**
 * Soft-wrap a paragraph into visual lines at word boundaries.
 * Preserves explicit \n line breaks. Long lines are wrapped at ~maxChars.
 */
function softWrapText(text: string, maxChars: number): string[] {
    const paragraphs = text.split('\n');
    const result: string[] = [];

    for (const para of paragraphs) {
        if (!para.trim()) {
            result.push(''); // preserve empty lines
            continue;
        }

        const words = para.split(/( +)/); // split keeping spaces
        let currentLine = '';

        for (const word of words) {
            if ((currentLine + word).length > maxChars && currentLine.trim().length > 0) {
                result.push(currentLine.trimEnd());
                currentLine = word.trimStart();
            } else {
                currentLine += word;
            }
        }
        if (currentLine.trim()) result.push(currentLine.trimEnd());
    }

    return result;
}

/**
 * Build text block with per-line direction detection.
 * Long lines are pre-wrapped before BiDi processing so each visual line
 * gets independently reordered — fixing multi-line RTL wrapping.
 */
function buildTextBlock(text: string, fontSize: number, emojiUrls?: Map<string, string>): any {
    const maxChars = estimateCharsPerLine(fontSize);
    const wrappedLines = softWrapText(text, maxChars);

    const lineElements = wrappedLines.map(line => {
        if (!line.trim()) {
            return {
                type: 'div',
                props: { style: { display: 'flex', height: '14px' } },
            };
        }
        const dir = getLineDirection(line);
        const reordered = bidiReorderLine(line, dir);
        const segments = textWithEmojisRaw(reordered, fontSize, emojiUrls);
        return {
            type: 'div',
            props: {
                style: {
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    justifyContent: dir === 'rtl' ? 'flex-end' : 'flex-start',
                    color: TEXT_COLOR,
                    fontSize: `${fontSize}px`,
                    lineHeight: '1.6',
                    wordBreak: 'break-word',
                    width: '100%',
                },
                children: segments,
            },
        };
    });

    return {
        type: 'div',
        props: {
            style: {
                display: 'flex',
                flexDirection: 'column',
                width: '100%',
            },
            children: lineElements,
        },
    };
}

function buildTimestamp(timestamp: string | undefined): any[] {
    if (!timestamp) return [];
    return [{
        type: 'div',
        props: {
            style: {
                display: 'flex',
                color: SECONDARY_COLOR,
                fontSize: `${TIMESTAMP_FONT_SIZE}px`,
                marginTop: '20px',
            },
            children: timestamp,
        },
    }];
}

function buildSeparator(): any {
    return {
        type: 'div',
        props: {
            style: {
                display: 'flex',
                height: '2px',
                backgroundColor: BORDER_COLOR,
                width: '100%',
                marginTop: '20px',
                marginBottom: '20px',
            },
        },
    };
}

function buildReactionBar(): any {
    const icons = [ICON_COMMENT, ICON_RETWEET, ICON_HEART, ICON_BOOKMARK, ICON_SHARE];
    return {
        type: 'div',
        props: {
            style: {
                display: 'flex',
                justifyContent: 'space-between',
                width: '100%',
                paddingRight: '72px',
            },
            children: icons.map(src => ({
                type: 'img',
                props: {
                    src,
                    width: ICON_SIZE,
                    height: ICON_SIZE,
                },
            })),
        },
    };
}

// ==================== Single Tweet Card ====================

interface TweetCardData {
    displayName: string;
    username: string;
    text: string;
    profileImageUrl?: string | null;
    timestamp?: string;
}

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
        fonts: FONT_CONFIG(fonts),
    });

    const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: CARD_WIDTH } });
    const png = resvg.render();
    return png.asPng();
}

function buildTweetCardElement(data: TweetCardData, avatarSrc: string, emojiUrls?: Map<string, string>): any {
    return {
        type: 'div',
        props: {
            style: {
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
                backgroundColor: BG_COLOR,
                width: '100%',
                minHeight: `${CARD_MIN_HEIGHT}px`,
                maxHeight: `${CARD_MAX_HEIGHT}px`,
            },
            children: [
                // Inner card content
                {
                    type: 'div',
                    props: {
                        style: {
                            display: 'flex',
                            flexDirection: 'column',
                            width: '100%',
                            padding: `${CARD_PADDING}px`,
                        },
                        children: [
                            buildHeaderRow(data.displayName, data.username, avatarSrc),
                            buildTextBlock(data.text, TEXT_FONT_SIZE, emojiUrls),
                            ...buildTimestamp(data.timestamp),
                            buildSeparator(),
                            buildReactionBar(),
                        ],
                    },
                },
            ],
        },
    };
}

// ==================== Thread Cards ====================

export async function renderThreadCards(
    env: Env,
    tweets: TweetCardData[]
): Promise<Uint8Array[]> {
    await ensureInit();
    const fonts = await loadFonts(env);

    const firstTweet = tweets[0];
    const avatarSrc = firstTweet.profileImageUrl
        ? await getProfileImageDataUri(env, firstTweet.username, firstTweet.profileImageUrl)
        : getDefaultAvatarDataUri();

    const allText = tweets.map(t => t.text).join(' ');
    const emojiUrls = await resolveEmojiUrls(env, allText);

    const fontData = FONT_CONFIG(fonts);
    const results: Uint8Array[] = [];

    for (let i = 0; i < tweets.length; i++) {
        const isFirst = i === 0;
        const isLast = i === tweets.length - 1;
        const cardContent = buildThreadCardElement(tweets[i], avatarSrc, isFirst, isLast, emojiUrls);

        const element = {
            type: 'div',
            props: {
                style: {
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    alignItems: 'center',
                    backgroundColor: BG_COLOR,
                    width: '100%',
                    minHeight: `${CARD_MIN_HEIGHT}px`,
                    maxHeight: `${CARD_MAX_HEIGHT}px`,
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
    return {
        type: 'div',
        props: {
            style: {
                display: 'flex',
                padding: `${CARD_PADDING}px`,
                paddingBottom: isLast ? `${CARD_PADDING}px` : '8px',
                paddingTop: isFirst ? `${CARD_PADDING}px` : '8px',
                width: '100%',
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
                            marginRight: '18px',
                            width: `${AVATAR_SIZE}px`,
                        },
                        children: [
                            ...(!isFirst ? [{
                                type: 'div',
                                props: {
                                    style: {
                                        width: '3px',
                                        height: '14px',
                                        backgroundColor: BORDER_COLOR,
                                    },
                                },
                            }] : []),
                            {
                                type: 'img',
                                props: {
                                    src: avatarSrc,
                                    width: AVATAR_SIZE,
                                    height: AVATAR_SIZE,
                                    style: { borderRadius: '50%' },
                                },
                            },
                            ...(!isLast ? [{
                                type: 'div',
                                props: {
                                    style: {
                                        width: '3px',
                                        flexGrow: 1,
                                        backgroundColor: BORDER_COLOR,
                                        marginTop: '7px',
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
                            // Name + username stacked (first card only)
                            ...(isFirst ? [
                                {
                                    type: 'div',
                                    props: {
                                        style: { display: 'flex', alignItems: 'center', marginBottom: '2px' },
                                        children: [
                                            {
                                                type: 'span',
                                                props: {
                                                    style: { color: TEXT_COLOR, fontSize: `${NAME_FONT_SIZE}px`, fontWeight: 700, marginRight: '6px' },
                                                    children: data.displayName,
                                                },
                                            },
                                            ...((() => {
                                                const badge = getVerifiedBadgeSvg();
                                                return badge ? [{
                                                    type: 'img',
                                                    props: { src: badge, width: 24, height: 24 },
                                                }] : [];
                                            })()),
                                        ],
                                    },
                                },
                                {
                                    type: 'span',
                                    props: {
                                        style: { color: SECONDARY_COLOR, fontSize: `${USERNAME_FONT_SIZE}px`, marginBottom: '7px' },
                                        children: `@${data.username}`,
                                    },
                                },
                            ] : []),
                            // Tweet text
                            buildTextBlock(data.text, TEXT_FONT_SIZE, emojiUrls),
                            // Timestamp + separator + reactions (only on last card)
                            ...(isLast ? [
                                ...buildTimestamp(data.timestamp),
                                buildSeparator(),
                                buildReactionBar(),
                            ] : []),
                        ],
                    },
                },
            ],
        },
    };
}

// ==================== Quote Tweet Card ====================

interface QuoteTweetCardData {
    commentText: string;
    commentDisplayName: string;
    commentUsername: string;
    commentProfileImageUrl?: string | null;
    originalText: string;
    originalDisplayName: string;
    originalUsername: string;
    originalProfileImageUrl?: string | null;
    originalVerifiedType?: string;
    timestamp?: string;
}

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

    const allText = `${data.commentText} ${data.originalText}`;
    const emojiUrls = await resolveEmojiUrls(env, allText);

    // Text blocks are built inline below using buildTextBlock (handles per-line RTL)

    const element = {
        type: 'div',
        props: {
            style: {
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
                backgroundColor: BG_COLOR,
                width: '100%',
                minHeight: `${CARD_MIN_HEIGHT}px`,
                maxHeight: `${CARD_MAX_HEIGHT}px`,
            },
            children: [
                // Inner content
                {
                    type: 'div',
                    props: {
                        style: {
                            display: 'flex',
                            flexDirection: 'column',
                            width: '100%',
                            padding: `${CARD_PADDING}px`,
                        },
                        children: [
                            // Comment header
                            buildHeaderRow(data.commentDisplayName, data.commentUsername, commentAvatarSrc),
                            // Comment text
                            buildTextBlock(data.commentText, TEXT_FONT_SIZE, emojiUrls),
                            // Embedded original tweet
                            {
                                type: 'div',
                                props: {
                                    style: {
                                        display: 'flex',
                                        flexDirection: 'column',
                                        border: `1px solid ${BORDER_COLOR}`,
                                        borderRadius: '12px',
                                        padding: '12px',
                                    },
                                    children: [
                                        // Original author header (stacked)
                                        buildHeaderRow(data.originalDisplayName, data.originalUsername, originalAvatarSrc, 44, data.originalVerifiedType),
                                        // Original text (same font size as regular tweet)
                                        buildTextBlock(data.originalText, TEXT_FONT_SIZE, emojiUrls),
                                    ],
                                },
                            },
                            // Timestamp + separator + reactions
                            ...buildTimestamp(data.timestamp),
                            buildSeparator(),
                            buildReactionBar(),
                        ],
                    },
                },
            ],
        },
    };

    const svg = await satori(element, {
        width: CARD_WIDTH,
        fonts: FONT_CONFIG(fonts),
    });

    const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: CARD_WIDTH } });
    const png = resvg.render();
    return png.asPng();
}

// ==================== Story Image (9:16) ====================

/**
 * Create a 9:16 story image by embedding the card PNG in a black SVG frame.
 * No satori needed — just raw SVG with embedded image, rendered by resvg.
 */
export async function createStoryImage(
    _env: Env,
    cardPng: Uint8Array
): Promise<Uint8Array> {
    await ensureInit();

    const cardBase64 = arrayBufferToBase64(cardPng.buffer as ArrayBuffer);

    // Use card's native width (1080) for story width, calculate 9:16 height
    const storyWidth = CARD_WIDTH;
    const storyHeight = Math.round(CARD_WIDTH * (16 / 9));
    const cardPadding = 40;
    const cardDisplayWidth = storyWidth - (cardPadding * 2);

    // Center the card vertically
    const cardY = Math.round((storyHeight - cardDisplayWidth) / 2); // approximate — card is roughly square

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${storyWidth}" height="${storyHeight}">
  <rect width="${storyWidth}" height="${storyHeight}" fill="#000000"/>
  <image href="data:image/png;base64,${cardBase64}" x="${cardPadding}" y="${cardY}" width="${cardDisplayWidth}" preserveAspectRatio="xMidYMid meet"/>
</svg>`;

    const resvg = new Resvg(svg, {
        fitTo: { mode: 'width', value: storyWidth },
    });
    const png = resvg.render();
    return png.asPng();
}

// ==================== R2 Storage ====================

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
