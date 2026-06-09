/**
 * Onboarding Views — Redesigned unlock-framing flow
 * Flow: Welcome (with lang) → X → Identity → Gemini → GitHub → Complete
 * Note: All text uses HTML formatting (Telegram parse_mode: HTML)
 */

import type { ViewResult, InlineButton } from '../types';
import { homeButton, selectedItemLabel } from '../ui/components';
import { t } from '../ui/strings';
import type { Lang } from '../ui/strings';

// ─── Progress Bar ─────────────────────────────────────────────────────────

export function buildProgressBar(
    state: { hasX: boolean; hasInstagram: boolean; hasGemini: boolean; hasGitHub: boolean },
    currentStep: string,
): string {
    const PAST_IDENTITY = ['gemini_key', 'github_token', 'complete'];
    const steps: { label: string; done: boolean; stepKey: string }[] = [
        { label: 'X', done: state.hasX, stepKey: 'x_keys' },
        { label: 'IG', done: state.hasInstagram, stepKey: 'instagram' },
    ];

    // Only show identity step if user has X (otherwise it was auto-defaulted)
    if (state.hasX) {
        steps.push({ label: 'Identity', done: PAST_IDENTITY.includes(currentStep), stepKey: 'identity' });
    }

    steps.push(
        { label: 'AI', done: state.hasGemini, stepKey: 'gemini_key' },
        { label: 'GitHub', done: state.hasGitHub, stepKey: 'github_token' },
    );

    return steps.map(s => {
        if (s.done) return `✅ ${s.label}`;
        if (s.stepKey === currentStep) return `👉 ${s.label}`;
        return `🔒 ${s.label}`;
    }).join(' · ');
}

// ─── Welcome ───────────────────────────────────────────────────────────────

export function renderWelcome(lang: Lang = 'en'): ViewResult {
    const enCheck = lang === 'en' ? ' ✓' : '';
    const heCheck = lang === 'he' ? ' ✓' : '';

    return {
        text: [
            t(lang, 'onboarding.welcomeTitle'),
            '',
            t(lang, 'onboarding.welcomeSubtitle'),
            t(lang, 'onboarding.welcomeDesc'),
            '',
            t(lang, 'onboarding.welcomeFeatures'),
            t(lang, 'onboarding.welcomeFeatureRepost'),
            t(lang, 'onboarding.welcomeFeatureGenerate'),
            t(lang, 'onboarding.welcomeFeatureHandwrite'),
            t(lang, 'onboarding.welcomeFeatureFollow'),
            '',
            t(lang, 'onboarding.welcomeSetup'),
            '',
            t(lang, 'onboarding.welcomeDisclaimer'),
        ].join('\n'),
        keyboard: [
            [
                { text: `${t(lang, 'onboarding.langEn')}${enCheck}`, callback_data: 'onboard:lang_en' },
                { text: `${t(lang, 'onboarding.langHe')}${heCheck}`, callback_data: 'onboard:lang_he' },
            ],
            [{ text: t(lang, 'onboarding.btnLetsGo'), callback_data: 'onboard:start', style: 'primary' }],
        ],
    };
}

// ─── X/Twitter (Unlock Your Voice) ─────────────────────────────────────────

