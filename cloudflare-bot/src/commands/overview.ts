import type { HandlerContext } from '../core/router';
import type { Lang } from '../ui/strings';
import { t } from '../ui/strings';
import { getRepoByOwnerRepo, getRepo, upsertRepoOverview } from '../services/db';
import { fetchRepoReadme, fetchRecentMergedPRs } from '../services/github';
import { extractRepoOverview } from '../services/gemini';
import { sendMessage } from '../services/telegram';

export async function overviewCommand(ctx: HandlerContext) {
    const { env, chatId, args } = ctx;
    const lang = (ctx.lang || 'en') as Lang;

    // Check if args is a repo ID (from "Re-bootstrap" button) or owner/repo format
    let owner: string;
    let repo: string;
    let repoId: string;

    if (args && args.includes('/')) {
        // owner/repo format from command
        const parts = args.trim().split('/');
        if (parts.length !== 2 || !parts[0] || !parts[1]) {
            await sendMessage(env, chatId,
                `${t(lang, 'overview.invalidFormat')}\n\n${t(lang, 'overview.usage')}`,
                [[{ text: t(lang, 'common.home'), callback_data: 'view:home' }]]
            );
            return;
        }
        [owner, repo] = parts;

        const watchedRepo = await getRepoByOwnerRepo(env, chatId, owner, repo);
        if (!watchedRepo) {
            await sendMessage(env, chatId,
                `${t(lang, 'overview.notWatched').replace('{repo}', `${owner}/${repo}`)}\n\n${t(lang, 'overview.addFirst')}`,
                [[{ text: t(lang, 'common.home'), callback_data: 'view:home' }]]
            );
            return;
        }
        repoId = watchedRepo.id;
    } else if (args) {
        // Assume it's a repo ID (from Re-bootstrap button)
        const watchedRepo = await getRepo(env, args, chatId);
        if (!watchedRepo) {
            await sendMessage(env, chatId,
                t(lang, 'overview.repoNotFound'),
                [[{ text: t(lang, 'common.home'), callback_data: 'view:home' }]]
            );
            return;
        }
        owner = watchedRepo.owner;
        repo = watchedRepo.repo;
        repoId = watchedRepo.id;
    } else {
        await sendMessage(env, chatId,
            `${t(lang, 'overview.specifyRepo')}\n\n${t(lang, 'overview.usage')}`,
            [[{ text: t(lang, 'common.home'), callback_data: 'view:home' }]]
        );
        return;
    }

    // Send progress message
    const progressMsgId = await sendMessage(env, chatId,
        `${t(lang, 'overview.bootstrapping').replace('{repo}', `${owner}/${repo}`)}\n\n${t(lang, 'overview.fetchingReadme')}`
    );

    try {
        // Fetch README and recent PRs in parallel
        const [readmeText, prSummaries] = await Promise.all([
            fetchRepoReadme(env, owner, repo),
            fetchRecentMergedPRs(env, owner, repo, 10),
        ]);

        // Extract overview via Gemini
        const overview = await extractRepoOverview(env, readmeText, prSummaries, chatId, lang as string);

        // Store in D1
        await upsertRepoOverview(env, repoId, overview);

        // Build preview message
        const lines: string[] = [`${t(lang, 'overview.bootstrapped')}\n`];

        if (overview.summary) {
            lines.push(`${t(lang, 'overview.summary')} ${overview.summary}\n`);
        }
        if (overview.tech_stack) {
            lines.push(`${t(lang, 'overview.techStack')} ${overview.tech_stack}\n`);
        }
        if (overview.key_features.length > 0) {
            lines.push(`${t(lang, 'overview.keyFeatures')} ${overview.key_features.join(', ')}\n`);
        }
        if (overview.target_audience) {
            lines.push(`${t(lang, 'overview.targetAudience')} ${overview.target_audience}\n`);
        }
        if (overview.brand_voice) {
            lines.push(`${t(lang, 'overview.brandVoice')} ${overview.brand_voice}\n`);
        }
        if (overview.visual_theme) {
            lines.push(`${t(lang, 'overview.visualTheme')} ${overview.visual_theme}\n`);
        }

        lines.push(t(lang, 'overview.contextUsed'));

        await sendMessage(env, chatId, lines.join('\n'), [
            [{ text: t(lang, 'common.home'), callback_data: 'view:home' }],
        ]);
    } catch (error) {
        console.error('Overview bootstrap error:', error);
        await sendMessage(env, chatId,
            `${t(lang, 'overview.bootstrapFailed').replace('{repo}', `${owner}/${repo}`)}\n\n${t(lang, 'overview.tryAgain')}`,
            [[{ text: t(lang, 'common.home'), callback_data: 'view:home' }]]
        );
    }
}
