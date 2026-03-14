/**
 * Settings views
 */

import type { ViewResult, InlineButton, PublishTargets } from '../types';
import { t } from '../ui/strings';
import type { Lang } from '../ui/strings';
import { homeButton, backButton, backHomeRow, selectedItemLabel } from '../ui/components';
import { renderPlatformBadges, parsePublishTargets } from './platform-toggle';

export function renderSettings(timezone: string, pageSize = 5, lang: Lang = 'en', workerUrl?: string, staleCount = 0, isAdminUser = false, defaultTargets?: string, hasInstagram = false, repostDefaults?: { fastGenerateImage: boolean; analyzeSourceImage: boolean }, commitDefaults?: { commitFastImage: boolean; commitFastAi: boolean }): ViewResult {
    const displayTz = timezone === 'UTC' ? t(lang, 'settings.utcDefault') : timezone;
    const langLabel = lang === 'en' ? '🌐 🇮🇱 עברית' : '🌐 🇺🇸 English' ;

    const keyboard: InlineButton[][] = [
        // Row 1: timezone | language | page size
        [
            { text: t(lang, 'settings.btnTimezone'), callback_data: 'view:timezone_select' },
            { text: langLabel, callback_data: 'config:language' },
            { text: t(lang, 'settings.btnPageSize'), callback_data: 'view:page_size_select' },
        ],
    ];

    // Row 2: system prompt | re-analyze
    if (workerUrl) {
        const promptLabel = staleCount > 0
            ? '📝 ' + t(lang, 'settings.btnSystemPrompts') + ' 🔔'
            : '📝 ' + t(lang, 'settings.btnSystemPrompts');
        keyboard.push([
            { text: promptLabel, web_app: { url: `${workerUrl}/app/prompts?lang=${lang}` } },
            { text: t(lang, 'settings.btnAnalyzeIdentity'), callback_data: 'settings:reanalyze_identity' },
        ]);

        // Row 3: system prompt admin (admin only)
        if (isAdminUser) {
            keyboard.push([{ text: '📝 ' + t(lang, 'settings.btnSystemPromptsAdmin'), web_app: { url: `${workerUrl}/app/admin-prompts` } }]);
        }
    } else {
        console.warn('WORKER_URL not configured — System Prompts WebApp button hidden');
        keyboard.push([{ text: t(lang, 'settings.btnAnalyzeIdentity'), callback_data: 'settings:reanalyze_identity' }]);
    }

    // Row 4: default publish targets
    const targets = parsePublishTargets(defaultTargets);
    const badges = renderPlatformBadges(targets);
    keyboard.push([{
        text: `🎯 ${t(lang, 'platforms.defaultPlatforms')} ${badges}`,
        callback_data: 'settings:plat:show',
    }]);

    // Row 5: repost defaults
    if (repostDefaults) {
        const check = (v: boolean) => v ? 'ON' : 'OFF';
        keyboard.push([
            { text: `${t(lang, 'settings.btnFastImage')}: ${check(repostDefaults.fastGenerateImage)}`, callback_data: 'settings:rp:fast_image' },
            { text: `${t(lang, 'settings.btnSourceAnalysis')}: ${check(repostDefaults.analyzeSourceImage)}`, callback_data: 'settings:rp:source_analysis' },
        ]);
    }

    // Row 6: commit defaults
    if (commitDefaults) {
        const check = (v: boolean) => v ? 'ON' : 'OFF';
        keyboard.push([
            { text: `${t(lang, 'settings.btnCommitFastImage')}: ${check(commitDefaults.commitFastImage)}`, callback_data: 'settings:commit:fast_image' },
            { text: `${t(lang, 'settings.btnCommitFastAi')}: ${check(commitDefaults.commitFastAi)}`, callback_data: 'settings:commit:fast_ai' },
        ]);
    }

    // Row 7: api keys
    keyboard.push(
        [{ text: t(lang, 'settings.btnApiKeys'), callback_data: 'settings:keys' }],
        [homeButton(lang)],
    );

    let text = `${t(lang, 'settings.title')}

${t(lang, 'settings.timezone')} ${t(lang, 'common.arrow')} <code>${displayTz}</code>
${t(lang, 'settings.pageSize')} ${t(lang, 'common.arrow')} <code>${pageSize} ${t(lang, 'settings.items')}</code>
${t(lang, 'settings.language')} ${t(lang, 'common.arrow')} <code>${lang === 'en' ? 'English' : 'עברית'}</code>`;

    if (repostDefaults) {
        const onOff = (v: boolean) => v ? '✅' : '⬜';
        text += `\n\n${t(lang, 'settings.repostDefaults')}
${onOff(repostDefaults.fastGenerateImage)} ${t(lang, 'settings.btnFastImage')}
${onOff(repostDefaults.analyzeSourceImage)} ${t(lang, 'settings.btnSourceAnalysis')}`;
    }

    if (commitDefaults) {
        const onOff = (v: boolean) => v ? '✅' : '⬜';
        text += `\n\n${t(lang, 'settings.commitDefaults')}
${onOff(commitDefaults.commitFastImage)} ${t(lang, 'settings.btnCommitFastImage')}
${onOff(commitDefaults.commitFastAi)} ${t(lang, 'settings.btnCommitFastAi')}`;
    }

    return { text, keyboard };
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

${t(lang, 'settings.pageSizeCurrent')} ${t(lang, 'common.arrow')} <code>${currentSize}</code>`,
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

${g ? '✅' : '⬜'} ${t(lang, 'settings.geminiAi')} ${t(lang, 'common.arrow')} <code>${g ? t(lang, 'settings.connected') : t(lang, 'settings.notConnected')}</code>
${x ? '✅' : '⬜'} ${t(lang, 'settings.xTwitter')} ${t(lang, 'common.arrow')} <code>${x ? t(lang, 'settings.connected') : t(lang, 'settings.notConnected')}</code>
${gh ? '✅' : '⬜'} ${t(lang, 'settings.github')} ${t(lang, 'common.arrow')} <code>${gh ? t(lang, 'settings.connected') : t(lang, 'settings.notConnected')}</code>
${ig ? '✅' : '⬜'} ${t(lang, 'settings.instagram')} ${t(lang, 'common.arrow')} <code>${ig ? t(lang, 'settings.connected') : t(lang, 'settings.notConnected')}</code>`,
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
