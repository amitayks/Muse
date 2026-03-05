import type { HandlerContext } from '../core/router';
import type { ViewResult } from '../types';
import type { Lang } from '../ui/strings';
import { t } from '../ui/strings';
import { getRepo, updateRepo, parseRepoConfig, setTimezone, getTimezone, setPageSize, getPageSize, updateChatState, getRepoOverview, getUserLanguage, setUserLanguage } from '../data/db';
import { renderRepoDetail, renderError, renderSettings } from '../views';
import { cancelRow } from '../ui/components';
import { isValidTimezone } from '../infra/timezone';
import { countStalePrompts } from '../ai/prompts';
import { isAdmin } from '../infra/security';

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
        const staleCount = await countStalePrompts(env, chatId);
        const isAdminUser = isAdmin(chatId, env);
        return renderSettings(tz, ps, lang, env.WORKER_URL, staleCount, isAdminUser);
    }

    // Handle language toggle: config:language
    if (setting === 'language') {
        const currentLang = await getUserLanguage(env, chatId);
        const newLang: Lang = currentLang === 'en' ? 'he' : 'en';
        await setUserLanguage(env, chatId, newLang);
        const tz = await getTimezone(env, chatId);
        const ps = await getPageSize(env, chatId);
        const staleCount = await countStalePrompts(env, chatId);
        const isAdminUser = isAdmin(chatId, env);
        return renderSettings(tz, ps, newLang, env.WORKER_URL, staleCount, isAdminUser);
    }

    // Handle timezone configuration: config:timezone:OFFSET
    if (setting === 'timezone') {
        if (extra === 'custom') {
            // Prompt user to type a custom offset
            await updateChatState(env, chatId, {
                current_view: 'timezone_input',
                context: { awaiting_input: 'timezone' },
            });
            return {
                text: `${t(lang, 'settings.timezoneInputTitle')}\n\n${t(lang, 'settings.timezoneInputDesc')}\n\n${t(lang, 'settings.timezoneInputExamples')}`,
                keyboard: [cancelRow('view:settings', lang)],
            };
        }

        // Preset offset — extra is the offset value (e.g., 'UTC+2', 'UTC-5')
        // Reconstruct full offset: for 'config:timezone:UTC+5:30', value='timezone', extra='UTC+5'
        // But callback_data splits on ':', so 'config:timezone:UTC+5:30' → parts=['config','timezone','UTC+5','30']
        // We need to handle this in the callback parser. For now, presets without ':' in the offset work fine.
        // The extra already contains the offset like 'UTC+2' or 'UTC-5'
        const offset = extra || 'UTC';
        if (isValidTimezone(offset)) {
            await setTimezone(env, chatId, offset);
            const tz = await getTimezone(env, chatId);
            const ps = await getPageSize(env, chatId);
            const staleCount = await countStalePrompts(env, chatId);
            const isAdminUser = isAdmin(chatId, env);
            return renderSettings(tz, ps, lang, env.WORKER_URL, staleCount, isAdminUser);
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
        // Short field codes to stay under Telegram's 64-byte callback_data limit
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

    // Handle overview field edit prompt: config:ov_edit:REPO_ID — extra contains "REPO_ID:field"
    if (setting === 'ov_edit') {
        // Callback data: config:ov_edit:REPO_ID:field
        // After splitting on ':', value='ov_edit', extra='REPO_ID' (but field is lost in standard parsing)
        // We need to handle this via the context approach
        // Since callback_data has a max length, we'll store the edit context in chat state
        const repoId2 = extra;
        if (!repoId2) return renderError(t(lang, 'error.missingRepo'), lang);

        // The field is passed in a different way — we'll use the remaining args
        // Actually, callback_data format: config:ov_edit:REPO_ID:field
        // The router splits as: prefix=config, value=ov_edit, extra=REPO_ID:field
        // So extra contains "REPO_ID:field"
        const colonIdx = repoId2.indexOf(':');
        if (colonIdx === -1) return renderError(t(lang, 'error.missingField'), lang);
        const actualRepoId = repoId2.substring(0, colonIdx);
        const rawField = repoId2.substring(colonIdx + 1);

        // Map short codes back to full field names
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
