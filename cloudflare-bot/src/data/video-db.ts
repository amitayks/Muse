/**
 * Video Database Operations
 *
 * CRUD for video_drafts, video_published, video_presets tables + video settings + cron helpers.
 * SECURITY: All data operations require and filter by chat_id for ownership verification.
 */

import type { Env, VideoDraft, VideoDraftStatus, VideoPublished, VideoPreset, VideoConfig, VideoSettings } from '../types';

/**
 * Generate a UUID v4
 */
function generateId(): string {
    return crypto.randomUUID();
}

// ==================== VIDEO DRAFTS ====================

/**
 * Create a new video draft
 */
export async function createVideoDraft(
    env: Env,
    chatId: string,
    data: {
        repo_id?: string;
        script?: string;
        caption?: string;
        twitter_caption?: string;
        title?: string;
        config?: string;
        reference_sha?: string;
    }
): Promise<string> {
    const id = generateId();
    await env.DB.prepare(
        `INSERT INTO video_drafts (id, chat_id, repo_id, script, caption, twitter_caption, title, config, reference_sha)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
        .bind(
            id, chatId,
            data.repo_id || null,
            data.script || null,
            data.caption || null,
            data.twitter_caption || null,
            data.title || null,
            data.config || null,
            data.reference_sha || null,
        )
        .run();
    return id;
}

/**
 * Get a video draft by ID — verifies ownership
 */
export async function getVideoDraft(env: Env, id: string, chatId: string): Promise<VideoDraft | null> {
    return env.DB.prepare('SELECT * FROM video_drafts WHERE id = ? AND chat_id = ?')
        .bind(id, chatId)
        .first<VideoDraft>();
}

/**
 * Get video drafts by status for a user
 */
export async function getVideoDraftsByStatus(
    env: Env,
    chatId: string,
    status: VideoDraftStatus,
    limit = 5,
    offset = 0
): Promise<VideoDraft[]> {
    const intLimit = Math.max(1, Math.floor(Number(limit) || 5));
    const intOffset = Math.max(0, Math.floor(Number(offset) || 0));
    const result = await env.DB.prepare(
        'SELECT * FROM video_drafts WHERE chat_id = ? AND status = ? ORDER BY created_at DESC LIMIT ? OFFSET ?'
    )
        .bind(String(chatId), String(status), intLimit, intOffset)
        .all<VideoDraft>();
    return result.results || [];
}

/**
 * Get video drafts for a specific repo
 */
export async function getVideoDraftsByRepo(
    env: Env,
    chatId: string,
    repoId: string,
    status?: VideoDraftStatus,
    limit = 5,
    offset = 0
): Promise<VideoDraft[]> {
    // Coerce limit/offset to integers for D1 type safety
    const intLimit = Math.max(1, Math.floor(Number(limit) || 5));
    const intOffset = Math.max(0, Math.floor(Number(offset) || 0));

    if (status) {
        const result = await env.DB.prepare(
            'SELECT * FROM video_drafts WHERE chat_id = ? AND repo_id = ? AND status = ? ORDER BY created_at DESC LIMIT ? OFFSET ?'
        )
            .bind(String(chatId), String(repoId), String(status), intLimit, intOffset)
            .all<VideoDraft>();
        return result.results || [];
    }
    const result = await env.DB.prepare(
        'SELECT * FROM video_drafts WHERE chat_id = ? AND repo_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?'
    )
        .bind(String(chatId), String(repoId), intLimit, intOffset)
        .all<VideoDraft>();
    return result.results || [];
}

/**
 * Count video drafts by repo and optional status
 */
export async function countVideoDraftsByRepo(
    env: Env,
    chatId: string,
    repoId: string,
    status?: VideoDraftStatus
): Promise<number> {
    if (status) {
        const result = await env.DB.prepare(
            'SELECT COUNT(*) as count FROM video_drafts WHERE chat_id = ? AND repo_id = ? AND status = ?'
        )
            .bind(String(chatId), String(repoId), String(status))
            .first<{ count: number }>();
        return result?.count || 0;
    }
    const result = await env.DB.prepare(
        'SELECT COUNT(*) as count FROM video_drafts WHERE chat_id = ? AND repo_id = ?'
    )
        .bind(String(chatId), String(repoId))
        .first<{ count: number }>();
    return result?.count || 0;
}

/**
 * Update a video draft — verifies ownership
 */
export async function updateVideoDraft(
    env: Env,
    id: string,
    chatId: string,
    updates: Partial<Pick<VideoDraft, 'status' | 'script' | 'caption' | 'twitter_caption' | 'title' | 'config' | 'heygen_video_id' | 'video_url' | 'scheduled_at'>>
): Promise<boolean> {
    const sets: string[] = [];
    const values: (string | null)[] = [];

    for (const [key, val] of Object.entries(updates)) {
        if (val !== undefined) {
            sets.push(`${key} = ?`);
            values.push(val as string | null);
        }
    }

    if (sets.length === 0) return false;

    sets.push("updated_at = datetime('now')");
    values.push(id, chatId);

    const result = await env.DB.prepare(
        `UPDATE video_drafts SET ${sets.join(', ')} WHERE id = ? AND chat_id = ?`
    )
        .bind(...values)
        .run();
    return (result.meta?.changes ?? 0) > 0;
}

/**
 * Delete a video draft — verifies ownership
 */
export async function deleteVideoDraft(env: Env, id: string, chatId: string): Promise<boolean> {
    const result = await env.DB.prepare('DELETE FROM video_drafts WHERE id = ? AND chat_id = ?')
        .bind(id, chatId)
        .run();
    return (result.meta?.changes ?? 0) > 0;
}

/**
 * Get video draft by HeyGen video ID (for webhook callback lookup).
 * INTENTIONALLY UNSCOPED: Called from external HeyGen webhook with opaque UUID.
 * The heygen_video_id is a random UUID that cannot be guessed, providing implicit security.
 */
export async function getVideoDraftByHeygenId(env: Env, heygenVideoId: string): Promise<VideoDraft | null> {
    return env.DB.prepare('SELECT * FROM video_drafts WHERE heygen_video_id = ?')
        .bind(heygenVideoId)
        .first<VideoDraft>();
}

/**
 * Get stale generating video drafts for a specific user (for per-user cron fan-out)
 */
export async function getStaleGeneratingDraftsByUser(env: Env, chatId: string, olderThanMinutes: number): Promise<VideoDraft[]> {
    const result = await env.DB.prepare(
        `SELECT * FROM video_drafts WHERE chat_id = ? AND status = 'generating' AND updated_at <= datetime('now', '-' || ? || ' minutes')`
    )
        .bind(chatId, olderThanMinutes)
        .all<VideoDraft>();
    return result.results || [];
}

/**
 * Get scheduled video drafts for a specific user (for per-user cron fan-out)
 */
export async function getScheduledVideoDraftsByUser(env: Env, chatId: string): Promise<VideoDraft[]> {
    const result = await env.DB.prepare(
        "SELECT * FROM video_drafts WHERE chat_id = ? AND status = 'scheduled' ORDER BY created_at ASC"
    )
        .bind(chatId)
        .all<VideoDraft>();
    return result.results || [];
}

// ==================== VIDEO PUBLISHED ====================

/**
 * Create a video published record
 */
export async function createVideoPublished(
    env: Env,
    chatId: string,
    data: {
        video_draft_id: string;
        repo_id?: string;
        twitter_url?: string;
        instagram_url?: string;
        caption?: string;
    }
): Promise<string> {
    const id = generateId();
    await env.DB.prepare(
        `INSERT INTO video_published (id, chat_id, video_draft_id, repo_id, twitter_url, instagram_url, caption)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
        .bind(id, chatId, data.video_draft_id, data.repo_id || null, data.twitter_url || null, data.instagram_url || null, data.caption || null)
        .run();
    return id;
}

/**
 * Get published videos for a repo
 */
export async function getVideoPublishedByRepo(
    env: Env,
    chatId: string,
    repoId: string,
    limit = 5,
    offset = 0
): Promise<VideoPublished[]> {
    const result = await env.DB.prepare(
        'SELECT * FROM video_published WHERE chat_id = ? AND repo_id = ? ORDER BY published_at DESC LIMIT ? OFFSET ?'
    )
        .bind(chatId, repoId, limit, offset)
        .all<VideoPublished>();
    return result.results || [];
}

// ==================== VIDEO PRESETS ====================

/**
 * Create a video preset
 */
export async function createVideoPreset(env: Env, chatId: string, name: string, config: VideoConfig): Promise<string> {
    const id = generateId();
    await env.DB.prepare(
        'INSERT INTO video_presets (id, chat_id, name, config) VALUES (?, ?, ?, ?)'
    )
        .bind(id, chatId, name, JSON.stringify(config))
        .run();
    return id;
}

/**
 * Get all presets for a user
 */
export async function getVideoPresets(env: Env, chatId: string): Promise<VideoPreset[]> {
    const result = await env.DB.prepare(
        'SELECT * FROM video_presets WHERE chat_id = ? ORDER BY created_at DESC'
    )
        .bind(chatId)
        .all<VideoPreset>();
    return result.results || [];
}

/**
 * Delete a video preset — verifies ownership
 */
export async function deleteVideoPreset(env: Env, id: string, chatId: string): Promise<boolean> {
    const result = await env.DB.prepare('DELETE FROM video_presets WHERE id = ? AND chat_id = ?')
        .bind(id, chatId)
        .run();
    return (result.meta?.changes ?? 0) > 0;
}

// ==================== VIDEO CRON HELPERS ====================

/**
 * Get the most recent published video for a repo (for "since last video" range)
 */
export async function getLastPublishedVideoForRepo(
    env: Env,
    chatId: string,
    repoId: string
): Promise<VideoPublished | null> {
    return env.DB.prepare(
        'SELECT * FROM video_published WHERE chat_id = ? AND repo_id = ? ORDER BY published_at DESC LIMIT 1'
    )
        .bind(chatId, repoId)
        .first<VideoPublished>();
}

/**
 * Get video drafts by status for cron processing (no chat_id filter)
 */
export async function getVideoDraftsByStatusForCron(env: Env, status: VideoDraftStatus): Promise<VideoDraft[]> {
    const result = await env.DB.prepare(
        'SELECT * FROM video_drafts WHERE status = ? ORDER BY created_at ASC'
    )
        .bind(status)
        .all<VideoDraft>();
    return result.results || [];
}

/**
 * Get stale generating drafts (for cron timeout fallback)
 */
export async function getStaleGeneratingDrafts(env: Env, olderThanMinutes: number): Promise<VideoDraft[]> {
    const result = await env.DB.prepare(
        `SELECT * FROM video_drafts WHERE status = 'generating' AND updated_at <= datetime('now', '-' || ? || ' minutes')`
    )
        .bind(olderThanMinutes)
        .all<VideoDraft>();
    return result.results || [];
}

// ==================== VIDEO SETTINGS ====================

/**
 * Get video settings for a chat (characters, looks, defaults)
 */
export async function getVideoSettings(env: Env, chatId: string): Promise<VideoSettings> {
    const { DEFAULT_VIDEO_SETTINGS } = await import('../types');
    try {
        const row = await env.DB.prepare('SELECT video_settings FROM users WHERE chat_id = ?')
            .bind(chatId)
            .first<{ video_settings: string | null }>();
        if (row?.video_settings) {
            return { ...DEFAULT_VIDEO_SETTINGS, ...JSON.parse(row.video_settings) };
        }
    } catch {
        // Column may not exist yet
    }
    return DEFAULT_VIDEO_SETTINGS;
}

/**
 * Update video settings for a chat
 */
export async function updateVideoSettings(env: Env, chatId: string, settings: VideoSettings): Promise<void> {
    await env.DB.prepare(
        `UPDATE users SET video_settings = ?, updated_at = datetime('now') WHERE chat_id = ?`
    )
        .bind(JSON.stringify(settings), chatId)
        .run();
}
