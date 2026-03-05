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
