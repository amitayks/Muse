/**
 * Commit SHA Input Handler — processes user's commit SHA or PR number
 *
 * Deferred generation model: fetches content source from GitHub,
 * creates a commit_event, and shows event summary with [⚡ Fast] [✏️ Edit] buttons.
 * No AI generation happens here.
 */

import type { HandlerContext } from '../core/router';
import type { ChatContext, ContentSource } from '../types';
import type { Lang } from '../ui/strings';
import { t } from '../ui/strings';
import { updateChatState, getRepoByOwnerRepo } from '../data/db';
import { createCommitEvent, getCommitEventByCommitSha, updateCommitEvent } from '../data/commit-events-db';
import { getContentSource, GitHubTokenMissingError } from '../integrations/github';
import { sendMessage, editMessage } from '../integrations/telegram';
import { renderEventSummary, renderEventButtons } from '../views/commit-events';
import { renderGenerating } from '../views';
import { cancelRow } from '../ui/components';
import { sanitizeError } from '../infra/security';

export async function commitShaInput(ctx: HandlerContext & { text: string; context: ChatContext }) {
    const { env, chatId, text: sha } = ctx;
    const lang = (ctx.lang || 'en') as Lang;

    const genView = renderGenerating(sha, lang);
    const genMessageId = await sendMessage(env, chatId, genView.text, genView.keyboard);

    try {
        const source = await getContentSource(env, sha);
        const commitSha = source.type === 'pr' ? source.data.commits[0] || sha : source.data.sha;

        // Dedup check: if event already exists for this SHA, show it
        const existingEvent = await getCommitEventByCommitSha(env, chatId, commitSha);
        if (existingEvent) {
            const eventType = existingEvent.event_type as 'pr' | 'push';
            const number = eventType === 'pr' ? (existingEvent.pr_number || 0) : existingEvent.commit_count;
            const repoName = source.repo || '';

            const text = renderEventSummary(
                eventType, number, existingEvent.title, repoName,
                existingEvent.author, existingEvent.files_changed,
                existingEvent.additions, existingEvent.deletions,
                existingEvent.commit_count, lang,
            );
            const keyboard = renderEventButtons(existingEvent.id, existingEvent.draft_id, lang);

            await editMessage(env, chatId, genMessageId, text, keyboard);
            await updateChatState(env, chatId, { context: null });
            return;
        }

        // Look up repo ID for the event
        let repoId = '';
        if (source.repo) {
            const [owner, repo] = source.repo.split('/');
            if (owner && repo) {
                const watchedRepo = await getRepoByOwnerRepo(env, chatId, owner, repo);
                if (watchedRepo) repoId = watchedRepo.id;
            }
        }

        // Build event params — normalize 'commit' to 'push' to match webhook convention
        const eventType = source.type === 'pr' ? 'pr' : 'push';
        const prNumber = source.type === 'pr' ? source.data.number : 0;
        const title = source.type === 'pr' ? source.data.title : source.data.title;
        const author = source.data.author;
        const filesChanged = source.data.files_changed;
        const additions = source.data.additions;
        const deletions = source.data.deletions;
        const commitCount = source.type === 'pr' ? source.data.commits.length : 1;

        // Create commit event
        const eventId = await createCommitEvent(env, {
            repoId,
            chatId,
            eventType,
            commitSha,
            prNumber: prNumber || undefined,
            title,
            author,
            branch: '',
            filesChanged,
            additions,
            deletions,
            commitCount,
            sourceData: JSON.stringify(source),
        });

        // Show event summary with [⚡ Fast] [✏️ Edit] buttons
        const number = eventType === 'pr' ? prNumber : commitCount;
        const text = renderEventSummary(
            eventType, number, title, source.repo || '', author,
            filesChanged, additions, deletions, commitCount, lang,
        );
        const keyboard = renderEventButtons(eventId, null, lang);

        await editMessage(env, chatId, genMessageId, text, keyboard);

        // Store message_id on event for edit-in-place
        await updateCommitEvent(env, eventId, { messageId: genMessageId });

        // Clear awaiting_input
        await updateChatState(env, chatId, { context: null });
    } catch (error) {
        console.error('Generate error:', sanitizeError(error));

        let errorText: string;
        if (error instanceof GitHubTokenMissingError) {
            errorText = t(lang, 'error.githubTokenMissing');
        } else {
            errorText = t(lang, 'error.commitFetchFailed').replace('{sha}', sha.substring(0, 7));
        }

        // Keep awaiting_input so user can retry with a different SHA
        await editMessage(env, chatId, genMessageId,
            errorText,
            [cancelRow('view:home', lang)]
        );
    }
}
