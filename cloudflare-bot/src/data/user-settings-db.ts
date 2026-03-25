/**
 * User Settings Database Operations
 *
 * CRUD for chat state, language, timezone, and page size (all stored in users table).
 */

import type { Env, ChatState, ChatContext } from '../types';

// ==================== CHAT STATE ====================

/**
 * Get chat state, creating if not exists
 */
export async function getChatState(env: Env, chatId: string): Promise<ChatState> {
    const existing = await env.DB.prepare(
        'SELECT chat_id, message_id, current_view, context, timezone, updated_at FROM users WHERE chat_id = ?'
    )
        .bind(chatId)
        .first<ChatState>();

    if (existing) return existing;

    return {
        chat_id: chatId,
        message_id: null,
        current_view: 'home',
        context: null,
        timezone: 'UTC',
        updated_at: new Date().toISOString(),
    };
}

/**
 * Update chat state
 */
export async function updateChatState(
    env: Env,
    chatId: string,
    updates: {
        message_id?: number;
        current_view?: string;
        context?: ChatContext | null;
    }
): Promise<void> {
    const sets: string[] = [];
    const values: (string | number | null)[] = [];

    if (updates.message_id !== undefined) {
        sets.push('message_id = ?');
        values.push(updates.message_id);
    }
    if (updates.current_view !== undefined) {
        sets.push('current_view = ?');
        values.push(updates.current_view);
    }
    if (updates.context !== undefined) {
        sets.push('context = ?');
        values.push(updates.context ? JSON.stringify(updates.context) : null);
    }

    sets.push("updated_at = datetime('now')");
    values.push(chatId);

    await env.DB.prepare(
        `UPDATE users SET ${sets.join(', ')} WHERE chat_id = ?`
    )
        .bind(...values)
        .run();
}

/**
 * Parse context from chat state
 */
export function parseContext(state: ChatState): ChatContext {
    if (!state.context) return {};
    try {
        return JSON.parse(state.context) as ChatContext;
    } catch {
        return {};
    }
}

// ==================== LANGUAGE ====================

/**
 * Get language for a chat (defaults to 'en')
 */
export async function getUserLanguage(env: Env, chatId: string): Promise<'en' | 'he'> {
    const result = await env.DB.prepare('SELECT language FROM users WHERE chat_id = ?')
        .bind(chatId)
        .first<{ language: string | null }>();
    const lang = result?.language;
    return lang === 'he' ? 'he' : 'en';
}

/**
 * Set language for a chat
 */
export async function setUserLanguage(env: Env, chatId: string, lang: 'en' | 'he'): Promise<void> {
    await env.DB.prepare(
        "UPDATE users SET language = ?, updated_at = datetime('now') WHERE chat_id = ?"
    )
        .bind(lang, chatId)
        .run();
}

// ==================== TIMEZONE ====================

/**
 * Get timezone for a chat (defaults to 'UTC')
 */
export async function getTimezone(env: Env, chatId: string): Promise<string> {
    const result = await env.DB.prepare('SELECT timezone FROM users WHERE chat_id = ?')
        .bind(chatId)
        .first<{ timezone: string | null }>();
    return result?.timezone || 'UTC';
}

/**
 * Set timezone for a chat
 */
export async function setTimezone(env: Env, chatId: string, tz: string): Promise<void> {
    await env.DB.prepare(
        "UPDATE users SET timezone = ?, updated_at = datetime('now') WHERE chat_id = ?"
    )
        .bind(tz, chatId)
        .run();
}

// ==================== PAGE SIZE ====================

/**
 * Get page size for a chat (defaults to 5)
 */
export async function getPageSize(env: Env, chatId: string): Promise<number> {
    const result = await env.DB.prepare('SELECT page_size FROM users WHERE chat_id = ?')
        .bind(chatId)
        .first<{ page_size: number | null }>();
    return result?.page_size || 5;
}

/**
 * Set page size for a chat
 */
export async function setPageSize(env: Env, chatId: string, size: number): Promise<void> {
    await env.DB.prepare(
        "UPDATE users SET page_size = ?, updated_at = datetime('now') WHERE chat_id = ?"
    )
        .bind(size, chatId)
        .run();
}

// ==================== REPOST DEFAULTS ====================

export interface RepostDefaults {
    fastGenerateImage: boolean;
    analyzeSourceImage: boolean;
}

/**
 * Get repost default settings for a chat
 */
export async function getRepostDefaults(env: Env, chatId: string): Promise<RepostDefaults> {
    const result = await env.DB.prepare(
        'SELECT fast_generate_image, analyze_source_image FROM users WHERE chat_id = ?'
    )
        .bind(chatId)
        .first<{ fast_generate_image: number | null; analyze_source_image: number | null }>();
    return {
        fastGenerateImage: result?.fast_generate_image === 1,
        analyzeSourceImage: result?.analyze_source_image !== 0, // default ON
    };
}

/**
 * Toggle a repost default setting for a chat
 */
export async function setRepostDefault(
    env: Env,
    chatId: string,
    field: 'fast_generate_image' | 'analyze_source_image',
    value: boolean
): Promise<void> {
    await env.DB.prepare(
        `UPDATE users SET ${field} = ?, updated_at = datetime('now') WHERE chat_id = ?`
    )
        .bind(value ? 1 : 0, chatId)
        .run();
}

// ==================== REPO DEFAULTS ====================

export interface RepoDefaults {
    autoOverview: boolean;
    defaultWatchPushes: boolean;
}

/**
 * Get repo default settings for a chat
 */
export async function getRepoDefaults(env: Env, chatId: string): Promise<RepoDefaults> {
    const result = await env.DB.prepare(
        'SELECT repo_auto_overview, repo_default_watch_pushes FROM users WHERE chat_id = ?'
    )
        .bind(chatId)
        .first<{ repo_auto_overview: number | null; repo_default_watch_pushes: number | null }>();
    return {
        autoOverview: result?.repo_auto_overview === 1,
        defaultWatchPushes: result?.repo_default_watch_pushes !== 0, // default ON
    };
}

/**
 * Toggle a repo default setting for a chat
 */
export async function setRepoDefault(
    env: Env,
    chatId: string,
    field: 'repo_auto_overview' | 'repo_default_watch_pushes',
    value: boolean
): Promise<void> {
    await env.DB.prepare(
        `UPDATE users SET ${field} = ?, updated_at = datetime('now') WHERE chat_id = ?`
    )
        .bind(value ? 1 : 0, chatId)
        .run();
}

// ==================== COMMIT DEFAULTS ====================

export interface CommitDefaults {
    commitFastImage: boolean;
    commitFastAi: boolean;
}

/**
 * Get commit default settings for a chat
 */
export async function getCommitDefaults(env: Env, chatId: string): Promise<CommitDefaults> {
    const result = await env.DB.prepare(
        'SELECT commit_fast_image, commit_fast_ai FROM users WHERE chat_id = ?'
    )
        .bind(chatId)
        .first<{ commit_fast_image: number | null; commit_fast_ai: number | null }>();
    return {
        commitFastImage: result?.commit_fast_image !== 0, // default ON
        commitFastAi: result?.commit_fast_ai !== 0,       // default ON
    };
}

/**
 * Toggle a commit default setting for a chat
 */
export async function setCommitDefault(
    env: Env,
    chatId: string,
    field: 'commit_fast_image' | 'commit_fast_ai',
    value: boolean
): Promise<void> {
    await env.DB.prepare(
        `UPDATE users SET ${field} = ?, updated_at = datetime('now') WHERE chat_id = ?`
    )
        .bind(value ? 1 : 0, chatId)
        .run();
}
