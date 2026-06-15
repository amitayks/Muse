/**
 * Platform Toggle View — renders the platform selection buttons
 */

import type { ViewResult, PublishTargets, PublishResults } from '../types';
import type { Lang } from '../ui/strings';
import { t } from '../ui/strings';

// ==================== Shared Platform Format Helpers ====================

const PLATFORM_EMOJIS: Record<string, string> = {
    x: '🐦',
    instagram_post: '📸',
    instagram_story: '📖',
    instagram_reel: '🎬',
    linkedin: '💼',
};

/** Map platform keys to i18n string keys */
const PLATFORM_I18N_KEYS: Record<string, string> = {
    x: 'platforms.x',
    instagram_post: 'platforms.post',
    instagram_story: 'platforms.story',
    instagram_reel: 'platforms.reel',
    linkedin: 'platforms.linkedin',
};

export function platformEmoji(platform: string): string {
    return PLATFORM_EMOJIS[platform] || platform;
}

export function platformLabel(platform: string, lang: Lang): string {
    const key = PLATFORM_I18N_KEYS[platform];
    return key ? t(lang, key) : platform;
}

/**
 * Format a per-platform summary like "🐦 X ✅ • 📸 Post ❌"
 */
export function formatPlatformSummary(results: PublishResults, lang: Lang): string {
    const parts: string[] = [];
    const platforms = ['x', 'instagram_post', 'instagram_story', 'instagram_reel', 'linkedin'] as const;
    for (const p of platforms) {
        if (results[p]) {
            parts.push(`${platformEmoji(p)} ${platformLabel(p, lang)} ✅`);
        } else if (results.errors?.[p]) {
            parts.push(`${platformEmoji(p)} ${platformLabel(p, lang)} ❌`);
        }
    }
    return parts.join(' • ');
}

/**
 * Render platform badges string from targets (e.g. "🐦 📸 📖")
 */
export function renderPlatformBadges(targets: PublishTargets): string {
    const badges: string[] = [];
    if (targets.x) badges.push(platformEmoji('x'));
    if (targets.instagram_post) badges.push(platformEmoji('instagram_post'));
    if (targets.instagram_story) badges.push(platformEmoji('instagram_story'));
    if (targets.instagram_reel) badges.push(platformEmoji('instagram_reel'));
    if (targets.linkedin) badges.push(platformEmoji('linkedin'));
    return badges.join(' ');
}

/**
 * Parse publish targets from JSON string
 */
export function parsePublishTargets(raw: string | null | undefined): PublishTargets {
    if (!raw) return { x: true, instagram_post: false, instagram_story: false, instagram_reel: false, linkedin: false };
    try {
        // Legacy rows predate the `linkedin` field — default it to false so old drafts don't target LinkedIn.
        return { linkedin: false, ...JSON.parse(raw) } as PublishTargets;
    } catch {
        return { x: true, instagram_post: false, instagram_story: false, instagram_reel: false, linkedin: false };
    }
}

/**
 * Render per-platform publish results with status indicators.
 */
export function renderPublishResults(results: Record<string, any>, errors: Record<string, string> | undefined, lang: Lang): string {
    const lines: string[] = [];
    const platforms = ['x', 'instagram_post', 'instagram_story', 'instagram_reel', 'linkedin'] as const;

    for (const p of platforms) {
        if (results[p]) {
            lines.push(`✅ ${platformEmoji(p)} ${platformLabel(p, lang)}`);
        } else if (errors?.[p]) {
            lines.push(`❌ ${platformEmoji(p)} ${platformLabel(p, lang)}`);
        }
    }

    return lines.join(' • ');
}
