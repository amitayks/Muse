/**
 * Image Create Database Operations
 *
 * CRUD for image_drafts table.
 * SECURITY: All data operations require and filter by chat_id for ownership verification.
 */

import type { Env, ImageDraft } from '../types';

function generateId(): string {
    return crypto.randomUUID();
}

export async function createImageDraft(
    env: Env,
    chatId: string,
    data: {
        prompt: string;
        source_image_key?: string | null;
        source_image_keys?: string[] | null;
        result_image_key?: string | null;
    },
): Promise<string> {
    const id = generateId();
    const keys = data.source_image_keys && data.source_image_keys.length > 0 ? data.source_image_keys : null;
    // Retain the first key in the legacy single-value column for back-compat.
    const firstKey = keys ? keys[0] : (data.source_image_key || null);
    await env.DB.prepare(
        `INSERT INTO image_drafts (id, chat_id, prompt, source_image_key, source_image_keys, result_image_key)
         VALUES (?, ?, ?, ?, ?, ?)`,
    )
        .bind(
            id, chatId,
            data.prompt,
            firstKey,
            keys ? JSON.stringify(keys) : null,
            data.result_image_key || null,
        )
        .run();
    return id;
}

export async function getImageDraft(env: Env, id: string, chatId: string): Promise<ImageDraft | null> {
    return env.DB.prepare('SELECT * FROM image_drafts WHERE id = ? AND chat_id = ?')
        .bind(id, chatId)
        .first<ImageDraft>();
}

export async function getImageDrafts(
    env: Env,
    chatId: string,
    limit = 5,
    offset = 0,
): Promise<ImageDraft[]> {
    const result = await env.DB.prepare(
        'SELECT * FROM image_drafts WHERE chat_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?',
    )
        .bind(chatId, limit, offset)
        .all<ImageDraft>();
    return result.results || [];
}

export async function countImageDrafts(env: Env, chatId: string): Promise<number> {
    const row = await env.DB.prepare(
        'SELECT COUNT(*) as count FROM image_drafts WHERE chat_id = ?',
    )
        .bind(chatId)
        .first<{ count: number }>();
    return row?.count ?? 0;
}

export async function deleteImageDraft(env: Env, id: string, chatId: string): Promise<boolean> {
    const result = await env.DB.prepare(
        'DELETE FROM image_drafts WHERE id = ? AND chat_id = ?',
    )
        .bind(id, chatId)
        .run();
    return (result.meta?.changes ?? 0) > 0;
}
