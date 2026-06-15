/**
 * Settings views — home summary + category sub-pages
 */

import type { ViewResult, InlineButton } from '../types';
import { t } from '../ui/strings';
import type { Lang } from '../ui/strings';
import { homeButton, backButton, backHomeRow, selectedItemLabel } from '../ui/components';
import { renderPlatformBadges, parsePublishTargets } from './platform-toggle';

// ==================== SETTINGS HOME ====================

export function renderSettings(
    timezone: string,
    pageSize: number,
    lang: Lang,
    staleCount: number,
    repostDefaults: { fastGenerateImage: boolean; analyzeSourceImage: boolean },
    commitDefaults: { commitFastImage: boolean; commitFastAi: boolean },
    repoDefaults: { autoOverview: boolean; defaultWatchPushes: boolean },
    defaultTargets?: string,
    aiProvider: 'gemini' | 'claude' = 'gemini',
): ViewResult {
    const displayTz = timezone === 'UTC' ? t(lang, 'settings.utcDefault') : timezone;
    const onOff = (v: boolean) => v ? '✅' : '⬜';
    const targets = parsePublishTargets(defaultTargets);
    const badges = renderPlatformBadges(targets);

    // Skills badge if stale prompts exist
    const skillsLabel = staleCount > 0
        ? `${t(lang, 'settings.btnCatSkills')} 🔔`
        : t(lang, 'settings.btnCatSkills');

    const keyboard: InlineButton[][] = [
        [
            { text: t(lang, 'settings.btnCatGeneral'), callback_data: 'settings:sub:general' },
            { text: skillsLabel, callback_data: 'settings:sub:skills' },
            { text: t(lang, 'settings.btnCatPlatforms'), callback_data: 'settings:sub:platforms' },
        ],
        [
            { text: t(lang, 'settings.btnCatRepost'), callback_data: 'settings:sub:repost' },
            { text: t(lang, 'settings.btnCatCommits'), callback_data: 'settings:sub:commits' },
            { text: t(lang, 'settings.btnCatRepos'), callback_data: 'settings:sub:repos' },
        ],
        [homeButton(lang)],
    ];

    const text = `${t(lang, 'settings.title')}

${t(lang, 'settings.timezone')} ${t(lang, 'common.arrow')} <code>${displayTz}</code>
${t(lang, 'settings.pageSize')} ${t(lang, 'common.arrow')} <code>${pageSize} ${t(lang, 'settings.items')}</code>
${t(lang, 'settings.language')} ${t(lang, 'common.arrow')} <code>${lang === 'en' ? 'English' : 'עברית'}</code>
🧠 ${t(lang, 'common.arrow')} ${aiProvider === 'claude' ? 'Claude' : 'Gemini'}
🎯 ${t(lang, 'common.arrow')} ${badges}

${t(lang, 'settings.repostDefaults')}
${onOff(repostDefaults.fastGenerateImage)} ${t(lang, 'settings.btnFastImage')}
${onOff(repostDefaults.analyzeSourceImage)} ${t(lang, 'settings.btnSourceAnalysis')}

${t(lang, 'settings.commitDefaults')}
${onOff(commitDefaults.commitFastImage)} ${t(lang, 'settings.btnCommitFastImage')}
${onOff(commitDefaults.commitFastAi)} ${t(lang, 'settings.btnCommitFastAi')}

${t(lang, 'settings.repoDefaults')}
${onOff(repoDefaults.autoOverview)} ${t(lang, 'settings.btnAutoOverview')}
${onOff(repoDefaults.defaultWatchPushes)} ${t(lang, 'settings.btnWatchPushes')}`;

    return { text, keyboard };
}

// ==================== GENERAL SUB-PAGE ====================

export function renderSettingsGeneral(timezone: string, pageSize: number, lang: Lang): ViewResult {
    const displayTz = timezone === 'UTC' ? t(lang, 'settings.utcDefault') : timezone;
    const langLabel = lang === 'en' ? '🌐 🇮🇱 עברית' : '🌐 🇺🇸 English';

    const text = `${t(lang, 'settings.subGeneralTitle')}

${t(lang, 'settings.timezone')} ${t(lang, 'common.arrow')} <code>${displayTz}</code>
<i>${t(lang, 'settings.descTimezone')}</i>

${t(lang, 'settings.language')} ${t(lang, 'common.arrow')} <code>${lang === 'en' ? 'English' : 'עברית'}</code>
<i>${t(lang, 'settings.descLanguage')}</i>

${t(lang, 'settings.pageSize')} ${t(lang, 'common.arrow')} <code>${pageSize} ${t(lang, 'settings.items')}</code>
<i>${t(lang, 'settings.descPageSize')}</i>`;

    return {
        text,
        keyboard: [
            [
                { text: t(lang, 'settings.btnTimezone'), callback_data: 'view:timezone_select' },
                { text: langLabel, callback_data: 'config:language' },
                { text: t(lang, 'settings.btnPageSize'), callback_data: 'view:page_size_select' },
            ],
            [backButton('view:settings', lang)],
        ],
    };
}