export function renderXKeysPrompt(lang: Lang = 'en'): ViewResult {
    return {
        text: [
            t(lang, 'onboarding.xTitle'),
            '',
            t(lang, 'onboarding.xDesc'),
            t(lang, 'onboarding.xFeatureRepost'),
            t(lang, 'onboarding.xFeatureHandwrite'),
            t(lang, 'onboarding.xFeatureFollow'),
            t(lang, 'onboarding.xFeatureIdentity'),
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
        text: `${t(lang, 'onboarding.xSuccess')}${label}`,
        keyboard: [],
    };
}

// ─── Instagram (Unlock Your Reach) ─────────────────────────────────────────

export function renderInstagramPrompt(lang: Lang = 'en'): ViewResult {
    return {
        text: [
            t(lang, 'onboarding.instagramTitle'),
            '',
            t(lang, 'onboarding.instagramDesc'),
            '',
            t(lang, 'onboarding.instagramUnlockLabel'),
            t(lang, 'onboarding.instagramFeatureReels'),
            t(lang, 'onboarding.instagramFeatureCross'),
            '',
            t(lang, 'onboarding.instagramFormat'),
            '',
            t(lang, 'onboarding.instagramAccessToken'),
            t(lang, 'onboarding.instagramAccountId'),
            t(lang, 'onboarding.instagramAppSecret'),
            '',
            t(lang, 'onboarding.instagramDeleteNote'),
        ].join('\n'),
        keyboard: [
            [{ text: t(lang, 'onboarding.btnInstagramGuide'), url: 'https://developers.facebook.com/' }],
            [{ text: t(lang, 'onboarding.btnSkipForNow'), callback_data: 'onboard:skip_instagram' }],
        ],
    };
}

export function renderInstagramSuccess(lang: Lang = 'en'): ViewResult {
    return {
        text: t(lang, 'onboarding.instagramSuccess'),
        keyboard: [],
    };
}

// ─── Identity (Unlock Your Identity) ───────────────────────────────────────

export function renderIdentityStep(currentDepth: number = 200, lang: Lang = 'en'): ViewResult {
    const textLines = [
        t(lang, 'onboarding.identityTitle'),
        '',
        t(lang, 'onboarding.identityDesc'),
        t(lang, 'onboarding.identityAspectStyle'),
        t(lang, 'onboarding.identityAspectVocab'),
        t(lang, 'onboarding.identityAspectEmotion'),
        t(lang, 'onboarding.identityAspectInterests'),
        '',
        t(lang, 'onboarding.identityFoundation'),
        '',
        t(lang, 'onboarding.identityDepthLabel'),
        t(lang, 'onboarding.identityCost').replace('{count}', String(currentDepth)),
    ];

    if (currentDepth >= 200) {
        textLines.push(t(lang, 'onboarding.identityDepthHint'));
    }

    const depthRow: InlineButton[] = [100, 200, 400].map(n => ({
        text: selectedItemLabel(String(n), n === currentDepth),
        callback_data: 'onboard:identity_depth:' + n,
    }));

    return {
        text: textLines.join('\n'),
        keyboard: [
            depthRow,
            [{ text: t(lang, 'onboarding.btnUnderstandMe'), callback_data: 'onboard:identity_analyze', style: 'primary' }],
            [{ text: t(lang, 'onboarding.btnUseDefault'), callback_data: 'onboard:identity_default' }],
        ],
    };
}

export function renderIdentityAnalyzing(lang: Lang = 'en'): ViewResult {
    return {
        text: t(lang, 'onboarding.identityAnalyzing'),
        keyboard: [],
    };
}

export function renderIdentitySnippet(snippet: string, lang: Lang = 'en'): ViewResult {
    return {
        text: [
            t(lang, 'onboarding.identitySuccessTitle'),
            '',
            t(lang, 'onboarding.identitySnippetLabel'),
            `<i>${snippet}</i>`,
            '',
            t(lang, 'onboarding.identitySnippetFooter'),
        ].join('\n'),
        keyboard: [
            [{ text: t(lang, 'onboarding.btnNext'), callback_data: 'onboard:identity_next', style: 'primary' }],
        ],
    };
}

export function renderIdentityFailed(lang: Lang = 'en'): ViewResult {
    return {
        text: t(lang, 'onboarding.identityFailed'),
        keyboard: [],
    };
}

// ─── Gemini (Power Up the AI) ──────────────────────────────────────────────

export function renderGeminiKeyPrompt(lang: Lang = 'en'): ViewResult {
    return {
        text: [
            t(lang, 'onboarding.geminiTitle'),
            '',
            t(lang, 'onboarding.geminiDesc'),
            '',
            t(lang, 'onboarding.geminiUnlockLabel'),
            t(lang, 'onboarding.geminiFeatureGeneration'),
            t(lang, 'onboarding.geminiFeatureRewriting'),
            t(lang, 'onboarding.geminiFeatureIdentity'),
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

// ─── GitHub (Bonus: Code → Content) ────────────────────────────────────────

export function renderGitHubTokenPrompt(lang: Lang = 'en'): ViewResult {
    return {
        text: [
            t(lang, 'onboarding.githubTitle'),
            '',
            t(lang, 'onboarding.githubDesc'),
            '',
            t(lang, 'onboarding.githubUnlockLabel'),
            t(lang, 'onboarding.githubFeatureGenerate'),
            t(lang, 'onboarding.githubFeatureRepos'),
            '',
            t(lang, 'onboarding.githubPaste'),
        ].join('\n'),
        keyboard: [
            [{ text: t(lang, 'onboarding.btnCreateToken'), url: 'https://github.com/settings/tokens' }],
            [{ text: t(lang, 'onboarding.btnNotNow'), callback_data: 'onboard:skip_github' }],
        ],
    };
}

export function renderGitHubSuccess(username?: string, lang: Lang = 'en'): ViewResult {
    const label = username ? ` (${username})` : '';
    return {
        text: `${t(lang, 'onboarding.githubSuccess')}${label}`,
        keyboard: [],
    };
}

// ─── Complete ──────────────────────────────────────────────────────────────

export function renderComplete(services: {
    hasGemini: boolean;
    hasX: boolean;
    hasInstagram: boolean;
    hasGitHub: boolean;
}, lang: Lang = 'en'): ViewResult {
    const unlocked: string[] = [];
    const locked: string[] = [];

    // X-dependent features
    if (services.hasX) {
        unlocked.push(`✅ ${t(lang, 'onboarding.featureRepost')}`);
        unlocked.push(`✅ ${t(lang, 'onboarding.featureHandwrite')}`);
        unlocked.push(`✅ ${t(lang, 'onboarding.featureFollow')}`);
        unlocked.push(`✅ ${t(lang, 'onboarding.featureIdentity')}`);
    } else {
        locked.push(`🔒 ${t(lang, 'onboarding.featureRepost')}`);
        locked.push(`🔒 ${t(lang, 'onboarding.featureHandwrite')}`);
        locked.push(`🔒 ${t(lang, 'onboarding.featureFollow')}`);
        locked.push(`🔒 ${t(lang, 'onboarding.featureIdentity')}`);
    }

    // Instagram-dependent
    if (services.hasInstagram) {
        unlocked.push(`✅ ${t(lang, 'onboarding.featureInstagram')}`);
    } else {
        locked.push(`🔒 ${t(lang, 'onboarding.featureInstagram')}`);
    }

    // Gemini-dependent
    if (services.hasGemini) {
        unlocked.push(`✅ ${t(lang, 'onboarding.featureAiGeneration')}`);
    } else {
        locked.push(`🔒 ${t(lang, 'onboarding.featureAiGeneration')}`);
    }

    // GitHub-dependent
    if (services.hasGitHub) {
        unlocked.push(`✅ ${t(lang, 'onboarding.featureCodeToContent')}`);
    } else {
        locked.push(`🔒 ${t(lang, 'onboarding.featureCodeToContent')}`);
    }

    const lines = [t(lang, 'onboarding.completeTitle'), ''];

    if (unlocked.length > 0) {
        lines.push(t(lang, 'onboarding.completeUnlockedLabel'));
        lines.push(...unlocked);
        lines.push('');
    }

    if (locked.length > 0) {
        lines.push(t(lang, 'onboarding.completeLockedLabel'));
        lines.push(...locked);
        lines.push('');
    }

    return {
        text: lines.join('\n'),
        keyboard: [
            [homeButton(lang)],
            [{ text: t(lang, 'onboarding.btnAddMoreKeys'), callback_data: 'settings:keys' }],
        ],
    };
}

// ─── Key Error ─────────────────────────────────────────────────────────────

export function renderKeyError(service: string, errorMessage?: string, lang: Lang = 'en'): ViewResult {
    const keyboard: InlineButton[][] = [];
    keyboard.push([{ text: t(lang, 'onboarding.btnSkipForNow'), callback_data: `onboard:skip_${service.toLowerCase()}` }]);

    return {
        text: [
            t(lang, 'onboarding.keyErrorTitle').replace('{service}', service),
            '',
            errorMessage || t(lang, 'onboarding.keyErrorDefault'),
            '',
            t(lang, 'onboarding.keyErrorRetrySkip'),
        ].join('\n'),
        keyboard,
    };
}
