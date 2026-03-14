/**
 * Edit Compose Action — Handler for action:edit_compose:EVENT_ID
 *
 * Called when user clicks [✏️ Edit] on a commit event notification.
 * Loads event data from commit_events, builds ComposeSourceCommit,
 * and enters compose mode with commit context.
 */

import type { HandlerContext } from '../core/router';
import type { ViewResult, ContentSource, ComposeSourceCommit } from '../types';
import type { Lang } from '../ui/strings';
import { t } from '../ui/strings';
import { getRepoByOwnerRepo } from '../data/db';
import { getCommitEvent } from '../data/commit-events-db';
import { getCommitDefaults } from '../data/user-settings-db';
import { enterComposeMode } from './compose-init';
import { renderError } from '../views';
import { logError } from '../infra/security';

export async function editComposeAction(ctx: HandlerContext & { extra?: string }): Promise<ViewResult | void> {
    const lang = (ctx.lang || 'en') as Lang;
    const eventId = ctx.extra!;

    // Load commit event
    const event = await getCommitEvent(ctx.env, ctx.chatId, eventId);
    if (!event) return renderError(t(lang, 'error.commitEventNotFound'), lang);

    // Parse source_data to get commit/PR details
    let sourceCommit: ComposeSourceCommit;
    try {
        const contentSource: ContentSource = JSON.parse(event.source_data);
        sourceCommit = buildComposeSourceFromEvent(event, contentSource);
    } catch (parseError) {
        logError('Failed to parse event source_data:', parseError);
        return renderError(t(lang, 'error.commitSourceParseFailed'), lang);
    }

    // Try to resolve repoId from the repo full name
    if (sourceCommit.repo) {
        const [owner, repo] = sourceCommit.repo.split('/');
        if (owner && repo) {
            const watchedRepo = await getRepoByOwnerRepo(ctx.env, ctx.chatId, owner, repo);
            if (watchedRepo) sourceCommit.repoId = watchedRepo.id;
        }
    }

    // Read user commit defaults for compose toggles
    const defaults = await getCommitDefaults(ctx.env, ctx.chatId);

    // Enter compose mode with commit context
    await enterComposeMode(ctx.env, ctx.chatId, lang, {
        mode: 'commit',
        sourceCommit,
        eventId: event.id,
        existingDraftId: event.draft_id || undefined,
        imageGen: defaults.commitFastImage,
        aiRefine: defaults.commitFastAi,
    });
}

/** Build ComposeSourceCommit from a CommitEvent + parsed ContentSource */
function buildComposeSourceFromEvent(
    event: import('../data/commit-events-db').CommitEvent,
    source: ContentSource,
): ComposeSourceCommit {
    const repoShort = source.repo ? source.repo.split('/')[1] || source.repo : '';

    return {
        type: event.event_type === 'pr' ? 'pr' : 'commit',
        repo: source.repo || '',
        repoShort,
        title: event.title,
        prNumber: event.pr_number || undefined,
        commitSha: event.commit_sha,
        commitMessages: source.data.commitMessages,
        fileNames: source.data.fileNames,
        filesChanged: event.files_changed,
        additions: event.additions,
        deletions: event.deletions,
        author: event.author,
    };
}
