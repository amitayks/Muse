/**
 * GitHub Webhook Handler - Process incoming webhook events
 *
 * Deferred generation model: webhook creates a commit_event row and sends
 * a notification with [⚡ Fast] [✏️ Edit] buttons. No AI generation happens here.
 *
 * Per-user webhook verification: looks up all repos matching owner/repo,
 * tries each row's webhook_secret to identify the owning user,
 * then hydrates env with the user's API keys for processing.
 */

import type { Env, GitHubPullRequestEvent, GitHubPushEvent, ContentSource } from '../types';
import type { Lang } from '../ui/strings';
import { getAllReposByOwnerRepo, parseRepoConfig, getUserLanguage } from '../data/db';
import { createCommitEvent, getCommitEventByCommitSha, updateCommitEvent } from '../data/commit-events-db';
import { verifyWebhookSignature } from '../integrations/webhook';
import { getPR } from '../integrations/github';
import { sendMessage } from '../integrations/telegram';
import { renderEventSummary, renderEventButtons } from '../views/commit-events';
import { hydrateEnv } from '../data/user-keys';
import { logInfo, logError } from '../infra/security';

interface WebhookResult {
    processed: boolean;
    message: string;
}

/**
 * Handle incoming GitHub webhook
 * Verifies signature per-repo, hydrates env with user's keys
 */
export async function handleGitHubWebhook(
    env: Env,
    request: Request
): Promise<WebhookResult> {
    const signature = request.headers.get('X-Hub-Signature-256') || '';
    const event = request.headers.get('X-GitHub-Event') || '';

    const body = await request.text();

    // Parse payload first to get owner/repo for per-repo secret lookup
    let payload: any;
    try {
        payload = JSON.parse(body);
    } catch {
        return { processed: false, message: 'Invalid JSON payload' };
    }

    const repoFullName = payload.repository?.full_name;
    if (!repoFullName) {
        return { processed: false, message: 'No repository in payload' };
    }

    const [owner, repo] = repoFullName.split('/');

    // Look up all repos matching this owner/repo and verify signature against each
    const candidateRepos = await getAllReposByOwnerRepo(env, owner, repo);
    if (candidateRepos.length === 0) {
        return { processed: false, message: 'Repo not watched' };
    }

    // Try each repo's webhook_secret until one verifies
    let matchedRepo = null;
    for (const candidate of candidateRepos) {
        if (!candidate.webhook_secret) continue;
        const isValid = await verifyWebhookSignature(candidate.webhook_secret, body, signature);
        if (isValid) {
            matchedRepo = candidate;
            break;
        }
    }

    if (!matchedRepo) {
        return { processed: false, message: 'Invalid signature' };
    }

    logInfo(`Received GitHub webhook: ${event} for ${repoFullName} (user: ${matchedRepo.chat_id})`);

    const config = parseRepoConfig(matchedRepo);
    const chatId = matchedRepo.chat_id;

    // Hydrate env with the repo owner's API keys
    const userEnv = await hydrateEnv(env, chatId);

    switch (event) {
        case 'pull_request':
            if (config.watchPRs) {
                return handlePullRequestEvent(userEnv, chatId, payload as GitHubPullRequestEvent, config, matchedRepo.id);
            }
            return { processed: false, message: 'PR watching disabled for this repo' };

        case 'push':
            if (config.watchPushes) {
                return handlePushEvent(userEnv, chatId, payload as GitHubPushEvent, config, matchedRepo.id);
            }
            return { processed: false, message: 'Push watching disabled for this repo' };

        default:
            return { processed: false, message: `Unhandled event: ${event}` };
    }
}

/**
 * Handle pull_request event — create commit_event and send notification
 */
async function handlePullRequestEvent(
    env: Env,
    chatId: string,
    event: GitHubPullRequestEvent,
    config: ReturnType<typeof parseRepoConfig>,
    repoId: string
): Promise<WebhookResult> {
    if (event.action !== 'closed' || !event.pull_request.merged) {
        logInfo(`Ignoring PR event: action=${event.action}, merged=${event.pull_request.merged}`);
        return { processed: false, message: 'Not a merged PR' };
    }

    const targetBranch = event.pull_request.base.ref;
    if (!config.branches.includes(targetBranch)) {
        logInfo(`Ignoring PR merged to non-watched branch: ${targetBranch}`);
        return { processed: false, message: `Branch ${targetBranch} not watched` };
    }

    const pr = event.pull_request;
    const repoFullName = event.repository.full_name;

    logInfo(`Processing merged PR #${pr.number}: ${pr.title} in ${repoFullName}`);

    // Dedup check via commit_events
    const existing = await getCommitEventByCommitSha(env, chatId, pr.head.sha);
    if (existing) {
        logInfo(`Commit event already exists for ${pr.head.sha.slice(0, 7)}, skipping`);
        return { processed: true, message: `Event already exists for PR #${pr.number}` };
    }

    try {
        // Enrich with full PR data from GitHub API
        const prData = await getPR(env, repoFullName, pr.number);
        const userLang = await getUserLanguage(env, chatId);

        const contentSource: ContentSource = {
            type: 'pr',
            data: prData,
            repo: repoFullName,
        };

        // Create commit event (no AI, no draft)
        const eventId = await createCommitEvent(env, {
            repoId,
            chatId,
            eventType: 'pr',
            commitSha: pr.head.sha,
            prNumber: pr.number,
            title: pr.title,
            author: pr.user.login,
            branch: targetBranch,
            filesChanged: prData.files_changed,
            additions: prData.additions,
            deletions: prData.deletions,
            commitCount: prData.commits.length,
            sourceData: JSON.stringify(contentSource),
            eventAt: pr.merged_at || undefined,
        });

        // Send notification with [⚡ Fast] [✏️ Edit] buttons
        try {
            const messageId = await sendEventNotification(
                env, chatId, 'pr', pr.number, pr.title, repoFullName, prData.author,
                prData.files_changed, prData.additions, prData.deletions,
                prData.commits.length, eventId, null, userLang as Lang,
            );
            await updateCommitEvent(env, eventId, { messageId });
        } catch (notifyError) {
            logError('Telegram notification failed (event saved):', notifyError);
        }

        return { processed: true, message: `Created event for PR #${pr.number}` };
    } catch (error) {
        logError('Error processing PR webhook:', error);
        return { processed: false, message: String(error) };
    }
}

