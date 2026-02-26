/**
 * Onboarding Views - Step-by-step key setup for new users
 * Note: All text uses HTML formatting (Telegram parse_mode: HTML)
 */

import type { ViewResult, InlineButton } from '../types';
import { homeButton } from '../ui/components';
import { t } from '../ui/strings';
import type { Lang } from '../ui/strings';

export function renderWelcome(lang: Lang = 'en'): ViewResult {
    return {
        text: [
            t(lang, 'onboarding.welcomeTitle'),
            '',
            t(lang, 'onboarding.welcomeSubtitle'),
            '',
            t(lang, 'onboarding.welcomeDesc'),
            '',
            t(lang, 'onboarding.welcomeSetup'),
            '',
            t(lang, 'onboarding.welcomeDisclaimer'),
        ].join('\n'),
        keyboard: [
            [{ text: t(lang, 'onboarding.btnGetStarted'), callback_data: 'onboard:start', style: 'primary' }],
            [{ text: t(lang, 'onboarding.btnLearnMore'), callback_data: 'onboard:learn' }],
        ],
    };
}

export function renderLearnMore(lang: Lang = 'en'): ViewResult {
    return {
        text: [
            t(lang, 'onboarding.learnTitle'),
            '',
            t(lang, 'onboarding.learnRepost'),
            t(lang, 'onboarding.learnGenerate'),
            t(lang, 'onboarding.learnHandwrite'),
            t(lang, 'onboarding.learnFollow'),
            '',
            t(lang, 'onboarding.learnKeys'),
            t(lang, 'onboarding.learnSecurity'),
        ].join('\n'),
        keyboard: [
            [{ text: t(lang, 'onboarding.btnGetStarted'), callback_data: 'onboard:start', style: 'primary' }],
        ],
    };
}

export function renderGeminiKeyPrompt(lang: Lang = 'en'): ViewResult {
    return {
        text: [
            t(lang, 'onboarding.geminiTitle'),
            '',
            t(lang, 'onboarding.geminiDesc'),
            '',
            t(lang, 'onboarding.geminiGetYours'),
            t(lang, 'onboarding.geminiLink'),
            '',
            t(lang, 'onboarding.geminiPaste'),
            '',
            t(lang, 'onboarding.geminiDeleteNote'),
        ].join('\n'),
        keyboard: [
            [{ text: t(lang, 'onboarding.btnHowToGet'), url: 'https://aistudio.google.com/apikey' }],
            [{ text: t(lang, 'onboarding.btnSkipForNow'), callback_data: 'onboard:skip_gemini' }],
        ],
    };
}

export function renderGeminiSuccess(lang: Lang = 'en'): ViewResult {
    return {
        text: t(lang, 'onboarding.geminiSuccess'),
        keyboard: [],
    };
}

export function renderXKeysPrompt(lang: Lang = 'en'): ViewResult {
    return {
        text: [
            t(lang, 'onboarding.xTitle'),
            '',
            t(lang, 'onboarding.xDesc'),
            '',
            t(lang, 'onboarding.xFormat'),
            '',
            t(lang, 'onboarding.xKey'),
            t(lang, 'onboarding.xSecret'),
            t(lang, 'onboarding.xAccessToken'),
            t(lang, 'onboarding.xAccessSecret'),
            '',
            t(lang, 'onboarding.xDeleteNote'),
        ].join('\n'),
        keyboard: [
            [{ text: t(lang, 'onboarding.btnHowToGetThem'), url: 'https://developer.x.com/en/portal/dashboard' }],
            [{ text: t(lang, 'onboarding.btnSkipForNow'), callback_data: 'onboard:skip_x' }],
        ],
    };
}

export function renderXSuccess(username?: string, lang: Lang = 'en'): ViewResult {
    const label = username ? ` (@${username})` : '';
    return {
        text: t(lang, 'onboarding.xSuccess').replace('{label}', label),
        keyboard: [],
    };
}

export function renderGitHubTokenPrompt(lang: Lang = 'en'): ViewResult {
    return {
        text: [
            t(lang, 'onboarding.githubTitle'),
            '',
            t(lang, 'onboarding.githubDesc'),
            '',
            t(lang, 'onboarding.githubCreate'),
            t(lang, 'onboarding.githubLink'),
            '',
            t(lang, 'onboarding.githubPaste'),
        ].join('\n'),
        keyboard: [
            [{ text: t(lang, 'onboarding.btnCreateToken'), url: 'https://github.com/settings/tokens' }],
            [{ text: t(lang, 'onboarding.btnSkip'), callback_data: 'onboard:skip_github' }],
        ],
    };
}

export function renderGitHubSuccess(username?: string, lang: Lang = 'en'): ViewResult {
    const label = username ? ` (${username})` : '';
    return {
        text: t(lang, 'onboarding.githubSuccess').replace('{label}', label),
        keyboard: [],
    };
}

export function renderComplete(services: {
    hasGemini: boolean;
    hasX: boolean;
    hasGitHub: boolean;
    hasHeyGen: boolean;
    xUsername?: string;
}, lang: Lang = 'en'): ViewResult {
    const lines = [
        t(lang, 'onboarding.completeTitle'),
        '',
        t(lang, 'onboarding.connected'),
    ];

    lines.push(services.hasGemini ? `✅ ${t(lang, 'settings.geminiAi')}` : `⬜ ${t(lang, 'settings.geminiAi')} (${t(lang, 'onboarding.skipped')})`);
    lines.push(services.hasX
        ? `✅ ${t(lang, 'settings.xTwitter')}${services.xUsername ? ` (@${services.xUsername})` : ''}`
        : `⬜ ${t(lang, 'settings.xTwitter')} (${t(lang, 'onboarding.skipped')})`);
    lines.push(services.hasGitHub ? `✅ ${t(lang, 'settings.github')}` : `⬜ ${t(lang, 'settings.github')} (${t(lang, 'onboarding.skipped')})`);
    lines.push(services.hasHeyGen ? '✅ HeyGen' : `⬜ HeyGen (${t(lang, 'onboarding.skipped')})`);

    lines.push('');
    lines.push(t(lang, 'onboarding.completeHint'));

    return {
        text: lines.join('\n'),
        keyboard: [
            [homeButton(lang)],
            [{ text: t(lang, 'onboarding.btnAddMoreKeys'), callback_data: 'view:settings' }],
        ],
    };
}

export function renderKeyError(service: string, errorMessage?: string, lang: Lang = 'en'): ViewResult {
    const canSkip = true;
    const keyboard: InlineButton[][] = [];
    if (canSkip) {
        keyboard.push([{ text: t(lang, 'onboarding.btnSkipForNow'), callback_data: `onboard:skip_${service.toLowerCase()}` }]);
    }

    return {
        text: [
            t(lang, 'onboarding.keyErrorTitle').replace('{service}', service),
            '',
            errorMessage || t(lang, 'onboarding.keyErrorDefault'),
            '',
            canSkip ? t(lang, 'onboarding.keyErrorRetrySkip') : t(lang, 'onboarding.keyErrorRetry'),
        ].join('\n'),
        keyboard,
    };
}
