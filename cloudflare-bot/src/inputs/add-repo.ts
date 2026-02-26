import type { HandlerContext } from '../core/router';
import type { ChatContext } from '../types';
import type { Lang } from '../ui/strings';
import { t } from '../ui/strings';
import { respond } from '../core/respond';
import { updateChatState, createRepo, getRepoByOwnerRepo, updateRepo, upsertRepoOverview } from '../services/db';
import { validateRepo, fetchRepoReadme, fetchRecentMergedPRs } from '../services/github';
import { createWebhook } from '../services/webhook';
import { sendMessage } from '../services/telegram';
import { extractRepoOverview } from '../services/gemini';
import { renderRepoDetail, renderError } from '../views';
import { sanitizeError, logInfo, logError } from '../services/security';

export async function addRepoInput(ctx: HandlerContext & { text: string; context: ChatContext }) {
    const { env, chatId, text: input } = ctx;
    const lang = ((ctx as any).lang || 'en') as Lang;
    await updateChatState(env, chatId, { context: null });

    const parts = input.trim().split('/');
    if (parts.length !== 2) {
        const view = {
            text: `${t(lang, 'addRepo.invalidFormat')}\n\n${t(lang, 'addRepo.invalidFormatMsg')}\n\n${t(lang, 'common.example')} <code>${t(lang, 'repos.addRepoExample')}</code>`,
            keyboard: [[{ text: t(lang, 'addRepo.btnTryAgain'), callback_data: 'action:add_repo' }]],
        };
        const messageId = await sendMessage(env, chatId, view.text, view.keyboard);
        await updateChatState(env, chatId, { message_id: messageId, current_view: 'repos' });
        return;
    }

    const [owner, repo] = parts;

    try {
        const existing = await getRepoByOwnerRepo(env, chatId, owner, repo);
        if (existing) {
            const view = await renderRepoDetail(env, chatId, existing.id, lang);
            const messageId = await sendMessage(
                env,
                chatId,
                `${t(lang, 'addRepo.alreadyWatching')}\n\n${t(lang, 'addRepo.alreadyWatchingMsg').replace('{repo}', `${owner}/${repo}`)}\n\n${view.text}`,
                view.keyboard
            );
            await updateChatState(env, chatId, {
                message_id: messageId,
                current_view: 'repo',
                context: { selected_repo_id: existing.id },
            });
            return;
        }

        const isValid = await validateRepo(env, owner, repo);
        if (!isValid) {
            const view = {
                text: `${t(lang, 'addRepo.repoNotFoundTitle')}\n\n${t(lang, 'addRepo.repoNotFoundMsg').replace('{repo}', `${owner}/${repo}`)}`,
                keyboard: [[{ text: t(lang, 'addRepo.btnTryAgain'), callback_data: 'action:add_repo' }]],
            };
            const messageId = await sendMessage(env, chatId, view.text, view.keyboard);
            await updateChatState(env, chatId, { message_id: messageId, current_view: 'repos' });
            return;
        }

        const webhookSecret = crypto.randomUUID();
        const repoId = await createRepo(env, chatId, { owner, repo, webhook_secret: webhookSecret });

        const workerUrl = env.WORKER_URL;
        let webhookStatus = '';
        if (!workerUrl) {
            webhookStatus = `\n\n${t(lang, 'addRepo.workerUrlNotConfigured')}`;
        } else {
            const webhookId = await createWebhook(env, owner, repo, workerUrl, webhookSecret);

            if (webhookId) {
                await updateRepo(env, repoId, chatId, { webhook_id: webhookId });
                webhookStatus = `\n\n${t(lang, 'addRepo.webhookCreated')}`;
            } else {
                webhookStatus = `\n\n${t(lang, 'addRepo.webhookFailed')}`;
            }
        }

        const view = await renderRepoDetail(env, chatId, repoId, lang);
        const messageId = await sendMessage(
            env,
            chatId,
            `${t(lang, 'addRepo.repoAdded')}\n\n${t(lang, 'addRepo.repoAddedMsg').replace('{repo}', `${owner}/${repo}`)}${webhookStatus}\n\n${view.text}`,
            view.keyboard
        );
        await updateChatState(env, chatId, {
            message_id: messageId,
            current_view: 'repo',
            context: { selected_repo_id: repoId },
        });

        // Auto-generate overview in the background (non-blocking)
        try {
            await sendMessage(env, chatId,
                t(lang, 'addRepo.bootstrapping').replace('{repo}', `${owner}/${repo}`)
            );
            const [readmeText, prSummaries] = await Promise.all([
                fetchRepoReadme(env, owner, repo),
                fetchRecentMergedPRs(env, owner, repo, 10),
            ]);
            const overview = await extractRepoOverview(env, readmeText, prSummaries, chatId, lang);
            await upsertRepoOverview(env, repoId, overview);
            logInfo('Auto-generated overview for repo:', owner + '/' + repo);
            await sendMessage(env, chatId,
                t(lang, 'addRepo.overviewBootstrapped').replace('{repo}', `${owner}/${repo}`),
                [[{ text: t(lang, 'addRepo.btnViewRepo'), callback_data: `repo:${repoId}` }]]
            );
        } catch (overviewError) {
            logError('Auto-overview generation failed:', overviewError instanceof Error ? overviewError.message : String(overviewError));
            await sendMessage(env, chatId,
                t(lang, 'addRepo.overviewFailed').replace(/\{repo\}/g, `${owner}/${repo}`),
                [[{ text: t(lang, 'addRepo.btnViewRepo'), callback_data: `repo:${repoId}` }]]
            );
        }
    } catch (error) {
        console.error('Error adding repo:', sanitizeError(error));
        await respond(env, chatId, renderError(t(lang, 'addRepo.addFailed'), lang));
    }
}