// ==================== SKILLS SUB-PAGE ====================

export function renderSettingsSkills(lang: Lang, workerUrl?: string, staleCount = 0, isAdminUser = false, identityDepth = 200): ViewResult {
    const keyboard: InlineButton[][] = [];

    if (workerUrl) {
        const promptLabel = staleCount > 0
            ? '📝 ' + t(lang, 'settings.btnSystemPrompts') + ' 🔔'
            : '📝 ' + t(lang, 'settings.btnSystemPrompts');
        keyboard.push([{ text: promptLabel, web_app: { url: `${workerUrl}/app/prompts?lang=${lang}` } }]);

        if (isAdminUser) {
            keyboard.push([{ text: '📝 ' + t(lang, 'settings.btnSystemPromptsAdmin'), web_app: { url: `${workerUrl}/app/admin-prompts` } }]);
        }
    }

    keyboard.push([{ text: t(lang, 'settings.btnAnalyzeIdentity'), callback_data: 'settings:reanalyze_identity' }]);
    keyboard.push([{ text: t(lang, 'settings.btnTweetDepth'), callback_data: 'view:identity_depth_select' }]);
    keyboard.push([backButton('view:settings', lang)]);

    const text = `${t(lang, 'settings.subSkillsTitle')}

📝 <b>${t(lang, 'settings.btnSystemPrompts')}</b>${staleCount > 0 ? ' 🔔' : ''}
<i>${t(lang, 'settings.descSystemPrompts')}</i>

🪞 <b>${t(lang, 'settings.btnAnalyzeIdentity')}</b>
<i>${t(lang, 'settings.descAnalyzeIdentity')}</i>

${t(lang, 'settings.tweetDepth')} ${t(lang, 'common.arrow')} <code>${identityDepth}</code>
<i>${t(lang, 'settings.descTweetDepth')}</i>`;

    return { text, keyboard };
}

// ==================== PLATFORMS SUB-PAGE ====================

export function renderSettingsPlatforms(lang: Lang, defaultTargets?: string, hasInstagram = false, aiProvider: 'gemini' | 'claude' = 'gemini'): ViewResult {
    const targets = parsePublishTargets(defaultTargets);
    const badges = renderPlatformBadges(targets);
    const providerLabel = aiProvider === 'claude' ? 'Claude' : 'Gemini';
    const switchTo = aiProvider === 'claude' ? 'gemini' : 'claude';
    const switchLabel = aiProvider === 'claude' ? t(lang, 'settings.switchToGemini') : t(lang, 'settings.switchToClaude');

    const text = `${t(lang, 'settings.subPlatformsTitle')}

🧠 <b>${t(lang, 'settings.aiProvider')}</b> ${t(lang, 'common.arrow')} ${providerLabel}
<i>${t(lang, 'settings.descAiProvider')}</i>

🎯 <b>${t(lang, 'platforms.defaultPlatforms')}</b> ${badges}
<i>${t(lang, 'settings.descDefaultPlatforms')}</i>

🔑 <b>${t(lang, 'settings.btnApiKeys')}</b>
<i>${t(lang, 'settings.descApiKeys')}</i>`;

    return {
        text,
        keyboard: [
            [{ text: `🧠 ${t(lang, 'settings.aiProvider')}: ${providerLabel} ${t(lang, 'common.arrow')} ${switchLabel}`, callback_data: `settings:ai_provider:${switchTo}` }],
            [{ text: `🎯 ${t(lang, 'platforms.defaultPlatforms')} ${badges}`, callback_data: 'settings:plat:show' }],
            [{ text: t(lang, 'settings.btnApiKeys'), callback_data: 'settings:keys' }],
            [backButton('view:settings', lang)],
        ],
    };
}

// ==================== REPOST SUB-PAGE ====================

