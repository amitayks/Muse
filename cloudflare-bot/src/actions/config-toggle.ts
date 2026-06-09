import type { HandlerContext } from '../core/router';
import type { ViewResult } from '../types';
import type { Lang } from '../ui/strings';
import { t } from '../ui/strings';
import { getRepo, updateRepo, parseRepoConfig, setTimezone, getTimezone, setPageSize, getPageSize, updateChatState, getRepoOverview, getUserLanguage, setUserLanguage, getIdentityTweetCount, setIdentityTweetCount } from '../data/db';
import { getUser, updateUser } from '../data/user-db';
import { renderRepoDetail, renderError } from '../views';
import { renderSettingsGeneral, renderIdentityLangNotification, renderSettingsSkills } from '../views/settings';
import { cancelRow } from '../ui/components';
import { isValidTimezone } from '../infra/timezone';
import { isAdmin } from '../infra/security';
import { getIdentityStatus } from '../ai/identity';
import { countStalePrompts } from '../ai/prompts';
import { sendMessage } from '../integrations/telegram';

export async function configToggleAction(ctx: HandlerContext & { value: string; extra?: string }): Promise<ViewResult | void> {
    const lang = (ctx.lang || 'en') as Lang;
    const { env, chatId, value: setting, extra } = ctx;

    // Handle page size configuration: config:page_size:N
    if (setting === 'page_size') {
        const size = parseInt(extra || '5', 10);
        const validSizes = [5, 10, 15, 20];
        if (validSizes.includes(size)) {
            await setPageSize(env, chatId, size);
        }
        const tz = await getTimezone(env, chatId);
        const ps = await getPageSize(env, chatId);
        return renderSettingsGeneral(tz, ps, lang);
    }

    // Handle identity analysis depth configuration: config:identity_depth:N
    if (setting === 'identity_depth') {
        const depth = parseInt(extra || '200', 10);
        if ([100, 200, 400].includes(depth)) await setIdentityTweetCount(env, chatId, depth);
        const staleCount = await countStalePrompts(env, chatId);
        const isAdminUser = isAdmin(chatId, env);
        const d = await getIdentityTweetCount(env, chatId);
        return renderSettingsSkills(lang, env.WORKER_URL, staleCount, isAdminUser, d);
    }

    // Handle language toggle: config:language
    if (setting === 'language') {
        const currentLang = await getUserLanguage(env, chatId);
        const newLang: Lang = currentLang === 'en' ? 'he' : 'en';
        await setUserLanguage(env, chatId, newLang);

        // Check if identity language notification should be shown
        const identityStatus = await getIdentityStatus(env, chatId);
        if (identityStatus.hasAny && !identityStatus.langs.includes(newLang)) {
            const user = await getUser(env, chatId);
            const notified = (user?.identity_lang_notified || '').split(',').filter(Boolean);
            if (!notified.includes(newLang)) {
                const notifView = renderIdentityLangNotification(newLang);
                await sendMessage(env, chatId, notifView.text, notifView.keyboard);
                notified.push(newLang);
                await updateUser(env, chatId, { identity_lang_notified: notified.join(',') });
            }
        }

        const tz = await getTimezone(env, chatId);
        const ps = await getPageSize(env, chatId);
        return renderSettingsGeneral(tz, ps, newLang);
    }

    // Handle timezone configuration: config:timezone:OFFSET
    if (setting === 'timezone') {
        if (extra === 'custom') {
            await updateChatState(env, chatId, {
                current_view: 'timezone_input',
                context: { awaiting_input: 'timezone' },
            });
            return {
                text: `${t(lang, 'settings.timezoneInputTitle')}\n\n${t(lang, 'settings.timezoneInputDesc')}\n\n${t(lang, 'settings.timezoneInputExamples')}`,
                keyboard: [cancelRow('settings:sub:general', lang)],
            };
        }

        const offset = extra || 'UTC';
        if (isValidTimezone(offset)) {
            await setTimezone(env, chatId, offset);
            const tz = await getTimezone(env, chatId);
            const ps = await getPageSize(env, chatId);
            return renderSettingsGeneral(tz, ps, lang);
        }

        return renderError(t(lang, 'error.invalidTimezone'), lang);
    }

    // Handle overview re-bootstrap: config:rebootstrap:REPO_ID
    if (setting === 'rebootstrap') {
        const { overviewCommand } = await import('../commands/overview');
        await overviewCommand({ env, chatId, args: extra });
        return;
    }

    // Handle overview edit: config:edit_overview:REPO_ID
    if (setting === 'edit_overview') {
        const overview = await getRepoOverview(env, extra!, chatId);
        if (!overview) {
            return renderError(t(lang, 'error.noOverview'), lang);
        }
        return {
            text: `${t(lang, 'repos.editOverviewTitle')}\n\n${t(lang, 'repos.editOverviewDesc')}`,
            keyboard: [
                [{ text: t(lang, 'repos.fieldSummary'), callback_data: `config:ov_edit:${extra}:s` }],
                [{ text: t(lang, 'repos.fieldTechStack'), callback_data: `config:ov_edit:${extra}:ts` }],
                [{ text: t(lang, 'repos.fieldKeyFeatures'), callback_data: `config:ov_edit:${extra}:kf` }],
                [{ text: t(lang, 'repos.fieldTargetAudience'), callback_data: `config:ov_edit:${extra}:ta` }],
                [{ text: t(lang, 'repos.fieldBrandVoice'), callback_data: `config:ov_edit:${extra}:bv` }],
                [{ text: t(lang, 'repos.fieldVisualTheme'), callback_data: `config:ov_edit:${extra}:vt` }],
                [{ text: t(lang, 'common.back'), callback_data: `repo:${extra}` }],
            ],
        };
    }

    // Handle overview field edit prompt
    if (setting === 'ov_edit') {
        const repoId2 = extra;
        if (!repoId2) return renderError(t(lang, 'error.missingRepo'), lang);

        const colonIdx = repoId2.indexOf(':');
        if (colonIdx === -1) return renderError(t(lang, 'error.missingField'), lang);
        const actualRepoId = repoId2.substring(0, colonIdx);
        const rawField = repoId2.substring(colonIdx + 1);

        const shortToField: Record<string, string> = { s: 'summary', ts: 'tech_stack', kf: 'key_features', ta: 'target_audience', bv: 'brand_voice', vt: 'visual_theme' };
        const field = shortToField[rawField] || rawField;

        const fieldLabelKeys: Record<string, string> = {
            summary: 'repos.summaryLabel',
            tech_stack: 'repos.techStackLabel',
            key_features: 'repos.keyFeaturesLabel',
            target_audience: 'repos.targetAudienceLabel',
            brand_voice: 'repos.brandVoiceLabel',
            visual_theme: 'repos.visualThemeLabel',
        };

        const label = fieldLabelKeys[field] ? t(lang, fieldLabelKeys[field]) : field;
        const overview = await getRepoOverview(env, actualRepoId, chatId);
        const currentValue = overview ? (overview as unknown as Record<string, unknown>)[field] : null;
        const displayValue = Array.isArray(currentValue) ? (currentValue as string[]).join(', ') : (currentValue as string | null) || t(lang, 'repos.empty');

        await updateChatState(env, chatId, {
            current_view: 'overview_edit',
            context: { awaiting_input: 'edit_overview', selected_repo_id: actualRepoId, overview_field: field },
        });

        return {
            text: `${t(lang, 'repos.editFieldTitle').replace('{label}', label)}\n\n${t(lang, 'repos.currentValue')}\n${displayValue}\n\n${t(lang, 'repos.sendNewValue')}`,
            keyboard: [cancelRow(`config:edit_overview:${actualRepoId}`, lang)],
        };
    }

    const repoId = extra;
    const repo = await getRepo(env, repoId!, chatId);
    if (!repo) {
        return renderError(t(lang, 'error.repoNotFound'), lang);
    }

    const config = parseRepoConfig(repo);

    switch (setting) {
        case 'watchPRs':
            config.watchPRs = !config.watchPRs;
            break;
        case 'watchPushes':
            config.watchPushes = !config.watchPushes;
            break;
        default:
            return renderRepoDetail(env, chatId, repoId!, lang);
    }

    await updateRepo(env, repoId!, chatId, { config });
    return renderRepoDetail(env, chatId, repoId!, lang);
}
