/**
 * Twitter Account views — list, detail, add, delete confirm
 */

import type { Env, ViewResult, InlineButton, TwitterAccountConfig } from '../types';
import { t, type Lang } from '../ui/strings';
import { getTwitterAccounts, getTwitterAccount, parseTwitterAccountConfig, getTwitterAccountOverview } from '../services/db';
import { renderError } from './home';
import { homeButton, backButton, backHomeRow, addButtonRow, paginationRows, toggleButton, confirmDeleteView, emptyListView, inputPromptView } from '../ui/components';

export async function renderAccountsList(env: Env, chatId: string, page = 0, lang: Lang = 'en'): Promise<ViewResult> {
    const allAccounts = await getTwitterAccounts(env, chatId);

    if (allAccounts.length === 0) {
        return emptyListView(
            t(lang, 'accounts.title'),
            t(lang, 'accounts.noAccounts'),
            t(lang, 'accounts.addAccount'),
            'action:add_account',
            'view:home',
            lang
        );
    }

    const limit = 10;
    const offset = page * limit;
    const totalPages = Math.ceil(allAccounts.length / limit);
    const accounts = allAccounts.slice(offset, offset + limit);

    const accountList = accounts.map((a, i) => {
        const status = a.is_watching ? '👁' : '⏸️';
        const name = a.display_name ? ` (${a.display_name})` : '';
        return `${offset + i + 1}. ${status} <a href="https://x.com/${a.username}">@${a.username}</a>${name}`;
    }).join('\n');

    const accountButtons: InlineButton[][] = accounts.map((a) => [
        {
            text: `👤 @${a.username}${a.is_watching ? '' : ' (paused)'}`,
            callback_data: `account:${a.id}`,
        },
    ]);

    return {
        text: `${t(lang, 'accounts.title')} (${allAccounts.length} ${t(lang, 'common.total')})

${accountList}

${t(lang, 'accounts.tapToManage')}${totalPages > 1 ? `\n\n${t(lang, 'common.page')} ${page + 1} ${t(lang, 'common.of')} ${totalPages}` : ''}`,
        keyboard: [
            addButtonRow(t(lang, 'accounts.addAccount'), 'action:add_account'),
            ...accountButtons,
            ...paginationRows('accounts', page, page < totalPages - 1, lang),
            [homeButton(lang)],
        ],
        disableLinkPreview: true,
    };
}