export function renderSettingsRepost(repostDefaults: { fastGenerateImage: boolean; analyzeSourceImage: boolean }, lang: Lang): ViewResult {
    const onOff = (v: boolean) => v ? '✅ ON' : '⬜ OFF';

    const text = `${t(lang, 'settings.subRepostTitle')}

${t(lang, 'settings.btnFastImage')}: ${onOff(repostDefaults.fastGenerateImage)}
<i>${t(lang, 'settings.descFastImage')}</i>

${t(lang, 'settings.btnSourceAnalysis')}: ${onOff(repostDefaults.analyzeSourceImage)}
<i>${t(lang, 'settings.descSourceAnalysis')}</i>`;

    return {
        text,
        keyboard: [
            [
                { text: `${t(lang, 'settings.btnFastImage')}: ${repostDefaults.fastGenerateImage ? 'ON' : 'OFF'}`, callback_data: 'settings:rp:fast_image' },
                { text: `${t(lang, 'settings.btnSourceAnalysis')}: ${repostDefaults.analyzeSourceImage ? 'ON' : 'OFF'}`, callback_data: 'settings:rp:source_analysis' },
            ],
            [backButton('view:settings', lang)],
        ],
    };
}

// ==================== COMMITS SUB-PAGE ====================

export function renderSettingsCommits(commitDefaults: { commitFastImage: boolean; commitFastAi: boolean }, lang: Lang): ViewResult {
    const onOff = (v: boolean) => v ? '✅ ON' : '⬜ OFF';

    const text = `${t(lang, 'settings.subCommitsTitle')}

${t(lang, 'settings.btnCommitFastImage')}: ${onOff(commitDefaults.commitFastImage)}
<i>${t(lang, 'settings.descCommitFastImage')}</i>

${t(lang, 'settings.btnCommitFastAi')}: ${onOff(commitDefaults.commitFastAi)}
<i>${t(lang, 'settings.descCommitFastAi')}</i>`;

    return {
        text,
        keyboard: [
            [
                { text: `${t(lang, 'settings.btnCommitFastImage')}: ${commitDefaults.commitFastImage ? 'ON' : 'OFF'}`, callback_data: 'settings:commit:fast_image' },
                { text: `${t(lang, 'settings.btnCommitFastAi')}: ${commitDefaults.commitFastAi ? 'ON' : 'OFF'}`, callback_data: 'settings:commit:fast_ai' },
            ],
            [backButton('view:settings', lang)],
        ],
    };
}

// ==================== REPOS SUB-PAGE ====================

export function renderSettingsRepos(repoDefaults: { autoOverview: boolean; defaultWatchPushes: boolean }, lang: Lang): ViewResult {
    const onOff = (v: boolean) => v ? '✅ ON' : '⬜ OFF';

    const text = `${t(lang, 'settings.subReposTitle')}

<i>${t(lang, 'settings.subReposNote')}</i>

${t(lang, 'settings.btnAutoOverview')}: ${onOff(repoDefaults.autoOverview)}
<i>${t(lang, 'settings.descAutoOverview')}</i>

${t(lang, 'settings.btnWatchPushes')}: ${onOff(repoDefaults.defaultWatchPushes)}
<i>${t(lang, 'settings.descWatchPushes')}</i>`;

    return {
        text,
        keyboard: [
            [
                { text: `${t(lang, 'settings.btnAutoOverview')}: ${repoDefaults.autoOverview ? 'ON' : 'OFF'}`, callback_data: 'settings:repo:auto_overview' },
                { text: `${t(lang, 'settings.btnWatchPushes')}: ${repoDefaults.defaultWatchPushes ? 'ON' : 'OFF'}`, callback_data: 'settings:repo:watch_pushes' },
            ],
            [backButton('view:settings', lang)],
        ],
    };
}

// ==================== EXISTING SUB-VIEWS (page size, timezone, API keys) ====================

export function renderPageSizeSelect(currentSize = 5, lang: Lang = 'en'): ViewResult {
    const sizes = [5, 10, 15, 20];
    const buttons: InlineButton[][] = [
        sizes.map(s => ({
            text: selectedItemLabel(`${s}`, s === currentSize),
            callback_data: `config:page_size:${s}`,
        })),
        [backButton('settings:sub:general', lang)],
    ];

    return {
        text: `${t(lang, 'settings.pageSizeTitle')}

${t(lang, 'settings.pageSizeDesc')}

${t(lang, 'settings.pageSizeCurrent')} ${t(lang, 'common.arrow')} <code>${currentSize}</code>`,
        keyboard: buttons,
    };
}

export function renderIdentityDepthSelect(currentDepth = 200, lang: Lang = 'en'): ViewResult {
    const depths = [100, 200, 400];
    const buttons: InlineButton[][] = [
        depths.map(n => ({
            text: selectedItemLabel(`${n}`, n === currentDepth),
            callback_data: `config:identity_depth:${n}`,
        })),
        [backButton('settings:sub:skills', lang)],
    ];

    return {
        text: `${t(lang, 'settings.tweetDepthTitle')}

${t(lang, 'settings.tweetDepthDesc')}

${t(lang, 'settings.tweetDepthCurrent')} ${t(lang, 'common.arrow')} <code>${currentDepth}</code>`,
        keyboard: buttons,
    };
}

