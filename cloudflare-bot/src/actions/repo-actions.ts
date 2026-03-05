import type { HandlerContext } from '../core/router';
import type { ViewResult } from '../types';
import type { Lang } from '../ui/strings';
import { t } from '../ui/strings';
import { updateChatState, getRepo, updateRepo, deleteRepo } from '../data/db';
import { deleteWebhook } from '../integrations/webhook';
import { renderRepoDetail, renderAddRepo, renderDeleteRepoConfirm, renderError } from '../views';

export async function addRepoAction(ctx: HandlerContext): Promise<ViewResult> {
    const lang = (ctx.lang || 'en') as Lang;
    await updateChatState(ctx.env, ctx.chatId, {
        current_view: 'add_repo',
        context: { awaiting_input: 'add_repo' },
    });
    return renderAddRepo(lang);
}

export async function watchAction(ctx: HandlerContext & { extra?: string }): Promise<ViewResult> {
    const lang = (ctx.lang || 'en') as Lang;
    const repoId = ctx.extra!;
    await updateRepo(ctx.env, repoId, ctx.chatId, { is_watching: 1 });
    return renderRepoDetail(ctx.env, ctx.chatId, repoId, lang);
}

export async function unwatchAction(ctx: HandlerContext & { extra?: string }): Promise<ViewResult> {
    const lang = (ctx.lang || 'en') as Lang;
    const repoId = ctx.extra!;
    await updateRepo(ctx.env, repoId, ctx.chatId, { is_watching: 0 });
    return renderRepoDetail(ctx.env, ctx.chatId, repoId, lang);
}

export async function deleteRepoAction(ctx: HandlerContext & { extra?: string }): Promise<ViewResult> {
    const lang = (ctx.lang || 'en') as Lang;
    const repoId = ctx.extra!;
    return renderDeleteRepoConfirm(ctx.env, ctx.chatId, repoId, lang);
}

export async function confirmDeleteRepoAction(ctx: HandlerContext & { extra?: string }): Promise<ViewResult> {
    const lang = (ctx.lang || 'en') as Lang;
    const { env, chatId } = ctx;
    const repoId = ctx.extra!;
    const repo = await getRepo(env, repoId, chatId);
    if (!repo) {
        return renderError('Repository not found.', lang);
    }

    if (repo.webhook_id) {
        try {
            await deleteWebhook(env, repo.owner, repo.repo, repo.webhook_id);
        } catch { /* Continue even if webhook deletion fails */ }
    }

    await deleteRepo(env, repoId, chatId);
    return {
        text: `${t(lang, 'actions.repoDeleted')}\n\n${t(lang, 'actions.repoDeletedMsg').replace('{repo}', `${repo.owner}/${repo.repo}`)}${repo.webhook_id ? `\n\n${t(lang, 'actions.webhookRemoved')}` : ''}`,
        keyboard: [[{ text: t(lang, 'actions.btnRepos'), callback_data: 'view:repos' }]],
    };
}