/**
 * Handle push event — create commit_event and send notification
 */
async function handlePushEvent(
    env: Env,
    chatId: string,
    event: GitHubPushEvent,
    config: ReturnType<typeof parseRepoConfig>,
    repoId: string
): Promise<WebhookResult> {
    const refParts = event.ref.split('/');
    const branch = refParts[refParts.length - 1];

    if (!config.branches.includes(branch)) {
        logInfo(`Ignoring push to non-watched branch: ${branch}`);
        return { processed: false, message: `Branch ${branch} not watched` };
    }

    if (!event.head_commit) {
        return { processed: false, message: 'No head commit in push' };
    }

    const repoFullName = event.repository.full_name;
    const commit = event.head_commit;

    logInfo(`Processing push to ${branch}: ${commit.message.split('\n')[0]}`);

    // Dedup check via commit_events
    const existing = await getCommitEventByCommitSha(env, chatId, commit.id);
    if (existing) {
        logInfo(`Commit event already exists for ${commit.id.slice(0, 7)}, skipping`);
        return { processed: true, message: `Event already exists for push ${commit.id.slice(0, 7)}` };
    }

    try {
        const commitMessages = event.commits.map(c => c.message.split('\n')[0]);

        const fileSet = new Set<string>();
        for (const c of event.commits) {
            for (const f of [...c.added, ...c.modified, ...c.removed]) {
                fileSet.add(f);
            }
        }
        const fileNames = Array.from(fileSet);
        const totalFiles = fileNames.length;

        const contentSource: ContentSource = {
            type: 'commit',
            repo: repoFullName,
            data: {
                sha: commit.id,
                title: commit.message.split('\n')[0],
                body: commit.message.split('\n').slice(1).join('\n').trim(),
                commitMessages,
                fileNames,
                files_changed: totalFiles,
                additions: 0,
                deletions: 0,
                author: commit.author.username || commit.author.name,
                date: commit.timestamp || new Date().toISOString(),
            },
        };

        const pushUserLang = await getUserLanguage(env, chatId);

        // Create commit event (no AI, no draft)
        const eventId = await createCommitEvent(env, {
            repoId,
            chatId,
            eventType: 'push',
            commitSha: commit.id,
            title: commit.message.split('\n')[0],
            author: commit.author.username || commit.author.name,
            branch,
            filesChanged: totalFiles,
            additions: 0,
            deletions: 0,
            commitCount: event.commits.length,
            sourceData: JSON.stringify(contentSource),
            eventAt: commit.timestamp || undefined,
        });

        // Send notification with [⚡ Fast] [✏️ Edit] buttons
        try {
            const messageId = await sendEventNotification(
                env, chatId, 'push', event.commits.length, commit.message.split('\n')[0],
                repoFullName, commit.author.username || commit.author.name,
                totalFiles, 0, 0, event.commits.length, eventId, null, pushUserLang as Lang,
            );
            await updateCommitEvent(env, eventId, { messageId });
        } catch (notifyError) {
            logError('Telegram notification failed (event saved):', notifyError);
        }

        return { processed: true, message: `Created event for push ${commit.id.slice(0, 7)}` };
    } catch (error) {
        logError('Error processing push webhook:', error);
        return { processed: false, message: String(error) };
    }
}

/**
 * Send Telegram notification for a commit event (no draft, no AI content)
 * Returns the message_id for edit-in-place tracking.
 */
async function sendEventNotification(
    env: Env,
    chatId: string,
    eventType: 'pr' | 'push',
    number: number,
    title: string,
    repo: string,
    author: string,
    filesChanged: number,
    additions: number,
    deletions: number,
    commitCount: number,
    eventId: string,
    draftId: string | null,
    lang: Lang = 'en'
): Promise<number> {
    const text = renderEventSummary(eventType, number, title, repo, author, filesChanged, additions, deletions, commitCount, lang);
    const keyboard = renderEventButtons(eventId, draftId, lang);
    return sendMessage(env, chatId, text, keyboard);
}