export function renderApiKeys(services: {
    hasGemini: boolean;
    hasClaude: boolean;
    hasX: boolean;
    hasGitHub: boolean;
    hasInstagram: boolean;
    hasLinkedIn: boolean;
}, lang: Lang = 'en'): ViewResult {
    const g = services.hasGemini;
    const cl = services.hasClaude;
    const x = services.hasX;
    const gh = services.hasGitHub;
    const ig = services.hasInstagram;
    const li = services.hasLinkedIn;

    return {
        text: `${t(lang, 'settings.apiKeysTitle')}

${g ? '✅' : '⬜'} ${t(lang, 'settings.geminiAi')} ${t(lang, 'common.arrow')} <code>${g ? t(lang, 'settings.connected') : t(lang, 'settings.notConnected')}</code>
${cl ? '✅' : '⬜'} ${t(lang, 'settings.claudeAi')} ${t(lang, 'common.arrow')} <code>${cl ? t(lang, 'settings.connected') : t(lang, 'settings.notConnected')}</code>
${x ? '✅' : '⬜'} ${t(lang, 'settings.xTwitter')} ${t(lang, 'common.arrow')} <code>${x ? t(lang, 'settings.connected') : t(lang, 'settings.notConnected')}</code>
${gh ? '✅' : '⬜'} ${t(lang, 'settings.github')} ${t(lang, 'common.arrow')} <code>${gh ? t(lang, 'settings.connected') : t(lang, 'settings.notConnected')}</code>
${ig ? '✅' : '⬜'} ${t(lang, 'settings.instagram')} ${t(lang, 'common.arrow')} <code>${ig ? t(lang, 'settings.connected') : t(lang, 'settings.notConnected')}</code>
${li ? '✅' : '⬜'} ${t(lang, 'settings.linkedin')} ${t(lang, 'common.arrow')} <code>${li ? t(lang, 'settings.connected') : t(lang, 'settings.notConnected')}</code>`,
        keyboard: [
            [{ text: `${t(lang, 'settings.geminiAi')} \u2014 ${g ? t(lang, 'settings.update') : t(lang, 'settings.connect')}`, callback_data: 'settings:update:gemini', ...(g ? { style: 'success' as const } : {}) }],
            [{ text: `${t(lang, 'settings.claudeAi')} \u2014 ${cl ? t(lang, 'settings.update') : t(lang, 'settings.connect')}`, callback_data: 'settings:update:claude', ...(cl ? { style: 'success' as const } : {}) }],
            [{ text: `${t(lang, 'settings.xTwitter')} \u2014 ${x ? t(lang, 'settings.update') : t(lang, 'settings.connect')}`, callback_data: 'settings:update:x', ...(x ? { style: 'success' as const } : {}) }],
            [{ text: `${t(lang, 'settings.github')} \u2014 ${gh ? t(lang, 'settings.update') : t(lang, 'settings.connect')}`, callback_data: 'settings:update:github', ...(gh ? { style: 'success' as const } : {}) }],
            [{ text: `${t(lang, 'settings.instagram')} \u2014 ${ig ? t(lang, 'settings.update') : t(lang, 'settings.connect')}`, callback_data: 'settings:update:instagram', ...(ig ? { style: 'success' as const } : {}) }],
            [{ text: `${t(lang, 'settings.linkedin')} \u2014 ${li ? t(lang, 'settings.update') : t(lang, 'settings.connect')}`, callback_data: 'settings:update:linkedin', ...(li ? { style: 'success' as const } : {}) }],
            [backButton('settings:sub:platforms', lang)],
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
        [backButton('settings:sub:general', lang)],
    ];

    return {
        text: `${t(lang, 'settings.timezoneTitle')}

${t(lang, 'settings.timezoneDesc')}`,
        keyboard: presets,
    };
}

export function renderIdentityLangNotification(lang: Lang = 'en'): ViewResult {
    return {
        text: t(lang, 'settings.identityLangNotification'),
        keyboard: [
            [
                { text: t(lang, 'settings.btnReanalyzeIdentity'), callback_data: 'identity_lang:reanalyze' },
                { text: t(lang, 'settings.btnKeepDefault'), callback_data: 'identity_lang:keep_default' },
            ],
            [homeButton(lang)],
        ],
    };
}
