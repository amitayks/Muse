/**
 * i18n string resolution — Lang type, t() function, string registry
 */

import { en } from './en';
import { he } from './he';
import type { StringsMap } from './en';

export type Lang = 'en' | 'he';

const strings: Record<Lang, StringsMap> = { en, he };

/**
 * Resolve a dot-path key to a string for the given language.
 * Falls back to English if the key is missing in the target language.
 * Returns the key itself as a last resort (visible bug indicator).
 */
export function t(lang: Lang, key: string): string {
    const value = resolve(strings[lang], key);
    if (value !== undefined) return value;
    // Fallback to English
    if (lang !== 'en') {
        const fallback = resolve(strings.en, key);
        if (fallback !== undefined) return fallback;
    }
    // Last resort: return the key itself
    return key;
}

function resolve(obj: Record<string, unknown>, path: string): string | undefined {
    const parts = path.split('.');
    let current: unknown = obj;
    for (const part of parts) {
        if (current === null || current === undefined || typeof current !== 'object') {
            return undefined;
        }
        current = (current as Record<string, unknown>)[part];
    }
    return typeof current === 'string' ? current : undefined;
}

export type { StringsMap };
