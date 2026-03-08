/**
 * Twitter Account views — list, detail, add, delete confirm
 */

import type { Env, ViewResult, InlineButton } from '../types';
import { t, type Lang } from '../ui/strings';
import { getTwitterAccounts, getTwitterAccount, parseTwitterAccountConfig, getTwitterAccountOverview, getPageSize } from '../data/db';
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

    const pageSize = await getPageSize(env, chatId);
    const offset = page * pageSize;
    const totalPages = Math.ceil(allAccounts.length / pageSize);
    const accounts = allAccounts.slice(offset, offset + pageSize);

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

    const autoApproveOn = config.autoApprove;
    const mediaAiOn = config.analyzeMedia !== false;
    const autoApproveIcon = autoApproveOn ? '✅' : '❌';
    const mediaAiIcon = mediaAiOn ? '✅' : '❌';

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
${t(lang, 'accounts.threshold')} ${t(lang, 'common.arrow')} <code>${config.relevanceThreshold}/10</code>
${autoApproveIcon} ${t(lang, 'accounts.autoApprove')} ${t(lang, 'common.arrow')} <code>${config.autoApprove ? t(lang, 'common.yes') : t(lang, 'common.no')}</code>
${mediaAiIcon} Media AI ${t(lang, 'common.arrow')} <code>${config.analyzeMedia !== false ? t(lang, 'common.yes') : t(lang, 'common.no')}</code>
${overviewSection}

${t(lang, 'common.tapToChange')}`,
        keyboard: [
            [
                { text: `🎯 ${config.relevanceThreshold}/10`, callback_data: `tw_config:threshold:${account.id}` },
            ],
            [
                toggleButton('accounts.auto', autoApproveOn, `tw_config:auto_approve:${account.id}`, lang),
                toggleButton('accounts.analyzeMedia', mediaAiOn, `tw_config:analyze_media:${account.id}`, lang),
            ],
            [
                { text: overview?.persona ? t(lang, 'accounts.updatePersona') : t(lang, 'accounts.bootstrapPersona'), callback_data: `action:tw_bootstrap:${account.id}`, style: overview?.persona ? 'success' as const : 'primary' as const },
            ],
            [
                account.is_watching
                    ? { text: t(lang, 'accounts.unfollow'), callback_data: `action:tw_unfollow:${account.id}`, style: 'danger' as const }
                    : { text: t(lang, 'accounts.follow'), callback_data: `action:tw_follow:${account.id}`, style: 'success' as const },
                { text: t(lang, 'common.delete'), callback_data: `action:tw_delete:${account.id}`, style: 'danger' },
            ],
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