export async function renderAccountDetail(env: Env, chatId: string, accountId: string, lang: Lang = 'en'): Promise<ViewResult> {
    const account = await getTwitterAccount(env, accountId, chatId);

    if (!account) {
        return renderError(t(lang, 'error.accountNotFound'));
    }

    const config = parseTwitterAccountConfig(account);
    const watchStatus = account.is_watching ? t(lang, 'repos.watching') : t(lang, 'repos.paused');

    const hashtagOn = config.includeHashtags;
    const imgOn = config.alwaysGenerateImage;
    const hashtagIcon = hashtagOn ? '✅' : '❌';
    const imgIcon = imgOn ? '✅' : '❌';
    const autoApproveOn = config.autoApprove;
    const mediaAiOn = config.analyzeMedia !== false;
    const autoApproveIcon = autoApproveOn ? '✅' : '❌';
    const mediaAiIcon = mediaAiOn ? '✅' : '❌';
    const batchSize = config.batchPageSize || 5;

    const toneLabels: Record<string, string> = {
        professional: t(lang, 'accounts.toneProfessional'),
        casual: t(lang, 'accounts.toneCasual'),
        analytical: t(lang, 'accounts.toneAnalytical'),
        enthusiastic: t(lang, 'accounts.toneEnthusiastic'),
        witty: t(lang, 'accounts.toneWitty'),
        sarcastic: t(lang, 'accounts.toneSarcastic'),
    };
    const toneLabel = toneLabels[config.tone] || config.tone;

    // Fetch overview
    const overview = await getTwitterAccountOverview(env, chatId, accountId);
    let overviewSection: string;

    if (overview?.persona) {
        const personaPreview = overview.persona.length > 120
            ? overview.persona.substring(0, 117) + '...'
            : overview.persona;
        overviewSection = `\n${t(lang, 'accounts.personaLabel')}\n${personaPreview}`;
    } else {
        overviewSection = `\n${t(lang, 'accounts.personaLabel')}\n${t(lang, 'accounts.noPersona')}`;
    }

    const displayName = account.display_name ? ` (${account.display_name})` : '';

    return {
        text: `👤 <b><a href="https://x.com/${account.username}">@${account.username}</a></b>${displayName}
${watchStatus}

${t(lang, 'accounts.repostSettings')}
${hashtagIcon} ${t(lang, 'repos.hashtags')} <b>${config.includeHashtags ? t(lang, 'common.yes') : t(lang, 'common.no')}</b>
${t(lang, 'accounts.threshold')} <b>${config.relevanceThreshold}/10</b>
${t(lang, 'accounts.tone')} <b>${toneLabel}</b>
${autoApproveIcon} ${t(lang, 'accounts.autoApprove')} <b>${config.autoApprove ? t(lang, 'common.yes') : t(lang, 'common.no')}</b>
${t(lang, 'accounts.batchPage')} <b>${batchSize}</b>
${mediaAiIcon} Media AI: <b>${config.analyzeMedia !== false ? t(lang, 'common.yes') : t(lang, 'common.no')}</b>

${t(lang, 'repos.imageSettings')}
${imgIcon} ${t(lang, 'accounts.alwaysImage')} <b>${config.alwaysGenerateImage ? t(lang, 'common.yes') : t(lang, 'common.no')}</b>
${t(lang, 'repos.singleProb')} <b>${Math.round(config.singleImageProbability * 100)}%</b>
${overviewSection}

${t(lang, 'common.tapToChange')}`,
        keyboard: [
            [
                toggleButton('accounts.tags', hashtagOn, `tw_config:hashtags:${account.id}`, lang),
            ],
            [
                { text: `🎯 ${config.relevanceThreshold}/10`, callback_data: `tw_config:threshold:${account.id}` },
                { text: toneLabel, callback_data: `tw_config:tone:${account.id}` },
            ],
            [
                toggleButton('accounts.img', imgOn, `tw_config:img:${account.id}`, lang),
                { text: `🎲 ${Math.round(config.singleImageProbability * 100)}%`, callback_data: `tw_config:img_pct:${account.id}` },
            ],
            [
                toggleButton('accounts.auto', autoApproveOn, `tw_config:auto_approve:${account.id}`, lang),
                { text: `📋 Page: ${batchSize}`, callback_data: `tw_config:batch_size:${account.id}` },
            ],
            [
                toggleButton('accounts.mediaAi', mediaAiOn, `tw_config:analyze_media:${account.id}`, lang),
            ],
            [
                { text: overview?.persona ? t(lang, 'accounts.updatePersona') : t(lang, 'accounts.bootstrapPersona'), callback_data: `action:tw_bootstrap:${account.id}`, style: overview?.persona ? 'success' as const : 'primary' as const },
            ],
            [
                account.is_watching
                    ? { text: t(lang, 'accounts.unfollow'), callback_data: `action:tw_unfollow:${account.id}`, style: 'danger' as const }
                    : { text: t(lang, 'accounts.follow'), callback_data: `action:tw_follow:${account.id}`, style: 'success' as const },
            ],
            [{ text: t(lang, 'common.delete'), callback_data: `action:tw_delete:${account.id}`, style: 'danger' }],
            backHomeRow('view:accounts', lang),
        ],
        disableLinkPreview: true,
    };
}

export function renderAddAccount(lang: Lang = 'en'): ViewResult {
    return inputPromptView(
        t(lang, 'accounts.addAccountTitle'),
        t(lang, 'accounts.addAccountDesc'),
        t(lang, 'accounts.addAccountExample'),
        'view:accounts',
        lang
    );
}

export async function renderDeleteAccountConfirm(env: Env, chatId: string, accountId: string, lang: Lang = 'en'): Promise<ViewResult> {
    const account = await getTwitterAccount(env, accountId, chatId);

    if (!account) {
        return renderError(t(lang, 'error.accountNotFound'));
    }

    return confirmDeleteView(
        t(lang, 'accounts.deleteAccountTitle'),
        t(lang, 'accounts.deleteAccountMsg').replace('{username}', account.username),
        `action:tw_delete_yes:${account.id}`,
        `account:${account.id}`,
        lang
    );
}
