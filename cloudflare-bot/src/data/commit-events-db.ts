/**
 * Commit Events Database Operations
 *
 * CRUD for the commit_events table — stores webhook and /generate events
 * before any AI generation. Parallel to twitter_tweets for the repost flow.
 */

import type { Env } from '../types';

export interface CommitEvent {
    id: string;
    repo_id: string;
    chat_id: string;
    event_type: string; // 'pr' | 'push'
    commit_sha: string;
    pr_number: number | null;
    title: string;
    author: string;
    branch: string;
    files_changed: number;
    additions: number;
    deletions: number;
    commit_count: number;
    source_data: string; // JSON ContentSource
    status: string; // 'notified' | 'drafted' | 'skipped'
    draft_id: string | null;
    message_id: number | null;
    event_at: string | null;
    created_at: string;
}

export interface CreateCommitEventParams {
    repoId: string;
    chatId: string;
    eventType: string;
    commitSha: string;
    prNumber?: number;
    title: string;
    author: string;
    branch: string;
    filesChanged?: number;
    additions?: number;
    deletions?: number;
    commitCount?: number;
    sourceData: string;
    eventAt?: string;
}

/**
 * Create a new commit event
 */
export async function createCommitEvent(env: Env, params: CreateCommitEventParams): Promise<string> {
    const id = crypto.randomUUID();

    await env.DB.prepare(
        `INSERT INTO commit_events (id, repo_id, chat_id, event_type, commit_sha, pr_number, title, author, branch, files_changed, additions, deletions, commit_count, source_data, event_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
        .bind(
            id,
            params.repoId,
            params.chatId,
            params.eventType,
            params.commitSha,
            params.prNumber ?? null,
            params.title,
            params.author,
            params.branch,
            params.filesChanged ?? 0,
            params.additions ?? 0,
            params.deletions ?? 0,
            params.commitCount ?? 1,
            params.sourceData,
            params.eventAt ?? null,
        )
        .run();

    return id;
}

/**
 * Get a commit event by ID, verifying chat_id ownership
 */
export async function getCommitEvent(env: Env, chatId: string, eventId: string): Promise<CommitEvent | null> {
    return env.DB.prepare(
        'SELECT * FROM commit_events WHERE id = ? AND chat_id = ?'
    )
        .bind(eventId, chatId)
        .first<CommitEvent>();
}

/**
 * Get a commit event by commit SHA for deduplication
 */
export async function getCommitEventByCommitSha(env: Env, chatId: string, commitSha: string): Promise<CommitEvent | null> {
    return env.DB.prepare(
        'SELECT * FROM commit_events WHERE chat_id = ? AND commit_sha = ?'
    )
        .bind(chatId, commitSha)
        .first<CommitEvent>();
}

/**
 * Update a commit event (partial updates)
 */
export async function updateCommitEvent(
    env: Env,
    eventId: string,
    updates: { status?: string; draftId?: string; messageId?: number }
): Promise<void> {
    const sets: string[] = [];
    const values: (string | number)[] = [];

    if (updates.status !== undefined) {
        sets.push('status = ?');
        values.push(updates.status);
    }
    if (updates.draftId !== undefined) {
        sets.push('draft_id = ?');
        values.push(updates.draftId);
    }
    if (updates.messageId !== undefined) {
        sets.push('message_id = ?');
        values.push(updates.messageId);
    }

    if (sets.length === 0) return;

    values.push(eventId);
    await env.DB.prepare(
        `UPDATE commit_events SET ${sets.join(', ')} WHERE id = ?`
    )
        .bind(...values)
        .run();
}
