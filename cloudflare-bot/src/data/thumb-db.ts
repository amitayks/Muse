/**
 * Thumbnail Database Operations
 *
 * CRUD for thumb_drafts table.
 * SECURITY: All data operations require and filter by chat_id for ownership verification.
 */

import type { Env, ThumbDraft } from '../types';

function generateId(): string {
    return crypto.randomUUID();
}

export async function createThumbDraft(
    env: Env,
    chatId: string,
    data: {
        title: string;
        color: string;
        icons: string;
        ratio: string;
        source_image_key?: string | null;
        result_image_key?: string | null;
    },
): Promise<string> {
    const id = generateId();
    await env.DB.prepare(
        `INSERT INTO thumb_drafts (id, chat_id, title, color, icons, ratio, source_image_key, result_image_key)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
        .bind(
            id, chatId,
            data.title, data.color, data.icons, data.ratio,
            data.source_image_key || null,
            data.result_image_key || null,
        )
        .run();
    return id;
}

export async function getThumbDraft(env: Env, id: string, chatId: string): Promise<ThumbDraft | null> {
    return env.DB.prepare('SELECT * FROM thumb_drafts WHERE id = ? AND chat_id = ?')
        .bind(id, chatId)
        .first<ThumbDraft>();
}

export async function getThumbDrafts(
    env: Env,
    chatId: string,
    limit = 5,
    offset = 0,
): Promise<ThumbDraft[]> {
    const result = await env.DB.prepare(
        'SELECT * FROM thumb_drafts WHERE chat_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?',
    )
        .bind(chatId, limit, offset)
        .all<ThumbDraft>();
    return result.results || [];
}

export async function countThumbDrafts(env: Env, chatId: string): Promise<number> {
    const row = await env.DB.prepare(
        'SELECT COUNT(*) as count FROM thumb_drafts WHERE chat_id = ?',
    )
        .bind(chatId)
        .first<{ count: number }>();
    return row?.count ?? 0;
}

export async function deleteThumbDraft(env: Env, id: string, chatId: string): Promise<boolean> {
    const result = await env.DB.prepare(
        'DELETE FROM thumb_drafts WHERE id = ? AND chat_id = ?',
    )
        .bind(id, chatId)
        .run();
    return (result.meta?.changes ?? 0) > 0;
}
