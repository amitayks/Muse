/**
 * Repository-related views
 */

import type { Env, ViewResult, InlineButton } from '../types';
import { t } from '../ui/strings';
import type { Lang } from '../ui/strings';
import { getRepos, getRepo, parseRepoConfig, getRepoOverview } from '../services/db';
import { renderError } from './home';
import { homeButton, backButton, backHomeRow, addButtonRow, paginationRows, toggleButton, confirmDeleteView, emptyListView, inputPromptView, cancelRow } from '../ui/components';

export async function renderReposList(env: Env, chatId: string, page = 0, lang: Lang = 'en'): Promise<ViewResult> {
    const allRepos = await getRepos(env, chatId);

    if (allRepos.length === 0) {
        return emptyListView(
            t(lang, 'repos.title'),
            t(lang, 'repos.noRepos'),
            t(lang, 'repos.addRepo'),
            'action:add_repo',
            'view:home',
            lang
        );
    }

    const limit = 10;
    const offset = page * limit;
    const totalPages = Math.ceil(allRepos.length / limit);
    const repos = allRepos.slice(offset, offset + limit);

    const repoList = repos.map((r, i) => {
        const status = r.is_watching ? '👁' : '⏸️';
        return `${offset + i + 1}. ${status} <code>${r.owner}/${r.repo}</code>`;
    }).join('\n');

    // One button per row
    const repoButtons: InlineButton[][] = repos.map((r) => [
        {
            text: `📦 ${r.owner}/${r.repo}${r.is_watching ? '' : ' (paused)'}`,
            callback_data: `repo:${r.id}`,
        },
    ]);

    return {
        text: `${t(lang, 'repos.title')} (${allRepos.length} ${t(lang, 'common.total')})

${repoList}

${t(lang, 'repos.tapToManage')}${totalPages > 1 ? `\n\n${t(lang, 'common.page')} ${page + 1} ${t(lang, 'common.of')} ${totalPages}` : ''}`,
        keyboard: [
            addButtonRow(t(lang, 'repos.addRepo'), 'action:add_repo'),
            ...repoButtons,
            ...paginationRows('repos', page, page < totalPages - 1, lang),
            [homeButton(lang)],
        ],
    };
}

export async function renderRepoDetail(env: Env, chatId: string, repoId: string, lang: Lang = 'en'): Promise<ViewResult> {
    const repo = await getRepo(env, repoId, chatId);

    if (!repo) {
        return renderError(t(lang, 'error.repoNotFound'));
    }

    const config = parseRepoConfig(repo);
    const watchStatus = repo.is_watching ? t(lang, 'repos.watching') : t(lang, 'repos.paused');

    const hashtagOn = config.includeHashtags;
    const prOn = config.watchPRs;
    const pushOn = config.watchPushes;
    const imgOn = config.alwaysGenerateThreadImage;
    const hashtagIcon = hashtagOn ? '✅' : '❌';
    const prIcon = prOn ? '✅' : '❌';
    const pushIcon = pushOn ? '✅' : '❌';
    const imgIcon = imgOn ? '✅' : '❌';
    // Fetch overview for display
    const overview = await getRepoOverview(env, repoId, chatId);
    let overviewSection: string;
    const overviewButtons: InlineButton[][] = [];

    if (overview) {
        const summaryPreview = overview.summary
            ? overview.summary.length > 120 ? overview.summary.substring(0, 117) + '...' : overview.summary
            : t(lang, 'repos.noSummary');
        const featureCount = overview.key_features.length;
        overviewSection = `\n${t(lang, 'repos.projectOverview')}
📋 ${summaryPreview}
⭐ ${featureCount} feature${featureCount !== 1 ? 's' : ''}${overview.visual_theme ? ` | 🎨 ${overview.visual_theme.substring(0, 40)}` : ''}`;
        overviewButtons.push([
            { text: t(lang, 'repos.editOverview'), callback_data: `config:edit_overview:${repo.id}` },
            { text: t(lang, 'repos.rebootstrap'), callback_data: `config:rebootstrap:${repo.id}` },
        ]);
    } else {
        overviewSection = `\n${t(lang, 'repos.projectOverview')}
${t(lang, 'repos.noOverviewYet').replace('{repo}', `${repo.owner}/${repo.repo}`)}`;
        overviewButtons.push([
            { text: t(lang, 'repos.bootstrapOverview'), callback_data: `config:rebootstrap:${repo.id}` },
        ]);
    }

    return {
        text: `📦 <b>${repo.owner}/${repo.repo}</b>
${watchStatus}

${t(lang, 'repos.contentSettings')}
${hashtagIcon} ${t(lang, 'repos.hashtags')}: <b>${config.includeHashtags ? t(lang, 'common.yes') : t(lang, 'common.no')}</b>

${t(lang, 'repos.watchSettings')}
${prIcon} ${t(lang, 'repos.prs')}: <b>${config.watchPRs ? t(lang, 'common.yes') : t(lang, 'common.no')}</b>
${pushIcon} ${t(lang, 'repos.pushes')}: <b>${config.watchPushes ? t(lang, 'common.yes') : t(lang, 'common.no')}</b>
${t(lang, 'repos.branches')} <b>${config.branches.join(', ')}</b>

${t(lang, 'repos.imageSettings')}
${imgIcon} ${t(lang, 'repos.threadImage')}: <b>${config.alwaysGenerateThreadImage ? t(lang, 'repos.always') : t(lang, 'common.off')}</b>
${t(lang, 'repos.singleProb')} <b>${Math.round(config.singleTweetImageProbability * 100)}%</b>
${overviewSection}

${t(lang, 'common.tapToChange')}`,
        keyboard: [
            [
                toggleButton('repos.tags', hashtagOn, `config:hashtags:${repo.id}`, lang),
            ],
            [
                toggleButton('repos.prs', prOn, `config:watchPRs:${repo.id}`, lang),
                toggleButton('repos.push', pushOn, `config:watchPushes:${repo.id}`, lang),
            ],
            [
                toggleButton('repos.img', imgOn, `config:threadImage:${repo.id}`, lang),
                { text: `🎲 ${Math.round(config.singleTweetImageProbability * 100)}%`, callback_data: `config:singleImage:${repo.id}` },
            ],
            ...overviewButtons,
            [
                repo.is_watching
                    ? { text: t(lang, 'repos.stopWatching'), callback_data: `action:unwatch:${repo.id}`, style: 'danger' as const }
                    : { text: t(lang, 'repos.startWatching'), callback_data: `action:watch:${repo.id}`, style: 'success' as const },
            ],
            [{ text: t(lang, 'common.delete'), callback_data: `action:delete_repo:${repo.id}`, style: 'danger' }],
            backHomeRow('view:repos', lang),
        ],
    };
}

export function renderAddRepo(lang: Lang = 'en'): ViewResult {
    return inputPromptView(
        t(lang, 'repos.addRepoTitle'),
        t(lang, 'repos.addRepoDesc'),
        t(lang, 'repos.addRepoExample'),
        'view:repos',
        lang
    );
}

export async function renderDeleteRepoConfirm(env: Env, chatId: string, repoId: string, lang: Lang = 'en'): Promise<ViewResult> {
    const repo = await getRepo(env, repoId, chatId);

    if (!repo) {
        return renderError(t(lang, 'error.repoNotFound'));
    }

    return confirmDeleteView(
        t(lang, 'repos.deleteRepoTitle'),
        t(lang, 'repos.deleteRepoMsg').replace('{repo}', `${repo.owner}/${repo.repo}`),
        `action:confirm_delete_repo:${repo.id}`,
        `repo:${repo.id}`,
        lang
    );
}
