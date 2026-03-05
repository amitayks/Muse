/**
 * Settings views
 */

import type { ViewResult, InlineButton } from '../types';
import { t } from '../ui/strings';
import type { Lang } from '../ui/strings';
import { homeButton, backButton, backHomeRow, selectedItemLabel } from '../ui/components';

export function renderSettings(timezone: string, pageSize = 5, lang: Lang = 'en', workerUrl?: string, staleCount = 0, isAdminUser = false): ViewResult {
    const displayTz = timezone === 'UTC' ? t(lang, 'settings.utcDefault') : timezone;
    const langLabel = lang === 'en' ? '🌐 🇮🇱 עברית' : '🌐 🇺🇸 English' ;

    const keyboard: InlineButton[][] = [
        [{ text: langLabel, callback_data: 'config:language' }],
    ];

    // System Prompts button (WebApp) — only if worker URL is available
    if (workerUrl) {
        const promptLabel = staleCount > 0
            ? '📝 ' + t(lang, 'settings.btnSystemPrompts') + ' 🔔'
            : '📝 ' + t(lang, 'settings.btnSystemPrompts');
        keyboard.push([{ text: promptLabel, web_app: { url: `${workerUrl}/app/prompts?lang=${lang}` } }]);

        // Admin-only: System Prompts (Admin) button for all 7 prompt types
        if (isAdminUser) {
            keyboard.push([{ text: '📝 ' + t(lang, 'settings.btnSystemPromptsAdmin'), web_app: { url: `${workerUrl}/app/admin-prompts` } }]);
        }
    } else {
        console.warn('WORKER_URL not configured — System Prompts WebApp button hidden');
    }

    // Re-analyze identity button
    keyboard.push([{ text: '🪞 Re-analyze my identity', callback_data: 'settings:reanalyze_identity' }]);

    keyboard.push(
        [{ text: t(lang, 'settings.btnTimezone'), callback_data: 'view:timezone_select' }],
        [{ text: t(lang, 'settings.btnPageSize'), callback_data: 'view:page_size_select' }],
        [{ text: t(lang, 'settings.btnApiKeys'), callback_data: 'settings:keys' }],
        [homeButton(lang)],
    );

    return {
        text: `${t(lang, 'settings.title')}

${t(lang, 'settings.timezone')} ${displayTz}
${t(lang, 'settings.pageSize')} ${pageSize} ${t(lang, 'settings.items')}
${t(lang, 'settings.language')} ${lang === 'en' ? 'English' : 'עברית'}`,
        keyboard,
    };
}

export function renderPageSizeSelect(currentSize = 5, lang: Lang = 'en'): ViewResult {
    const sizes = [5, 10, 15, 20];
    const buttons: InlineButton[][] = [
        sizes.map(s => ({
            text: selectedItemLabel(`${s}`, s === currentSize),
            callback_data: `config:page_size:${s}`,
        })),
        backHomeRow('view:settings', lang),
    ];

    return {
        text: `${t(lang, 'settings.pageSizeTitle')}

${t(lang, 'settings.pageSizeDesc')}

${t(lang, 'settings.pageSizeCurrent')} <b>${currentSize}</b>`,
        keyboard: buttons,
    };
}

export function renderApiKeys(services: {
    hasGemini: boolean;
    hasX: boolean;
    hasGitHub: boolean;
    hasInstagram: boolean;
}, lang: Lang = 'en'): ViewResult {
    const g = services.hasGemini;
    const x = services.hasX;
    const gh = services.hasGitHub;
    const ig = services.hasInstagram;

    return {
        text: `${t(lang, 'settings.apiKeysTitle')}

${g ? '✅' : '⬜'} ${t(lang, 'settings.geminiAi')}
${x ? '✅' : '⬜'} ${t(lang, 'settings.xTwitter')}
${gh ? '✅' : '⬜'} ${t(lang, 'settings.github')}
${ig ? '✅' : '⬜'} ${t(lang, 'settings.instagram')}`,
        keyboard: [
            [{ text: `${t(lang, 'settings.geminiAi')} \u2014 ${g ? t(lang, 'settings.update') : t(lang, 'settings.connect')}`, callback_data: 'settings:update:gemini', ...(g ? { style: 'success' as const } : {}) }],
            [{ text: `${t(lang, 'settings.xTwitter')} \u2014 ${x ? t(lang, 'settings.update') : t(lang, 'settings.connect')}`, callback_data: 'settings:update:x', ...(x ? { style: 'success' as const } : {}) }],
            [{ text: `${t(lang, 'settings.github')} \u2014 ${gh ? t(lang, 'settings.update') : t(lang, 'settings.connect')}`, callback_data: 'settings:update:github', ...(gh ? { style: 'success' as const } : {}) }],
            [{ text: `${t(lang, 'settings.instagram')} \u2014 ${ig ? t(lang, 'settings.update') : t(lang, 'settings.connect')}`, callback_data: 'settings:update:instagram', ...(ig ? { style: 'success' as const } : {}) }],
            backHomeRow('view:settings', lang),
        ],
    };
}

export function renderTimezoneSelect(lang: Lang = 'en'): ViewResult {
    const presets: InlineButton[][] = [
        [
            { text: 'UTC-5', callback_data: 'config:timezone:UTC-5' },
            { text: 'UTC-4', callback_data: 'config:timezone:UTC-4' },
            { text: 'UTC-3', callback_data: 'config:timezone:UTC-3' },
        ],
        [
            { text: 'UTC', callback_data: 'config:timezone:UTC' },
            { text: 'UTC+1', callback_data: 'config:timezone:UTC+1' },
            { text: 'UTC+2', callback_data: 'config:timezone:UTC+2' },
        ],
        [
            { text: 'UTC+3', callback_data: 'config:timezone:UTC+3' },
            { text: 'UTC+4', callback_data: 'config:timezone:UTC+4' },
            { text: 'UTC+5', callback_data: 'config:timezone:UTC+5' },
        ],
        [
            { text: 'UTC+5:30', callback_data: 'config:timezone:UTC+5:30' },
            { text: 'UTC+8', callback_data: 'config:timezone:UTC+8' },
            { text: 'UTC+9', callback_data: 'config:timezone:UTC+9' },
        ],
        [{ text: t(lang, 'settings.timezoneCustom'), callback_data: 'config:timezone:custom' }],
        backHomeRow('view:settings', lang),
    ];

    return {
        text: `${t(lang, 'settings.timezoneTitle')}

${t(lang, 'settings.timezoneDesc')}`,
        keyboard: presets,
    };
}
